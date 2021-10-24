import type {
  ServerSession, HttpResponse, Creditor, PinInfo, Wallet, Account, LogEntriesPage
} from './server'
import type {
  LogObjectRecord, AccountLedgerRecord, TransferRecord, ObjectUpdateInfo
} from './db'
import type {
  PinInfoV0, CreditorV0, WalletV0, AccountV0, TransferV0, LogEntryV0, TransferResultV0, LogObject
} from './canonical-objects'

import { HttpError } from './server'
import { db, splitIntoRecords, MAX_INT64 } from './db'
import {
  makeCreditor, makePinInfo, makeAccount, makeWallet, makeLogObject, makeLogEntriesPage,
  getCanonicalType,
} from './canonical-objects'
import {
  iterAccountsList, iterTransfers, calcParallelTimeout, fetchNewLedgerEntries
} from './utils'

export class BrokenLogStream extends Error {
  name = 'BrokenLogStream'
}

/* Returns the user ID corresponding to the given `entrypoint`. If the
 * user does not exist or some log entries have been lost, tries to
 * create/reset the user, reading the user's data from the server. */
export async function getOrCreateUserId(server: ServerSession, entrypoint: string): Promise<number> {
  let userId = await db.getUserId(entrypoint)
  if (userId === undefined || (await db.getWalletRecord(userId)).logStream.isBroken) {
    const userData = await getUserData(server)
    userId = await storeUserData(userData)
  }
  return userId
}

/* Ensures that the initial loading of transfers from the server to
 * the local database has finished successfully. This must be done
 * before the synchronization via the log stream can start. Throws
 * `BrokenLogStream` if the log stream is broken. */
export async function ensureLoadedTransfers(server: ServerSession, userId: number): Promise<void> {
  let walletRecord
  while (
    walletRecord = await db.getWalletRecord(userId),
    !walletRecord.logStream.isBroken && !walletRecord.logStream.loadedTransfers
  ) {
    const latestEntryId = walletRecord.logStream.latestEntryId
    for await (const transfer of iterTransfers(server, walletRecord.transfersList.uri)) {
      await db.storeTransfer(userId, transfer)
    }
    // Mark the log stream as redy for updates. Note that before we
    // start, we ensure that the status of the log stream had not been
    // changed by a parallel update.
    db.executeTransaction(async () => {
      const walletRecord = await db.getWalletRecord(userId)
      if (
        !walletRecord.logStream.isBroken
        && !walletRecord.logStream.loadedTransfers
        && walletRecord.logStream.latestEntryId === latestEntryId
      ) {
        walletRecord.logStream.loadedTransfers = true
        await db.updateWalletRecord(walletRecord)
      }
    })
  }
  if (walletRecord.logStream.isBroken) {
    throw new BrokenLogStream()
  }
}

/* Connects to the server, processes one page of log entries and
 * updates the wallet record. Throws `BrokenLogStream` if the log
 * stream is broken. Returns `true` if there are more log pages to
 * process. */
export async function processLogPage(server: ServerSession, userId: number): Promise<boolean> {
  const walletRecord = await db.getWalletRecord(userId)
  if (walletRecord.logStream.isBroken) {
    throw new BrokenLogStream()
  }
  if (walletRecord.logStream.loadedTransfers) {
    return false
  }
  const previousEntryId = walletRecord.logStream.latestEntryId

  try {
    const response = await server.get(walletRecord.logStream.forthcoming) as HttpResponse<LogEntriesPage>
    const page = makeLogEntriesPage(response)
    const isLastPage = page.next === undefined
    const { updates, latestEntryId } = collectObjectUpdates(page.items, previousEntryId)
    const objectUpdaters = await generateObjectUpdaters(server, userId, updates)

    // Write all object updates to the local database, and store the
    // current position in the log stream. Note that before we start,
    // we ensure that the status of the log stream had not been
    // changed by a parallel update.
    db.executeTransaction(async () => {
      const walletRecord = await db.getWalletRecord(userId)
      if (
        !walletRecord.logStream.isBroken
        && walletRecord.logStream.loadedTransfers
        && walletRecord.logStream.latestEntryId === previousEntryId
      ) {
        for (const performObjectUpdate of objectUpdaters) {
          await performObjectUpdate()
        }
        if (isLastPage) {
          walletRecord.logStream.syncedAt = new Date()
        }
        walletRecord.logStream.forthcoming = (isLastPage ? page.forthcoming : page.next) as string
        walletRecord.logStream.latestEntryId = latestEntryId
        await db.updateWalletRecord(walletRecord)
      }
    })
    return !isLastPage

  } catch (e: unknown) {
    if (e instanceof BrokenLogStream) {
      // Mark the log stream as broken (and then re-throw). Note that
      // before we start, we ensure that the status of the log stream
      // had not been changed by a parallel update.
      db.executeTransaction(async () => {
        const walletRecord = await db.getWalletRecord(userId)
        if (
          !walletRecord.logStream.isBroken
          && walletRecord.logStream.loadedTransfers
          && walletRecord.logStream.latestEntryId === previousEntryId
        ) {
          walletRecord.logStream.isBroken = true
          await db.updateWalletRecord(walletRecord)
        }
      })
    }
    throw e
  }
}

