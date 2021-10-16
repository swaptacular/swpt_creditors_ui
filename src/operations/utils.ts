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
  PaginatedList,
  ObjectReference,
  LogEntriesPage,
} from './server'
import {
  db,
  WALLET_TYPE,
  CREDITOR_TYPE,
  PIN_INFO_TYPE,
  ACCOUNT_TYPE,
  ACCOUNTS_LIST_TYPE,
  OBJECT_REFERENCE_TYPE,
  TRANSFERS_LIST_TYPE,
  TRANSFER_TYPE,
  LOG_ENTRY_TYPE,
  LOG_ENTRIES_PAGE_TYPE,
  PAGINATED_STREAM_TYPE,
  ACCOUNT_INFO_TYPE,
  ACCOUNT_DISPLAY_TYPE,
  ACCOUNT_KNOWLEDGE_TYPE,
  ACCOUNT_EXCHANGE_TYPE,
  ACCOUNT_LEDGER_TYPE,
  ACCOUNT_CONFIG_TYPE,
  LEDGER_ENTRY_TYPE,
  LEDGER_ENTRIES_LIST_TYPE,
  TRANSFER_RESULT_TYPE,
  TRANSFER_ERROR_TYPE,
  TRANSFER_OPTIONS_TYPE,
} from './db'
import type {
  UserData,
  TypeMatcher,
  WalletRecordWithId,
  TransferV0,
  LogEntryV0,
  AccountV0,
  WalletV0,
  CreditorV0,
  PinInfoV0,
  AccountLedgerV0,
  ObjectRecord,
} from './db'

type Page<ItemsType> = {
  items: ItemsType[],
  next?: string,
}

type LogEntriesPageV0 = {
  type: 'LogEntriesPage',
  items: LogEntryV0[],
  next?: string,
  forthcoming?: string
}

type PageItem<ItemsType> = {
  item: ItemsType,
  pageUrl: string,
}

type ObjectUpdater = () => Promise<void>

type ObjectUpdateInfo = {
  objectUri: string,
  objectType: string,
  logInfo?: {
    addedAt: string,
    deleted: boolean,
    objectUpdateId?: bigint,
    data?: { [key: string]: unknown },
  }
}

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
 * the local database has finished successfully. This must be done in
 * before the synchronization via the log stream can start. */
