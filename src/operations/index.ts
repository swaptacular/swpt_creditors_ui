import { UpdateScheduler } from '../update-scheduler'
import {
  server as defaultServer,
  Oauth2TokenSource,
  ServerSession,
  ServerSessionError,
  AuthenticationError,
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
} from './db'
import type {
  UserData,
  TypeMatcher,
  WalletRecordWithId,
  ActionRecordWithId,
  ListQueryOptions,
} from './db'

export {
  AuthenticationError,
  ServerSessionError,
}

export type {
  ActionRecordWithId,
}

/* Logs out the user and redirects to home, never resolves. */
export async function logout(server = defaultServer): Promise<never> {
  return await server.logout()
}

/* If the user is logged in -- does nothing. Otherwise, redirects to
 * the login page, and never resolves. */
export async function login(server = defaultServer): Promise<void> {
  await server.login(async (login) => await login())
}

/* If the user is logged in -- does nothing. Otherwise, redirects to
 * the login page that request PIN reset authorization, and never
 * resolves. */
export async function authorizePinReset(): Promise<void> {
  const server = new ServerSession({
    tokenSource: new Oauth2TokenSource(true),
    onLoginAttempt: async (login) => await login()
  })
  await server.login()
}

/* Tries to update the local database, reading the latest data from
 * the server. Any network failures will be swallowed. */
export async function update(server: ServerSession, userId: number): Promise<void> {
  try {
    const walletRecord = await db.getWalletRecord(userId)
    await resetUserDataIfNecessary(server, walletRecord)
    await loadTransfersIfNecessary(server, walletRecord)
    // TODO: fetch log stream
    // await executeReadyTasks(server, userId)

  } catch (error: unknown) {
    let event
    switch (true) {
      case error instanceof AuthenticationError:
        event = new Event('update-authentication-error', { cancelable: true })
        break
      case error instanceof ServerSessionError:
        event = new Event('update-network-error', { cancelable: true })
        break
      case error instanceof HttpError:
        event = new Event('update-http-error', { cancelable: true })
        break
      default:
        throw error
    }
    if (dispatchEvent(event)) {
      console.error(error)
    }
  }
}

/* Returns the user ID corresponding to the given `entrypoint`. If the
 * user does not exist, tries to create a new user in the local
 * database, reading the user's data from the server. */
export async function getOrCreateUserId(server: ServerSession, entrypoint: string): Promise<number> {
  let userId = await db.getUserId(entrypoint)
  if (userId === undefined) {
    const userData = await getUserData(server)
    userId = await db.storeUserData(userData)
  }
  return userId
}

export class UserContext {
  private server: ServerSession
  private updateScheduler: UpdateScheduler
  private walletRecord: WalletRecordWithId

  readonly userId: number
  readonly scheduleUpdate: UpdateScheduler['schedule']
  readonly getActionRecords: (options?: ListQueryOptions) => Promise<ActionRecordWithId[]>

  constructor(
    server: ServerSession,
    updateScheduler: UpdateScheduler,
    walletRecord: WalletRecordWithId,
  ) {
    this.server = server
    this.updateScheduler = updateScheduler
    this.userId = walletRecord.userId
    this.walletRecord = walletRecord
    this.scheduleUpdate = this.updateScheduler.schedule.bind(this.updateScheduler)
    this.getActionRecords = db.getActionRecords.bind(db, this.userId)
  }

  /* The caller must be prepared this method to throw
   * `ServerSessionError` or `AuthenticationError`. */
  async ensureAuthenticated(): Promise<void> {
    const entrypoint = await this.server.entrypointPromise
    if (entrypoint === undefined) {
      throw new Error('undefined entrypoint')
    }
    try {
      await this.server.get(entrypoint, { attemptLogin: true })
    } catch (e: unknown) {
      if (e instanceof HttpError) throw new ServerSessionError(`unexpected status code (${e.status})`)
      else throw e
    }
  }

  async resetPin(newPin: string): Promise<void> {
    const pinInfoUri = this.walletRecord.pinInfo.uri
    try {
      let attemptsLeft = 10
      while (true) {
        const pinInfo = await this.fetchPinInfo(pinInfoUri)
        const requestBody = {
          type: 'PinInfo',
          status: 'on',
          latestUpdateId: pinInfo.latestUpdateId + 1n,
          newPin,
        }
        try {
          await this.server.patch(pinInfoUri, requestBody, { attemptLogin: false })
        } catch (e: unknown) {
          if (e instanceof HttpError && e.status === 409 && attemptsLeft--) continue
          else throw e
        }
        break
      }

    } catch (e: unknown) {
      if (e instanceof HttpError) throw new ServerSessionError(`unexpected status code (${e.status})`)
      else throw e
    }
  }

  async logout(): Promise<never> {
    return await this.server.logout()
  }

