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
} from './db'
import type {
  UserData,
  TypeMatcher,
  WalletRecordWithId,
  TransferV0,
} from './db'

type Page<ItemsType> = {
  items: ItemsType[],
  next?: string,
}

type PageItem<ItemsType> = {
  item: ItemsType,
  pageUrl: string,
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
    return responses.map(response => ({ ...response.data, type: 'Transfer-v0' as const }))
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

async function getUserData(server: ServerSession): Promise<UserData> {
  const collectedAfter = new Date()
  const walletResponse = await server.getEntrypointResponse() as HttpResponse<Wallet>
  assert(WALLET_TYPE.test(walletResponse.data.type))
  const wallet = { ...walletResponse.data, type: 'Wallet-v0' as const }

  const creditorUri = walletResponse.buildUri(wallet.creditor.uri)
  const creditorResponse = await server.get(creditorUri) as HttpResponse<Creditor>
  assert(CREDITOR_TYPE.test(creditorResponse.data.type ?? 'Creditor'))
  const creditor = { ...creditorResponse.data, type: 'Creditor-v0' as const }

  const pinInfoUri = walletResponse.buildUri(wallet.pinInfo.uri)
  const pinInfoResponse = await server.get(pinInfoUri) as HttpResponse<PinInfo>
  assert(PIN_INFO_TYPE.test(pinInfoResponse.data.type ?? 'PinInfo'))
  const pinInfo = { ...pinInfoResponse.data, type: 'PinInfo-v0' as const }

  const accountsListUri = walletResponse.buildUri(wallet.accountsList.uri)
  const accountUris: string[] = []
  for await (const { item, pageUrl } of iterPaginatedList<ObjectReference>(
    server,
    accountsListUri,
    ACCOUNTS_LIST_TYPE,
    OBJECT_REFERENCE_TYPE
  )) {
    accountUris.push(new URL(item.uri, pageUrl).href)
  }
  const accountResponsePromises = accountUris.map(uri => server.get(uri)) as Promise<HttpResponse<Account>>[]
  const accountResponses = await Promise.all(accountResponsePromises)
  assert(accountResponses.every(response => ACCOUNT_TYPE.test(response.data.type)))
  const accounts = accountResponses.map(response => ({ ...response.data, type: 'Account-v0' as const }))

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
