import { ServerSession, Oauth2TokenSource, HttpResponse, HttpError, ServerSessionError } from '../web-api'
import { server as defaultServer } from './server'
import type { Wallet, PinInfo } from '../web-api-schemas'

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

class PinResetContext {
  constructor(public server: ServerSession, public pinInfoUri: string) { }

  async resetPin(newPin: string): Promise<void> {
    try {
      let attemptsLeft = 10
      while (true) {
        const pinInfo = await this.fetchPinInfo()
        const requestBody = {
          type: 'PinInfo',
          status: 'on',
          latestUpdateId: pinInfo.latestUpdateId + 1n,
          newPin,
        }
        try {
          await this.server.patch(this.pinInfoUri, requestBody, { attemptLogin: false })
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

  private async fetchPinInfo(): Promise<PinInfo> {
    const response = await this.server.get(this.pinInfoUri, { attemptLogin: false }) as HttpResponse<PinInfo>
    return response.data
  }
}

/* If the user is logged in and PIN is not required for potentially
 * dangerous operations, returns a PIN reset context
 * instance. Otherwise, returns `undefined`. The obtained PIN reset
 * context instance can only be used to reset the user's PIN, and
 * logout. */
export async function obtainPinResetContext(server?: ServerSession): Promise<PinResetContext | undefined> {
  server ??= new ServerSession({
    tokenSource: new Oauth2TokenSource(true),
    onLoginAttempt: async (login) => {
      if (confirm('This operation requires authentication. You will be redirected to the login page.')) {
        return await login()
      }
      return false
    }
  })
  const entrypoint = await server.entrypointPromise
  if (entrypoint === undefined) {
    return undefined  // not logged in
  }
  const walletResponse = await server.getEntrypointResponse() as HttpResponse<Wallet>
  if (walletResponse.data.requirePin) {
    return undefined  // PIN is required for potentially dangerous operations
  }
  const pinInfoUri = walletResponse.buildUri(walletResponse.data.pinInfo.uri)
  return new PinResetContext(server, pinInfoUri)
}