type ObjectUpdater = () => Promise<void>

type PreparedUpdate = {
  updater: ObjectUpdater,
  relatedUpdates: ObjectUpdateInfo[],
}

type UserData = {
  accounts: AccountV0[],
  wallet: WalletV0,
  creditor: CreditorV0,
  pinInfo: PinInfoV0,
}

function makeUpdate(updater: ObjectUpdater, relatedUpdates: ObjectUpdateInfo[] = []): PreparedUpdate {
  return { updater, relatedUpdates }
}

async function getUserData(server: ServerSession): Promise<UserData> {
  const wallet = makeWallet(await server.getEntrypointResponse() as HttpResponse<Wallet>)
  const creditor = makeCreditor(await server.get(wallet.creditor.uri) as HttpResponse<Creditor>)
  const pinInfo = makePinInfo(await server.get(wallet.pinInfo.uri) as HttpResponse<PinInfo>)

  const accountUris = []
  for await (const { uri } of iterAccountsList(server, wallet.accountsList.uri)) {
    accountUris.push(uri)
  }
  const timeout = calcParallelTimeout(accountUris.length)
  const promises = accountUris.map(uri => server.get(uri, { timeout })) as Promise<HttpResponse<Account>>[]
  const accountResponses = await Promise.all(promises)
  const accounts = accountResponses.map(response => makeAccount(response))

  return { wallet, creditor, pinInfo, accounts }
}

async function storeUserData(data: UserData): Promise<number> {
  // TODO: Delete user's existing actions (excluding
  // `CreateTransferAction`s and `PaymentRequestAction`s). Also,
  // consider deleting some of user's tasks.

  const { accounts, wallet, creditor, pinInfo } = data
  const { requirePin, log, ...walletRecord } = {
    ...wallet,
    logStream: {
      latestEntryId: wallet.logLatestEntryId,
      forthcoming: wallet.log.forthcoming,
      loadedTransfers: false,
      isBroken: false,
    },
  }

  // Delete all old user's data and store the new one. Note that
  // before we start, we ensure that the status of the log stream had
  // not been changed by a parallel update.
  return db.executeTransaction(async () => {
    let userId = await db.getUserId(wallet.uri)
    if (userId === undefined || (await db.getWalletRecord(userId)).logStream.isBroken) {
      userId = await db.wallets.put({ ...walletRecord, userId })
      await db.walletObjects.put({ ...creditor, userId })
      await db.walletObjects.put({ ...pinInfo, userId })
      const oldAccountRecordsArray = await db.accounts.where({ userId }).toArray()
      const oldAccountRecordsMap = new Map(oldAccountRecordsArray.map(x => [x.uri, x]))

      for (const account of accounts) {
        const {
          accountRecord,
          accountInfoRecord,
          accountDisplayRecord,
          accountKnowledgeRecord,
          accountExchangeRecord,
          accountLedgerRecord,
          accountConfigRecord,
        } = splitIntoRecords(userId, account)
        await db.accounts.put(accountRecord)
        await db.accountObjects.where({ 'account.uri': account.uri }).delete()
        await db.accountObjects.bulkPut([
          accountInfoRecord,
          accountDisplayRecord,
          accountKnowledgeRecord,
          accountExchangeRecord,
          accountLedgerRecord,
          accountConfigRecord,
        ])
        oldAccountRecordsMap.delete(account.uri)
      }

      // Delete all old accounts, which are missing from the received
      // `accounts` array.
      for (const accountUri of oldAccountRecordsMap.keys()) {
        await db.deleteAccount(accountUri)
      }
    }
    return userId
  })
}

