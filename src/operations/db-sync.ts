import type {
  ServerSession, HttpResponse, Creditor, PinInfo, Wallet, Account, LogEntriesPage
} from './server'
import type {
  AccountLedgerRecord, TransferRecord, AccountRecord, AccountConfigRecord, PinInfoRecord,
  AccountDisplayRecord, AccountKnowledgeRecord, AccountExchangeRecord, AccountInfoRecord,
  CommittedTransferRecord, CreditorRecord
} from './db'
import type {
  PinInfoV0, CreditorV0, WalletV0, AccountV0, TransferV0, LogEntryV0, TransferResultV0, LogObject,
  AccountConfigV0, AccountDisplayV0, AccountKnowledgeV0, AccountExchangeV0, AccountLedgerV0
} from './canonical-objects'

import { HttpError, AuthenticationError } from './server'
import { db, splitIntoRecords } from './db'
import {
  makeCreditor, makePinInfo, makeAccount, makeWallet, makeLogObject, makeLogEntriesPage,
  getCanonicalType,
} from './canonical-objects'
import {
  iterAccountsList, calcParallelTimeout, fetchNewLedgerEntries, iterTransfersList, fetchTransfers,
  settleAndIgnore404, MAX_INT64
} from './utils'

export class BrokenLogStream extends Error {
  name = 'BrokenLogStream'
}

