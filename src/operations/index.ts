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
  PinInfo,
} from './server'
import {
  db,
} from './db'
import type {
  WalletRecordWithId,
  ActionRecordWithId,
  ListQueryOptions,
} from './db'
import {
  getOrCreateUserId,
  ensureLoadedTransfers,
} from './db-sync'

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
    const walletRecord = await ensureLoadedTransfers(server, userId)
    assert(walletRecord.logStream.loadedTransfers)

    if (walletRecord.logStream.isBroken) {
      // When log entries has been lost, user's data must be loaded
      // from the server again. If we do this here, it could disturb
      // the user interaction with the UI. Instead, we give up on the
      // update, and invite the user to re-authenticate. (The user's
      // data will be loaded after the authentication.)
      await server.forgetCurrentToken()
    }
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