function collectObjectUpdates(
  logEntries: LogEntryV0[],
  latestEntryId: bigint,
): { latestEntryId: bigint, updates: ObjectUpdateInfo[] } {
  const updates: Map<string, ObjectUpdateInfo> = new Map()
  for (const { entryId, addedAt, object: { uri }, objectType, objectUpdateId, deleted, data } of logEntries) {
    if (entryId !== ++latestEntryId) {
      throw new BrokenLogStream()
    }
    const canonicalType = getCanonicalType(objectType)
    if (
      canonicalType !== undefined
      && canonicalType !== 'AccountsList'
      && canonicalType !== 'TransfersList'
    ) {
      // NOTE: We ignore unknown log object types. Also, we ignore
      // changes in `TransfersList` and `AccountsList` objects,
      // because we do not need the information contained in them to
      // properly maintain transfers and account lists.
      updates.set(uri, {
        objectUri: uri,
        objectType: canonicalType,
        updatedAt: addedAt,
        deleted,
        objectUpdateId,
        data,
      })
    }
  }
  return {
    latestEntryId,
    updates: [...updates.values()],
  }
}

async function generateObjectUpdaters(
  server: ServerSession,
  userId: number,
  updates: ObjectUpdateInfo[],
): Promise<ObjectUpdater[]> {
  let updaters: ObjectUpdater[] = []
  let conbinedRelatedUpdates: ObjectUpdateInfo[] = []
  const timeout = calcParallelTimeout(updates.length)
  const promises = Promise.all(updates.map(update => prepareObjectUpdate(update, server, userId, timeout)))
  for (const { updater, relatedUpdates } of await promises) {
    updaters.push(updater)
    conbinedRelatedUpdates.push(...relatedUpdates)
  }
  if (conbinedRelatedUpdates.length > 0) {
    // When some of the updated objects contain references (links) to
    // another objects on the server, the referred (related) objects
    // should be requested as well. We do this recursively
    // here. Reference cycles between log objects are (hopefully)
    // impossible. Currently this is used for ledger entries to load
    // their correspoinding transfers.
    updaters = updaters.concat(await generateObjectUpdaters(server, userId, conbinedRelatedUpdates))
  }
  return updaters
}