  private async fetchPinInfo(pinInfoUri: string): Promise<PinInfo> {
    const response = await this.server.get(pinInfoUri, { attemptLogin: false }) as HttpResponse<PinInfo>
    return response.data
  }
}

async function resetUserDataIfNecessary(server: ServerSession, walletRecord: WalletRecordWithId): Promise<void> {
  const timeSinceLastSync = Date.now() - walletRecord.logStream.syncTime
  const logRetention = 86_400_000 * Number(walletRecord.logRetentionDays)
  const safetyMargin = 3_600_000  // 1 hour
  if (timeSinceLastSync > logRetention - safetyMargin) {
    // If too much time has passed since the last successful sync with
    // the server, some needed log records could have been deleted. In
    // that case, we have no other choice but to download all the
    // user's data again from the server.
    const userData = await getUserData(server)
    await db.storeUserData(userData)
  }
}

async function loadTransfersIfNecessary(server: ServerSession, walletRecord: WalletRecordWithId): Promise<void> {
  // TODO: this is not finished.

  if (!walletRecord.logStream.loadedTransfers) {
    const transfersListUri = new URL(walletRecord.transfersList.uri, walletRecord.uri).href
    const transfers = await getTransfers(server, transfersListUri)
    for (const transfer of transfers) {
      if (!await db.isConcludedTransfer(transfer.uri)) {
        await db.storeTransfer(walletRecord.userId, transfer)
      }
    }
    resolveOldNotConfirmedCreateTransferRequests(walletRecord.userId)
  }
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
  for await (const { item, pageUrl } of paginatedListIterator<ObjectReference>(
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
  const accounts = accountResponses.map(response => ({ ...response.data, type: 'Account-v0' as const}))

  return {
    collectedAfter,
    accounts,
    wallet,
    creditor,
    pinInfo,
  }
}

async function getTransfers(server: ServerSession, transfersListUri: string): Promise<Array<Transfer & { type: 'Transfer-v0'}>> {
  // TODO: this is not finished.

  const transferUris: string[] = []
  for await (const { item, pageUrl } of paginatedListIterator<ObjectReference>(
    server,
    transfersListUri,
    TRANSFERS_LIST_TYPE,
    OBJECT_REFERENCE_TYPE
  )) {
    transferUris.push(new URL(item.uri, pageUrl).href)
  }

  const unconcludedTransferUris = (
    await Promise.all(transferUris.map(async uri => await db.isConcludedTransfer(uri) ? undefined : uri))
  ).filter(uri => uri !== undefined) as string[]
  const timeout = calcParallelTimeout(unconcludedTransferUris.length)
  let transfers
  try {
    transfers = (
      await Promise.all(unconcludedTransferUris.map(uri => server.get(uri, { timeout }))) as HttpResponse<Transfer>[]
    ).map(response => ({ ...response.data, uri: response.url } as Transfer))
  } catch (e: unknown) {
    if (e instanceof HttpError && e.status === 404 && attemptsLeft--) {
      // Normally, this can happen only if a transfer has been
      // deleted after the transfer list was obtained. In this
      // case, we should obtain the transfer list again, and
      // retry.
    } else throw e
  }

  return transfers
}

function calcParallelTimeout(numberOfParallelRequests: number): number {
  const n = 6  // a rough guess for the maximum number of parallel connections
  return appConfig.serverApiTimeout * (numberOfParallelRequests + n - 1) / n
}

async function* paginatedListIterator<T>(
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
  yield* pageIterator<T>(server, first)
}

type Page<ItemsType> = {
  items: ItemsType[],
  next?: string,
}

type PageItem<ItemsType> = {
  item: ItemsType,
  pageUrl: string,
}

async function* pageIterator<T>(server: ServerSession, next: string): AsyncIterable<PageItem<T>> {
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

/* If the user is logged in, returns an user context
 * instance. Otherise, returns `undefined`. The obtained user context
 * instance can be used to perform operations on user's behalf. */
export async function obtainUserContext(
  server = defaultServer,
  updateScheduler?: UpdateScheduler,
): Promise<UserContext | undefined> {
  let userId
  try {
    const entrypoint = await server.entrypointPromise
    if (entrypoint === undefined) {
      return undefined
    }
    userId = await getOrCreateUserId(server, entrypoint)
  } catch (e: unknown) {
    switch (true) {
      case e instanceof AuthenticationError:
      case e instanceof HttpError:
        console.error(e)
        alert('There seems to be a problem on the server. Please try again later.')
        await server.logout()
        break
      case e instanceof ServerSessionError:
        console.error(e)
        alert('A network problem has occured. Please check your Internet connection.')
        await server.logout()
        break
    }
    throw e
  }
  return new UserContext(
    server,
    updateScheduler ?? new UpdateScheduler(update.bind(undefined, server, userId)),
    await db.getWalletRecord(userId),
  )
}