export async function ensureLoadedTransfers(server: ServerSession, userId: number): Promise<WalletRecordWithId> {
  const walletRecord = await db.getWalletRecord(userId)
  const transfersListUri = new URL(walletRecord.transfersList.uri, walletRecord.uri).href

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
    assert(responses.every(response => TRANSFER_TYPE.test(response.data.type)))
    assert(responses.every(response => TRANSFER_OPTIONS_TYPE.test(response.data.options.type ?? 'TransferOptions')))
    assert(responses.every(response => TRANSFER_RESULT_TYPE.test(response.data.result?.type ?? 'TransferResult')))
    assert(responses.every(response => TRANSFER_ERROR_TYPE.test(response.data.result?.error?.type ?? 'TransferError')))
    return responses.map(response => ({
      ...response.data,
      type: 'Transfer',
      options: {
        ...response.data.options,
        type: 'TransferOptions',
      },
      result: response.data.result ? {
        ...response.data.result,
        type: 'TransferResult',
        error: response.data.result.error ? {
          ...response.data.result.error,
          type: 'TransferError',
        } : undefined,
      } : undefined,
    }))
  }

  async function* iterTransfers(): AsyncIterable<TransferV0> {
    let urisToFetch: string[] = []
    for await (const { item, pageUrl } of iterPaginatedList<ObjectReference>(
      server, transfersListUri, TRANSFERS_LIST_TYPE, OBJECT_REFERENCE_TYPE
    )) {
      const transferUri = new URL(item.uri, pageUrl).href
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
 * stream is broken. */
export async function processLogPage(server: ServerSession, userId: number): Promise<void> {
  const walletRecord = await db.getWalletRecord(userId)
  if (walletRecord.logStream.isBroken) {
    throw new BrokenLogStream()
  }
  const previousEntryId = walletRecord.logStream.latestEntryId

  try {
    const pageUrl = walletRecord.logStream.forthcoming
    const page = await getLogEntriesPage(server, pageUrl);
    const { updates, latestEntryId } = collectObjectUpdates(page.items, previousEntryId)
    const updaters = await generateObjectUpdaters(server, updates)
    const isLastPage = page.next === undefined
    const next = isLastPage ? page.forthcoming : page.next
    assert(next !== undefined)

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
  assert(WALLET_TYPE.test(walletResponse.data.type))
  assert(PAGINATED_STREAM_TYPE.test(walletResponse.data.log.type))
  assert(LOG_ENTRY_TYPE.test(walletResponse.data.log.itemsType))
  const wallet: WalletV0 = {
    ...walletResponse.data,
    type: 'Wallet',
    log: {
      ...walletResponse.data.log,
      type: 'PaginatedStream',
      itemsType: 'LogEntry',
    },
  }

  const creditorUri = walletResponse.buildUri(wallet.creditor.uri)
  const creditorResponse = await server.get(creditorUri) as HttpResponse<Creditor>
  assert(CREDITOR_TYPE.test(creditorResponse.data.type ?? 'Creditor'))
  const creditor: CreditorV0 = { ...creditorResponse.data, type: 'Creditor' }

  const pinInfoUri = walletResponse.buildUri(wallet.pinInfo.uri)
  const pinInfoResponse = await server.get(pinInfoUri) as HttpResponse<PinInfo>
  assert(PIN_INFO_TYPE.test(pinInfoResponse.data.type ?? 'PinInfo'))
  const pinInfo: PinInfoV0 = { ...pinInfoResponse.data, type: 'PinInfo' }

  const accountsListUri = walletResponse.buildUri(wallet.accountsList.uri)
  const accountUris: string[] = []
  for await (const { item, pageUrl } of iterPaginatedList<ObjectReference>(
    server, accountsListUri, ACCOUNTS_LIST_TYPE, OBJECT_REFERENCE_TYPE
  )) {
    accountUris.push(new URL(item.uri, pageUrl).href)
  }
  const timeout = calcParallelTimeout(accountUris.length)
  const accountResponsePromises = accountUris.map(
    uri => server.get(uri, { timeout })
  ) as Promise<HttpResponse<Account>>[]
  const accountResponses = await Promise.all(accountResponsePromises)
  assert(accountResponses.every(r => ACCOUNT_TYPE.test(r.data.type)))
  assert(accountResponses.every(r => ACCOUNT_CONFIG_TYPE.test(r.data.config.type ?? 'AccountConfig')))
  assert(accountResponses.every(r => ACCOUNT_EXCHANGE_TYPE.test(r.data.exchange.type ?? 'AccountExchange')))
  assert(accountResponses.every(r => ACCOUNT_KNOWLEDGE_TYPE.test(r.data.knowledge.type ?? 'AccountKnowledge')))
  assert(accountResponses.every(r => ACCOUNT_DISPLAY_TYPE.test(r.data.display.type ?? 'AccountDisplay')))
  assert(accountResponses.every(r => ACCOUNT_INFO_TYPE.test(r.data.info.type)))
  assert(accountResponses.every(r => ACCOUNT_LEDGER_TYPE.test(r.data.ledger.type)))
  assert(accountResponses.every(r => LEDGER_ENTRIES_LIST_TYPE.test(r.data.ledger.entries.type)))
  assert(accountResponses.every(r => LEDGER_ENTRY_TYPE.test(r.data.ledger.entries.itemsType)))
  const accounts: AccountV0[] = accountResponses.map(r => ({
    ...r.data,
    type: 'Account',
    config: { ...r.data.config, type: 'AccountConfig' },
    exchange: { ...r.data.exchange, type: 'AccountExchange' },
    knowledge: { ...r.data.knowledge, type: 'AccountKnowledge' },
    display: { ...r.data.display, type: 'AccountDisplay' },
    info: { ...r.data.info, type: 'AccountInfo' },
    ledger: {
      ...r.data.ledger,
      type: 'AccountLedger',
      entries: {
        ...r.data.ledger.entries,
        type: 'PaginatedList',
        itemsType: 'LedgerEntry',
      },
    },
  }))

  return {
    collectedAfter,
    accounts,
    wallet,
    creditor,
    pinInfo,
  }
}

function calcParallelTimeout(numberOfParallelRequests: number): number {
  const n = 6  // a rough guess for the maximum number of parallel connections
  return appConfig.serverApiTimeout * (numberOfParallelRequests + n - 1) / n
}

async function* iterPaginatedList<T>(
  server: ServerSession,
  listUri: string,
  listTypeMatcher: TypeMatcher,
  itemsTypeMatcher: TypeMatcher,
): AsyncIterable<PageItem<T>> {
  const listResponse = await server.get(listUri) as HttpResponse<PaginatedList>
  const data = listResponse.data
  assert(listTypeMatcher.test(data.type))
  assert(itemsTypeMatcher.test(data.itemsType))
  const first = listResponse.buildUri(data.first)
  yield* iterPage<T>(server, first)
}

async function* iterPage<T>(server: ServerSession, next: string): AsyncIterable<PageItem<T>> {
  do {
    const pageResponse = await server.get(next) as HttpResponse<Page<T>>
    const pageUrl = pageResponse.url
    const data = pageResponse.data
    for (const item of data.items) {
      yield { item, pageUrl }
    }
    next = data.next !== undefined ? pageResponse.buildUri(data.next) : ''
  } while (next)
}

async function getLogEntriesPage(server: ServerSession, pageUrl: string): Promise<LogEntriesPageV0> {
  const pageResponse = await server.get(pageUrl) as HttpResponse<LogEntriesPage>
  const page = pageResponse.data
  assert(LOG_ENTRIES_PAGE_TYPE.test(page.type))
  assert(page.next !== undefined || page.forthcoming !== undefined)
  assert(page.items.every(item => LOG_ENTRY_TYPE.test(item.type)))
  return {
    ...page,
    type: 'LogEntriesPage',
    items: page.items.map(item => ({
      ...item,
      type: 'LogEntry',
      object: { uri: pageResponse.buildUri(item.object.uri) },
    })),
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
    updates.set(uri, {
      objectUri: uri,
      objectType,
      logInfo: {
        addedAt,
        deleted,
        objectUpdateId,
        data,
      },
    })
  }
  return {
    latestEntryId,
    updates: [...updates.values()],
  }
}

async function generateObjectUpdaters(server: ServerSession, updates: ObjectUpdateInfo[]): Promise<ObjectUpdater[]> {
  let updaters: ObjectUpdater[] = []
  let conbinedRelatedUpdates: ObjectUpdateInfo[] = []
  const timeout = calcParallelTimeout(updates.length)
  const promises = Promise.all(updates.map(x => prepareObjectUpdate(x, server, timeout)))
  for (const { updater, relatedUpdates } of await promises) {
    updaters.push(updater)
    conbinedRelatedUpdates.push(...relatedUpdates)
  }
  if (conbinedRelatedUpdates.length > 0) {
    updaters = updaters.concat(await generateObjectUpdaters(server, conbinedRelatedUpdates))
  }
  return updaters
}

function tryToUpdateExistingObject(
  existingObject: ObjectRecord,
  logInfo: NonNullable<ObjectUpdateInfo['logInfo']>
): ObjectRecord | undefined {
  const { objectUpdateId, data, addedAt } = logInfo
  if (objectUpdateId !== undefined && data !== undefined) {
    switch (existingObject.type) {
      case 'AccountLedger':
        return {
          ...existingObject as AccountLedgerV0,
          principal: BigInt(data.principal as bigint),
          nextEntryId: BigInt(data.nextEntryId as bigint),
          latestUpdateId: objectUpdateId,
          latestUpdateAt: addedAt
        } as AccountLedgerV0
      case 'Transfer':
        let updatedObject: TransferV0 = {
          ...existingObject as TransferV0,
          latestUpdateId: objectUpdateId,
          latestUpdateAt: addedAt,
        } as TransferV0
        if (data.finalizedAt !== undefined) {
          const hasError = data.errorCode === undefined
          updatedObject.result = {
            type: 'TransferResult',
            finalizedAt: String(data.finalizedAt),
            committedAmount: hasError ? 0n : updatedObject.amount
          }
          if (hasError) {
            updatedObject.result.error = {
              type: 'TransferError',
              errorCode: String(data.errorCode),
            }
          }
        }
        return updatedObject
    }
  }
  return undefined
}

async function prepareObjectUpdate(
  updateInfo: ObjectUpdateInfo,
  server: ServerSession,
  timeout: number,
): Promise<PreparedUpdate> {
  // TODO: Add a proper implementation. It should:
  //
  // 1. Check if the object exist in the local database and if it has
  //    a big enough update ID. If yes -- we are done.
  //
  // 2. Request the object from the server or patch it up from the
  //    log's `data`. Ensure the object's type is compatible, throw an
  //    error if not. If necessary, make more that one request
  //    (multiple ledger entry pages, for example).
  //
  // 4. Make a list of objects (URI and type), that are related to the
  //    updated object, and may need to be requested as well. (For
  //    example, committed transfers referred by ledger entries.)
  //
  // Important: Do not forget to check `latestUpdateId` in
  // `ObjectUpdater` functions. They man have changed during the time
  // between the preparation and the execution.

  const { logInfo, objectUri } = updateInfo
  const objectUpdateId = logInfo?.objectUpdateId
  let existingRecord: ObjectRecord | undefined

  if (objectUpdateId) {
    existingRecord = await db.getObjectRecord(updateInfo)
    if (existingRecord) {
      assert(existingRecord.latestUpdateId !== undefined)
      if (existingRecord.latestUpdateId >= objectUpdateId) {
        return {
          updater: async () => undefined,
          relatedUpdates: [],
        }
      }
    }
  }

  const getUpdatedObject = async () => {
    if (existingRecord && logInfo) {
      const updatedObject = tryToUpdateExistingObject(existingRecord, logInfo)
      if (updatedObject) {
        return updatedObject
      }
    }
    const response = await server.get(objectUri, { timeout }) as HttpResponse<ObjectRecord>
    // TODO: verify response.data.type
    return response.data
  }

  const updatedObject = await getUpdatedObject()
  return {
    updater: () => db.putObjectRecord(updatedObject, objectUpdateId),
    relatedUpdates: [],
  }
}