async function prepareObjectUpdate(
  updateInfo: ObjectUpdateInfo,
  server: ServerSession,
  userId: number,
  timeout: number,
): Promise<PreparedUpdate> {
  if (updateInfo.deleted) {
    return makeUpdate(() => db.storeLogObjectRecord(null, updateInfo))
  }
  const existingRecord = await db.getLogObjectRecord(updateInfo)
  const alreadyUpToDate = (
    existingRecord !== undefined
    && (existingRecord.latestUpdateId ?? MAX_INT64) >= (updateInfo.objectUpdateId ?? MAX_INT64)
  )
  if (alreadyUpToDate) {
    return makeUpdate(() => Promise.resolve())
  }

  // Sometimes we can reconstruct the current version of the object by
  // updating the existing version of the object with the data
  // received from the log record. In such cases we spare a needless
  // network request.
  let obj = tryToReconstructLogObject(updateInfo, existingRecord)
  if (!obj) {
    try {
      const uri = updateInfo.objectUri
      const response = await server.get(uri, { timeout }) as HttpResponse<unknown>
      obj = makeLogObject(response)
    } catch (e: unknown) {
      if (e instanceof HttpError && e.status === 404) {
        return makeUpdate(() => db.storeLogObjectRecord(null, updateInfo))
      } else throw e
    }
  }
  assert(obj.type === updateInfo.objectType)

  // Some types of objects require special treatment.
  switch (obj.type) {
    case 'Transfer': {
      return makeUpdate(async () => {
        await db.storeTransfer(userId, obj as TransferV0)
      })
    }
    case 'Account': {
      const {
        accountRecord,
        accountInfoRecord,
        accountDisplayRecord,
        accountKnowledgeRecord,
        accountExchangeRecord,
        accountLedgerRecord,
        accountConfigRecord,
      } = splitIntoRecords(userId, obj)
      return makeUpdate(async () => {
        await db.storeLogObjectRecord(accountRecord, updateInfo)
        await db.storeLogObjectRecord(accountInfoRecord)
        await db.storeLogObjectRecord(accountDisplayRecord)
        await db.storeLogObjectRecord(accountKnowledgeRecord)
        await db.storeLogObjectRecord(accountExchangeRecord)
        await db.storeLogObjectRecord(accountLedgerRecord)
        await db.storeLogObjectRecord(accountConfigRecord)
      })
    }
    case 'AccountLedger': {
      const accountLedgerRecord: AccountLedgerRecord = { ...obj, userId }
      const newLedgerEntries = await fetchNewLedgerEntries(server, accountLedgerRecord)
      const relatedUpdates: ObjectUpdateInfo[] = newLedgerEntries
        .filter(entry => entry.transfer !== undefined)
        .map(entry => ({
          objectUri: entry.transfer!.uri,
          objectType: 'CommittedTransfer',
          deleted: false,
          updatedAt: accountLedgerRecord.latestUpdateAt,
        }))
      return makeUpdate(async () => {
        await db.storeLogObjectRecord(accountLedgerRecord, updateInfo)
        for (const ledgerEntry of newLedgerEntries) {
          await db.storeLedgerEntryRecord({ ...ledgerEntry, userId })
        }
      }, relatedUpdates)
    }

    case 'AccountConfig':
    case 'AccountDisplay':
    case 'AccountKnowledge':
    case 'AccountExchange':
    case 'AccountInfo':
    case 'CommittedTransfer':
    case 'Creditor':
    case 'PinInfo': {
      const logObjectRecord: LogObjectRecord = { ...obj, userId }
      return makeUpdate(() => db.storeLogObjectRecord(logObjectRecord, updateInfo))
    }
  }
}

function tryToReconstructLogObject(updateInfo: ObjectUpdateInfo, record?: LogObjectRecord): LogObject | undefined {
  const { objectUpdateId, data, updatedAt } = updateInfo
  let patchedRecord: AccountLedgerRecord | TransferRecord | undefined

  if (record && objectUpdateId !== undefined && data !== undefined) {
    switch (record.type) {
      case 'AccountLedger':
        assert(typeof data.principal === 'bigint')
        assert(typeof data.nextEntryId === 'bigint')
        assert(typeof data.firstPage === 'string')
        patchedRecord = {
          ...record as AccountLedgerRecord,
          entries: {
            ...record.entries,
            first: data.firstPage,
          },
          principal: data.principal,
          nextEntryId: data.nextEntryId,
          latestUpdateId: objectUpdateId,
          latestUpdateAt: updatedAt,
        } as AccountLedgerRecord
        break

      case 'Transfer':
        patchedRecord = {
          ...record as TransferRecord,
          latestUpdateId: objectUpdateId,
          latestUpdateAt: updatedAt,
        } as TransferRecord
        if (data.finalizedAt !== undefined) {
          assert(typeof data.finalizedAt === 'string')
          assert(Number.isFinite(new Date(data.finalizedAt).getTime()))
          const hasError = data.errorCode !== undefined
          let result: TransferResultV0 = {
            type: 'TransferResult',
            finalizedAt: data.finalizedAt,
            committedAmount: hasError ? 0n : patchedRecord.amount
          }
          if (hasError) {
            assert(typeof data.errorCode === 'string')
            result.error = {
              type: 'TransferError',
              errorCode: data.errorCode,
            }
          }
          patchedRecord.result = result
        }
        break
    }
  }
  return patchedRecord
}