export class PinNotRequired extends Error {
  name = 'PinNotRequired'
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

/* Queries the server for the latest changes and updates the local
 * database accordingly. Throws `PinNotRequired` if PIN is not
 * required for potentially dangerous operations.*/
export async function sync(server: ServerSession, userId: number): Promise<void> {
  await fetchWallet(server, userId)
  try {
    await ensureLoadedTransfers(server, userId)
    while (await processLogPage(server, userId));
  } catch (e: unknown) {
    if (e instanceof BrokenLogStream) {
      // When log entries has been lost, user's data must be loaded
      // from the server again. If we do this here, it could disturb
      // the user interaction with the UI. Instead, we give up on
      // the update, and invite the user to re-authenticate. (The
      // user's data will be loaded after the authentication.)
      await server.forgetCurrentToken()
      throw new AuthenticationError()
    } else throw e
  }
}

/* Stores an object received from a direct HTTP request to the
 * server. */
export async function storeObject(
  userId: number,
  obj: AccountConfigV0 | AccountDisplayV0 | AccountKnowledgeV0 | AccountExchangeV0 | PinInfoV0 | TransferV0
): Promise<void> {
  if (obj.type === 'Transfer') {
    await db.storeTransfer(userId, obj)
  } else {
    await storeLogObjectRecord({ ...obj, userId })
  }
}

/* Reads the wallet from the server and updates the wallet
 * record. Throws `PinNotRequired` if PIN is not required for
 * potentially dangerous operations. */
async function fetchWallet(server: ServerSession, userId: number): Promise<void> {
  const wallet = makeWallet(await server.getEntrypointResponse() as HttpResponse<Wallet>)

  await db.transaction('rw', db.allTables, async () => {
    let walletRecord = await db.getWalletRecord(userId)

    // Most of the fields in the wallet are URIs that must not change.
    assert(walletRecord.uri === wallet.uri)
    assert(walletRecord.creditor.uri === wallet.creditor.uri)
    assert(walletRecord.pinInfo.uri === wallet.pinInfo.uri)
    assert(walletRecord.debtorLookup.uri === wallet.debtorLookup.uri)
    assert(walletRecord.accountLookup.uri === wallet.accountLookup.uri)
    assert(walletRecord.createTransfer.uri === wallet.createTransfer.uri)
    assert(walletRecord.createAccount.uri === wallet.createAccount.uri)
    assert(walletRecord.accountsList.uri === wallet.accountsList.uri)
    assert(walletRecord.transfersList.uri === wallet.transfersList.uri)

    walletRecord.logRetentionDays = wallet.logRetentionDays
    await db.updateWalletRecord(walletRecord)
  })

  if (!wallet.requirePin) {
    throw new PinNotRequired()
  }
}

/* Ensures that the initial loading of transfers from the server to
 * the local database has finished successfully. This must be done
 * before the synchronization via the log stream can start. Throws
 * `BrokenLogStream` if the log stream is broken. */
async function ensureLoadedTransfers(server: ServerSession, userId: number): Promise<void> {
  let walletRecord
  while (
    walletRecord = await db.getWalletRecord(userId),
    !walletRecord.logStream.isBroken && !walletRecord.logStream.loadedTransfers
  ) {
    const latestEntryId = walletRecord.logStream.latestEntryId
    for await (const transfer of iterTransfersToLoad(server, walletRecord.transfersList.uri)) {
      await storeObject(userId, transfer)
    }
    // Mark the log stream as redy for updates. Note that before we
    // start, we ensure that the status of the log stream had not been
    // changed by a parallel update.
    await db.transaction('rw', db.allTables, async () => {
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
async function processLogPage(server: ServerSession, userId: number): Promise<boolean> {
  const walletRecord = await db.getWalletRecord(userId)
  if (walletRecord.logStream.isBroken) {
    throw new BrokenLogStream()
  }
  if (!walletRecord.logStream.loadedTransfers) {
    return false
  }
  const previousEntryId = walletRecord.logStream.latestEntryId

  try {
    const pageUrl = walletRecord.logStream.forthcoming
    const page = makeLogEntriesPage(await server.get(pageUrl) as HttpResponse<LogEntriesPage>)
    const isLastPage = page.next === undefined
    const { updates, latestEntryId } = collectObjectUpdates(page.items, previousEntryId)
    const objectUpdaters = await generateObjectUpdaters(updates, server, userId)

    // Write all object updates to the local database, and store the
    // current position in the log stream. Note that before we start,
    // we ensure that the status of the log stream had not been
    // changed by a parallel update.
    await db.transaction('rw', db.allTables, async () => {
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
      // Mark the log stream as broken and re-throw. Note that before
      // we start, we ensure that the status of the log stream had not
      // been changed by a parallel update.
      await db.transaction('rw', db.allTables, async () => {
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

type LogObjectRecord =
  | AccountRecord
  | AccountConfigRecord
  | AccountDisplayRecord
  | AccountKnowledgeRecord
  | AccountExchangeRecord
  | AccountInfoRecord
  | AccountLedgerRecord
  | TransferRecord
  | CommittedTransferRecord
  | CreditorRecord
  | PinInfoRecord

type ObjectUpdateInfo = {
  objectUri: string,
  objectType:
  | 'Account'
  | 'AccountConfig'
  | 'AccountDisplay'
  | 'AccountKnowledge'
  | 'AccountExchange'
  | 'AccountInfo'
  | 'AccountLedger'
  | 'Transfer'
  | 'CommittedTransfer'
  | 'Creditor'
  | 'PinInfo'
  addedAt: string,
  deleted: boolean,
  objectUpdateId?: bigint,
  data?: { [key: string]: unknown },
}

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
  const accountResponses = await settleAndIgnore404(promises)
  const accounts = accountResponses.map(response => makeAccount(response))

  return { wallet, creditor, pinInfo, accounts }
}

async function storeUserData({ accounts, wallet, creditor, pinInfo }: UserData): Promise<number> {
  // TODO: Delete user's existing actions (excluding
  // `CreateTransferAction`s and `PaymentRequestAction`s). Also,
  // consider deleting some of user's tasks.

  // Delete all old user's data and store the new one. Note that
  // before we start, we ensure that the status of the log stream had
  // not been changed by a parallel update.
  return await db.transaction('rw', db.allTables, async () => {
    let userId = await db.getUserId(wallet.uri)
    if (userId === undefined || (await db.getWalletRecord(userId)).logStream.isBroken) {
      const { requirePin, log, logLatestEntryId, ...walletRecord } = {
        ...wallet,
        logStream: {
          latestEntryId: wallet.logLatestEntryId,
          forthcoming: wallet.log.forthcoming,
          loadedTransfers: false,
          isBroken: false,
        },
      }
      userId = await db.wallets.put({ ...walletRecord, userId })
      await db.walletObjects.bulkPut([
        { ...creditor, userId },
        { ...pinInfo, userId },
      ])

      const oldAccountUris = new Set<string>()
      for (const accountUri of await db.accounts.where({ userId }).primaryKeys()) {
        oldAccountUris.add(accountUri)
      }
      const accountObjects = await db.accountObjects.where({ userId }).toArray()
      for (const accountUri of accountObjects.map(obj => obj.account.uri)) {
        oldAccountUris.add(accountUri)
      }

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
        await db.accountObjects.bulkPut([
          accountInfoRecord,
          accountDisplayRecord,
          accountKnowledgeRecord,
          accountExchangeRecord,
          accountLedgerRecord,
          accountConfigRecord,
        ])
        oldAccountUris.delete(account.uri)
      }

      // Delete all old accounts, which are missing from the received
      // `accounts` array.
      for (const accountUri of oldAccountUris.keys()) {
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
  const updates: ObjectUpdateInfo[] = []
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
      updates.push({
        objectUri: uri,
        objectType: canonicalType,
        addedAt,
        deleted,
        objectUpdateId,
        data,
      })
    }
  }
  return { latestEntryId, updates }
}

async function generateObjectUpdaters(
  updates: ObjectUpdateInfo[],
  server: ServerSession,
  userId: number,
  objCache: Map<string, LogObject | '404'> = new Map(),
  pendingUpdates: Map<string, ObjectUpdateInfo> = new Map(),
): Promise<ObjectUpdater[]> {
  let uniqueUpdates = new Map<string, ObjectUpdateInfo>()
  updates.forEach(update => {
    // Add the URI of the update to `pendingUpdates` and
    // `uniqueUpdates`, but only if the same or newer update is not
    // already pending.
    const { objectUri, objectUpdateId } = update
    const pendingUpdate = pendingUpdates.get(objectUri)
    if (!pendingUpdate || (pendingUpdate.objectUpdateId ?? MAX_INT64) < (objectUpdateId ?? MAX_INT64)) {
      pendingUpdates.set(objectUri, update)
      uniqueUpdates.set(objectUri, update)
    }
  })
  updates = [...uniqueUpdates.values()]

  let updaters: ObjectUpdater[] = []
  let conbinedRelatedUpdates: ObjectUpdateInfo[] = []
  const timeout = calcParallelTimeout(updates.length)
  const promises = Promise.all(updates.map(update => prepareObjectUpdate(update, objCache, server, userId, timeout)))
  for (const { updater, relatedUpdates } of await promises) {
    updaters.push(updater)
    conbinedRelatedUpdates.push(...relatedUpdates)
  }
  if (conbinedRelatedUpdates.length > 0) {
    // When some of the updated objects are related to other objects
    // by foreign keys, the referred objects should be requested from
    // the server as well. We do this recursively here. Infinite
    // cycles should be impossible, because we use `pendingUpdates` to
    // remember which updates have already started, and do not start
    // them the second time.
    updaters = updaters.concat(
      await generateObjectUpdaters(conbinedRelatedUpdates, server, userId, objCache, pendingUpdates))
  }
  return updaters
}

async function prepareObjectUpdate(
  updateInfo: ObjectUpdateInfo,
  objCache: Map<string, LogObject | '404'>,
  server: ServerSession,
  userId: number,
  timeout: number,
): Promise<PreparedUpdate> {
  const { objectUri, objectType, objectUpdateId, deleted } = updateInfo
  if (deleted) {
    // The log says that the object is deleted.
    return makeUpdate(() => storeLogObjectRecord(null, updateInfo))
  }

  const existingRecord = await getLogObjectRecord(updateInfo)
  if (existingRecord && (existingRecord.latestUpdateId ?? MAX_INT64) >= (objectUpdateId ?? MAX_INT64)) {
    // The object is already up-to-date.
    return makeUpdate(() => Promise.resolve())
  }

  // Sometimes we can obtain the object from the cache, or reconstruct
  // the current version by updating the existing version with the
  // data received from the log entry. In such cases we spare a
  // needless network request.
  let obj: LogObject
  try {
    const cached = objCache.get(objectUri); if (cached === '404') throw '404'
    obj = cached
      ?? tryToReconstructLogObject(updateInfo, existingRecord)
      ?? makeLogObject(await server.get(objectUri, { timeout }))
  } catch (e: unknown) {
    if ((e instanceof HttpError && e.status === 404) || (e === '404')) {
      // The object has been deleted from the server.
      objCache.set(objectUri, '404')
      return makeUpdate(() => storeLogObjectRecord(null, updateInfo))
    } else throw e
  }
  assert(obj.type === objectType)
  objCache.set(objectUri, obj)

  // Some types of objects require special treatment.
  switch (obj.type) {
    case 'Transfer': {
      if (existingRecord) {
        assert(existingRecord.type === obj.type)
        assert(existingRecord.transfersList.uri === obj.transfersList.uri)
        assert(existingRecord.transferUuid === obj.transferUuid)
        assert(existingRecord.initiatedAt === obj.initiatedAt)
        assert(existingRecord.amount === obj.amount)
        assert(existingRecord.recipient.uri === obj.recipient.uri)
        assert(existingRecord.noteFormat === obj.noteFormat)
        assert(existingRecord.note === obj.note)
      }
      return makeUpdate(async () => {
        await storeObject(userId, obj as TransferV0)
      })
    }

    case 'Account': {
      const { info, display, knowledge, exchange, ledger, config } = obj
      const record: AccountRecord = splitIntoRecords(userId, obj).accountRecord
      if (existingRecord) {
        assert(existingRecord.type === record.type)
        assert(existingRecord.accountsList.uri === record.accountsList.uri)
        assert(existingRecord.debtor.uri === record.debtor.uri)
        assert(existingRecord.info.uri === record.info.uri)
        assert(existingRecord.display.uri === record.display.uri)
        assert(existingRecord.knowledge.uri === record.knowledge.uri)
        assert(existingRecord.exchange.uri === record.exchange.uri)
        assert(existingRecord.ledger.uri === record.ledger.uri)
        assert(existingRecord.config.uri === record.config.uri)
      }
      const relatedObjects = [info, display, knowledge, exchange, ledger, config]
      const relatedUpdates = relatedObjects.map(relatedObject => {
        assert(relatedObject.account.uri === obj.uri)
        return {
          objectUri: relatedObject.uri,
          objectType: relatedObject.type,
          objectUpdateId: relatedObject.latestUpdateId,
          deleted: false,
          addedAt: relatedObject.latestUpdateAt,
        }
      })
      relatedObjects.forEach(relatedObject => objCache.set(relatedObject.uri, relatedObject))
      return makeUpdate(() => storeLogObjectRecord(record, updateInfo), relatedUpdates)
    }

    case 'AccountLedger': {
      const record: AccountLedgerRecord = { ...obj, userId }
      let latestEntryId: bigint
      if (existingRecord) {
        assert(existingRecord.type === record.type)
        assert(existingRecord.account.uri === record.account.uri)
        latestEntryId = existingRecord.nextEntryId - 1n
      } else {
        latestEntryId = obj.nextEntryId - 1n
      }
      const newLedgerEntries = await fetchNewLedgerEntries(server, record, latestEntryId)
      const relatedUpdates: ObjectUpdateInfo[] = newLedgerEntries
        .filter(entry => entry.transfer !== undefined)
        .map(entry => {
          assert(entry.ledger.uri === obj.uri)
          return {
            objectUri: entry.transfer!.uri,
            objectType: 'CommittedTransfer',
            deleted: false,
            addedAt: record.latestUpdateAt,  // could be anything, will be ignored
          }
        })
      return makeUpdate(async () => {
        await storeLogObjectRecord(record, updateInfo)
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
    case 'CommittedTransfer': {
      const record: LogObjectRecord = { ...obj, userId }
      if (existingRecord) {
        assert(existingRecord.type === record.type)
        assert(existingRecord.account.uri === record.account.uri)
      }
      return makeUpdate(() => storeLogObjectRecord(record, updateInfo))
    }

    case 'Creditor':
    case 'PinInfo': {
      const record: LogObjectRecord = { ...obj, userId }
      if (existingRecord) {
        assert(existingRecord.type === record.type)
        assert(existingRecord.wallet.uri === record.wallet.uri)
      }
      return makeUpdate(() => storeLogObjectRecord(record, updateInfo))
    }
  }
}

function tryToReconstructLogObject(updateInfo: ObjectUpdateInfo, record?: LogObjectRecord): LogObject | undefined {
  const { objectUpdateId, data, addedAt } = updateInfo
  let patchedObject: AccountLedgerV0 | TransferV0 | undefined

  if (record !== undefined && objectUpdateId !== undefined && data !== undefined) {
    switch (record.type) {
      case 'AccountLedger':
        assert(typeof data.principal === 'bigint')
        assert(typeof data.nextEntryId === 'bigint')
        assert(typeof data.firstPage === 'string')
        patchedObject = {
          ...record,
          entries: {
            ...record.entries,
            first: data.firstPage,
          },
          principal: data.principal,
          nextEntryId: data.nextEntryId,
          latestUpdateId: objectUpdateId,
          latestUpdateAt: addedAt,
        } as AccountLedgerRecord
        delete (patchedObject as any).userId
        break

      case 'Transfer':
        patchedObject = {
          ...record,
          latestUpdateId: objectUpdateId,
          latestUpdateAt: addedAt,
        } as TransferRecord
        if (data.finalizedAt !== undefined) {
          assert(typeof data.finalizedAt === 'string')
          assert(Number.isFinite(new Date(data.finalizedAt).getTime()))
          const hasError = data.errorCode !== undefined
          let result: TransferResultV0 = {
            type: 'TransferResult',
            finalizedAt: data.finalizedAt,
            committedAmount: hasError ? 0n : patchedObject.amount
          }
          if (hasError) {
            assert(typeof data.errorCode === 'string')
            result.error = {
              type: 'TransferError',
              errorCode: data.errorCode,
            }
          }
          patchedObject.result = result
        }
        delete (patchedObject as any).userId
        break
    }
  }
  return patchedObject
}

async function* iterTransfersToLoad(server: ServerSession, transfersListUri: string): AsyncIterable<TransferV0> {
  let urisToFetch: string[] = []
  for await (const { uri: transferUri } of iterTransfersList(server, transfersListUri)) {
    const transferRecord = await db.getTransferRecord(transferUri)
    const isConcludedTransfer = transferRecord && (transferRecord.result || transferRecord.aborted)
    if (!isConcludedTransfer) {
      urisToFetch.push(transferUri)
    } else if (!transferRecord.aborted && transferRecord.result?.committedAmount === 0n) {
      // At this point we know that the transfer is unsuccessful, but
      // has not been aborted yet. We must include it in the transfers
      // to load, to ensure that an abort transfer action will be
      // created for this transfer. Note that we return a
      // `TransferRecord` instead of `TransferV0` here, but this is
      // OK, because the extra properties will be ignored (not saved)
      // by the `db.storeTransfer` method.
      yield transferRecord
    }
    // Request the transfers from the server in parallel, up to 20 at once.
    if (urisToFetch.length >= 20) {
      yield* await fetchTransfers(server, urisToFetch)
      urisToFetch = []
    }
  }
  yield* await fetchTransfers(server, urisToFetch)
}

async function getLogObjectRecord(updateInfo: ObjectUpdateInfo): Promise<LogObjectRecord | undefined> {
  const table = getLogObjectTable(updateInfo.objectType)
  return await table.get(updateInfo.objectUri)
}

async function storeLogObjectRecord(
  objectRecord: LogObjectRecord | null,
  updateInfo?: ObjectUpdateInfo,
): Promise<void> {
  assert(objectRecord || updateInfo)
  const objectUri = objectRecord ? objectRecord.uri : updateInfo!.objectUri
  const objectType = objectRecord ? objectRecord.type : updateInfo!.objectType
  const updateId = (objectRecord ? objectRecord.latestUpdateId : updateInfo!.objectUpdateId) ?? MAX_INT64

  assert(!updateInfo || !updateInfo.deleted || !objectRecord)
  assert(!updateInfo || updateInfo.objectUri === objectUri)
  assert(!updateInfo || updateInfo.objectType === objectType)
  assert(!updateInfo || (updateInfo.objectUpdateId ?? MAX_INT64) <= updateId,
    'The version of the object received from the server is older that the version ' +
    'promised by in log entry. Normally this should never happen. The most ' +
    'probable reason for this is having misconfigured HTTP caches somewhere.',
  )
  await db.transaction('rw', db.allTables, async (): Promise<void> => {
    const table = getLogObjectTable(objectType)
    const existingRecord = await table.get(objectUri)
    const alreadyUpToDate = existingRecord && (existingRecord.latestUpdateId ?? MAX_INT64) >= updateId
    if (!alreadyUpToDate) {
      if (objectRecord) {
        await updateLogObjectRecord(objectRecord)
      } else {
        await deleteLogObjectRecord(objectType, objectUri)
      }
    }
  })
}

async function updateLogObjectRecord(objectRecord: LogObjectRecord): Promise<void> {
  switch (objectRecord.type) {
    case 'Creditor':
    case 'PinInfo':
      db.walletObjects.put(objectRecord)
      break

    case 'CommittedTransfer':
      await db.storeCommittedTransferRecord(objectRecord)
      break

    case 'Transfer':
      throw new Error('Transfers records must be updated using the `db.storeTransfer` method.')

    case 'AccountConfig':
    case 'AccountDisplay':
    case 'AccountKnowledge':
    case 'AccountExchange':
    case 'AccountInfo':
    case 'AccountLedger':
      db.accountObjects.put(objectRecord)
      break

    case 'Account':
      db.accounts.put(objectRecord)
      break

    default:
      throw new Error('unknown object type')  // This must never happen.
  }
}

async function deleteLogObjectRecord(
  objectType: ObjectUpdateInfo['objectType'],
  objectUri: string,
): Promise<void> {
  switch (objectType) {
    case 'Creditor':
    case 'PinInfo':
      console.error(
        `An attempt to delete a ${objectType} via the log stream has been ignored. Wallet ` +
        `objects are singletons that normally must not be deleted via the log stream.`
      )
      break

    case 'CommittedTransfer':
      console.warn(
        `An attempt to delete a ${objectType} via the log stream has been ignored. Committed ` +
        `transfers are immutable, and normally will not be deleted. Nevertheless, under ` +
        `some very unlikely conditions (for example, being garbage collected on the server, ` +
        `before the corresponding log entry has been processed), this could happen.`
      )
      break

    case 'Transfer':
      await db.markTranferDeletion(objectUri)
      break

    case 'AccountConfig':
    case 'AccountDisplay':
    case 'AccountKnowledge':
    case 'AccountExchange':
    case 'AccountInfo':
    case 'AccountLedger':
      await db.deleteAccountObject(objectUri)
      break

    case 'Account':
      await db.deleteAccount(objectUri)
      break

    default:
      throw new Error('unknown object type')  // This must never happen.
  }
}

function getLogObjectTable(objectType: string): Dexie.Table<LogObjectRecord, string> {
  switch (getCanonicalType(objectType)) {
    case 'Creditor':
    case 'PinInfo':
      return db.walletObjects

    case 'CommittedTransfer':
      return db.committedTransfers

    case 'Transfer':
      return db.transfers

    case 'AccountDisplay':
    case 'AccountKnowledge':
    case 'AccountExchange':
    case 'AccountLedger':
    case 'AccountConfig':
    case 'AccountInfo':
      return db.accountObjects

    case 'Account':
      return db.accounts

    default:
      throw new Error('unknown object type')
  }
}
