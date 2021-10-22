import {
  ServerSession,
  HttpResponse,
  HttpError,
} from './server'
import type {
  Creditor,
  PinInfo,
  Wallet,
  Account,
  Transfer,
  LogEntriesPage,
} from './server'
import {
  db,
  splitIntoRecords,
  MAX_INT64,
} from './db'
import type {
  UserData,
  WalletRecordWithId,
  LogObjectRecord,
  AccountLedgerRecord,
  TransferRecord,
  ObjectUpdateInfo,
} from './db'
import {
  makeCreditor,
  makePinInfo,
  makeAccount,
  makeWallet,
  makeTransfer,
  makeLogObject,
  makeLogEntriesPage,
  getCanonicalType,
} from './canonical-objects'
import type {
  TransferV0,
  LogEntryV0,
  LogObject,
  LedgerEntryV0,
} from './canonical-objects'
import {
  iterAccountsList,
  iterTransfersList,
  iterLedgerEntries,
  calcParallelTimeout,
} from './utils'

type ObjectUpdater = () => Promise<void>

type PreparedUpdate = {
  updater: ObjectUpdater,
  relatedUpdates: ObjectUpdateInfo[],
}

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
    userId = await db.storeUserData(userData)
  }
  return userId
}

/* Ensures that the initial loading of transfers from the server to
 * the local database has finished successfully. This must be done
 * before the synchronization via the log stream can start. */
export async function ensureLoadedTransfers(server: ServerSession, userId: number): Promise<WalletRecordWithId> {
  const walletRecord = await db.getWalletRecord(userId)

  async function fetchTransfers(uris: string[]): Promise<TransferV0[]> {
    const timeout = calcParallelTimeout(uris.length)
    const results = await Promise.allSettled(
      uris.map(uri => server.get(uri, { timeout }) as Promise<HttpResponse<Transfer>>)
    )
    const rejected = results.filter(x => x.status === 'rejected') as PromiseRejectedResult[]
    const errors = rejected.map(x => x.reason)
    for (const e of errors) {
      if (e instanceof HttpError && e.status === 404) { /* ingnore */ }
      else throw e
    }
    const fulfilled = results.filter(x => x.status === 'fulfilled') as PromiseFulfilledResult<HttpResponse<Transfer>>[]
    const responses = fulfilled.map(x => x.value)
    return responses.map(response => makeTransfer(response))
  }

  async function* iterTransfers(): AsyncIterable<TransferV0> {
    let urisToFetch: string[] = []
    for await (const { uri: transferUri } of iterTransfersList(server, walletRecord.transfersList.uri)) {
      const transferRecord = await db.getTransferRecord(transferUri)
      const isConcludedTransfer = transferRecord && (transferRecord.result || transferRecord.aborted)
      if (!isConcludedTransfer) {
        urisToFetch.push(transferUri)
      } else if (!transferRecord.aborted && transferRecord.result?.committedAmount === 0n) {
        // At this point we know that the transfer is registered in
        // the local database as unsuccessful, but has not been
        // aborted yet. This means we should ensure that an abort
        // transfer action will be created for the transfer.
        yield transferRecord
      }
      if (urisToFetch.length >= 10) {
        yield* await fetchTransfers(urisToFetch)
        urisToFetch = []
      }
    }
    yield* await fetchTransfers(urisToFetch)
  }

  if (!walletRecord.logStream.loadedTransfers) {
    for await (const transfer of iterTransfers()) {
      await db.storeTransfer(userId, transfer)
    }
    walletRecord.logStream.loadedTransfers = true
    await db.updateWalletRecord(walletRecord)
  }
  return walletRecord
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
  const previousEntryId = walletRecord.logStream.latestEntryId

  try {
    const pageUrl = walletRecord.logStream.forthcoming
    const pageResponse = await server.get(pageUrl) as HttpResponse<LogEntriesPage>
    const page = makeLogEntriesPage(pageResponse)
    assert(page.next !== undefined || page.forthcoming !== undefined)
    const { updates, latestEntryId } = collectObjectUpdates(page.items, previousEntryId)
    const updaters = await generateObjectUpdaters(updates, server, userId)
    const isLastPage = page.next === undefined
    const next = new URL((isLastPage ? page.forthcoming : page.next) as string, pageUrl).href

    db.executeTransaction(async () => {
      const walletRecord = await db.getWalletRecord(userId)
      if (walletRecord.logStream.latestEntryId === previousEntryId) {
        for (const performObjectUpdate of updaters) {
          await performObjectUpdate()
        }
        if (isLastPage) {
          walletRecord.logStream.syncedAt = new Date()
        }
        walletRecord.logStream.forthcoming = next
        walletRecord.logStream.latestEntryId = latestEntryId
        await db.updateWalletRecord(walletRecord)
      }
    })
    return !isLastPage

  } catch (e: unknown) {
    if (e instanceof BrokenLogStream) {
      db.executeTransaction(async () => {
        const walletRecord = await db.getWalletRecord(userId)
        if (walletRecord.logStream.latestEntryId === previousEntryId) {
          walletRecord.logStream.isBroken = true
          await db.updateWalletRecord(walletRecord)
        }
      })
    }
    throw e
  }
}

async function getUserData(server: ServerSession): Promise<UserData> {
  const collectedAfter = new Date()

  const walletResponse = await server.getEntrypointResponse() as HttpResponse<Wallet>
  const wallet = makeWallet(walletResponse)

  const creditorUri = walletResponse.buildUri(wallet.creditor.uri)
  const creditorResponse = await server.get(creditorUri) as HttpResponse<Creditor>
  const creditor = makeCreditor(creditorResponse)

  const pinInfoUri = walletResponse.buildUri(wallet.pinInfo.uri)
  const pinInfoResponse = await server.get(pinInfoUri) as HttpResponse<PinInfo>
  const pinInfo = makePinInfo(pinInfoResponse)

  const accountUris = []
  for await (const { uri: accountUri } of iterAccountsList(server, wallet.accountsList.uri)) {
    accountUris.push(accountUri)
  }
  const timeout = calcParallelTimeout(accountUris.length)
  const promises = accountUris.map(uri => server.get(uri, { timeout })) as Promise<HttpResponse<Account>>[]
  const accountResponses = await Promise.all(promises)
  const accounts = accountResponses.map(response => makeAccount(response))

  return {
    collectedAfter,
    accounts,
    wallet,
    creditor,
    pinInfo,
  }
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

async function generateObjectUpdaters(updates: ObjectUpdateInfo[], server: ServerSession, userId: number): Promise<ObjectUpdater[]> {
  let updaters: ObjectUpdater[] = []
  let conbinedRelatedUpdates: ObjectUpdateInfo[] = []
  const timeout = calcParallelTimeout(updates.length)
  const promises = Promise.all(updates.map(update => prepareObjectUpdate(update, server, userId, timeout)))
  for (const { updater, relatedUpdates } of await promises) {
    updaters.push(updater)
    conbinedRelatedUpdates.push(...relatedUpdates)
  }
  if (conbinedRelatedUpdates.length > 0) {
    updaters = updaters.concat(await generateObjectUpdaters(conbinedRelatedUpdates, server, userId))
  }
  return updaters
}

async function prepareObjectUpdate(
  updateInfo: ObjectUpdateInfo,
  server: ServerSession,
  userId: number,
  timeout?: number,
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
    case 'Transfer':
      return makeUpdate(async () => {
        db.storeTransfer(userId, obj as TransferV0)
      })

    case 'Account':
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

    case 'AccountLedger':
      const ledgerRecord: AccountLedgerRecord = { ...obj, userId }
      const latestEntryId = 1  // TODO: read this from the db.
      const firstPageUri = ledgerRecord.entries.first  // TODO: add &stop=`${latestEntryId}`.
      let newEntries: LedgerEntryV0[] = []
      for await (const entry of iterLedgerEntries(server, firstPageUri)) {
        if (entry.entryId <= latestEntryId) {
          break
        }
        newEntries.push(entry)
      }
      const relatedUpdates: ObjectUpdateInfo[] = newEntries
          .filter(entry => entry.transfer !== undefined)
          .map(entry => ({
            objectUri: entry.transfer?.uri as string,
            objectType: 'CommittedTransfer',
            deleted: false,
            updatedAt: new Date().toISOString(),
          }))
      return makeUpdate(async () => {
        db.storeLogObjectRecord(ledgerRecord, updateInfo)
        for (const entry of newEntries) {
          db.storeLedgerEntryRecord({ ...entry, userId })
        }
      }, relatedUpdates)

    case 'AccountConfig':
    case 'AccountDisplay':
    case 'AccountKnowledge':
    case 'AccountExchange':
    case 'AccountInfo':
    case 'CommittedTransfer':
    case 'Creditor':
    case 'PinInfo':
      const record: LogObjectRecord = { ...obj, userId }
      return makeUpdate(() => db.storeLogObjectRecord(record, updateInfo))
  }
}

function tryToReconstructLogObject(updateInfo: ObjectUpdateInfo, record?: LogObjectRecord): LogObject | undefined {
  const { objectUpdateId, data, updatedAt } = updateInfo
  let patchedRecord: AccountLedgerRecord | TransferRecord | undefined

  if (record && objectUpdateId !== undefined && data !== undefined) {
    switch (record.type) {
      case 'AccountLedger':
        // TODO: update entries.first here!
        patchedRecord = {
          ...record as AccountLedgerRecord,
          principal: BigInt(data.principal as bigint),
          nextEntryId: BigInt(data.nextEntryId as bigint),
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
          const hasError = data.errorCode === undefined
          patchedRecord.result = {
            type: 'TransferResult',
            finalizedAt: String(data.finalizedAt),
            committedAmount: hasError ? 0n : patchedRecord.amount
          }
          if (hasError) {
            patchedRecord.result.error = {
              type: 'TransferError',
              errorCode: String(data.errorCode),
            }
          }
        }
        break
    }
  }
  return patchedRecord
}

function makeUpdate(updater: ObjectUpdater, relatedUpdates: ObjectUpdateInfo[] = []): PreparedUpdate {
  return { updater, relatedUpdates }
}
