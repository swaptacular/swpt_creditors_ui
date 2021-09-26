import { OAuth2AuthCodePKCE, OAuth2Error } from './auth-code-pkce'

export type LoginAttemptHandler = (login: () => Promise<boolean>) => Promise<boolean>

export type GetTokenOptions = {
  attemptLogin?: boolean,
  attemptTokenRefresh?: boolean,
  onLoginAttempt?: LoginAttemptHandler,
}

export type AuthTokenSource = {
  getToken: (options?: GetTokenOptions) => string | Promise<string>,
  invalidateToken: (token: string) => void | Promise<void>,
  logout: () => void | Promise<void>
}


export class CanNotObtainToken extends Error {
  name = 'CanNotObtainToken'
}


export class Oauth2TokenSource implements AuthTokenSource {
  private helper = new OAuth2AuthCodePKCE({
    fetchTimeout: 2 * appConfig.serverApiTimeout,
    authorizationUrl: appConfig.oauth2.authorizationUrl,
    tokenUrl: appConfig.oauth2.tokenUrl,
    clientId: appConfig.oauth2.clientId,
    redirectUrl: appConfig.oauth2.redirectUrl,
    useLocalStorage: appConfig.oauth2.useLocalStorage,
    extraAuthorizationParams: {},
    scopes: ['access'],
    async onAccessTokenExpiry(refreshAccessToken) {
      // This function is called when the access token has expired,
      // and a refresh token can be used. If the result of
      // `refreshAccessToken()` is returned, an attempt will be made
      // to obtain a new access token.
      //
      // TODO: This functionality is not tested and may not work.
      return refreshAccessToken()
    },
    onInvalidGrant(_redirectToAuthServer) {
      // This function is called when an access token can not be
      // obtained due to invalid grant. If `_redirectToAuthServer` is
      // called it will redirect to the authentication server's login
      // page. In our case, we just do nothing.
    }
  })

  constructor() {
    let isReturningFromAuthServer
    try {
      isReturningFromAuthServer = this.helper.isReturningFromAuthServer()
    } catch (e: unknown) {
      if (e instanceof OAuth2Error) {
        console.log(e.toString())
      } else {
        throw e
      }
    }
    if (isReturningFromAuthServer) {
      // Try to exchange the authentication code for access token as
      // soon as possible, not awaiting the result.
      this.getCurrentToken(false)
    }
  }

  async getToken(options: GetTokenOptions = {}): Promise<string> {
    const {
      attemptLogin = false,
      attemptTokenRefresh = true,
      onLoginAttempt = (async (login) => await login()),
    } = options

    const token = await this.getCurrentToken(attemptTokenRefresh)
    if (!token) {
      if (attemptLogin) {
        await onLoginAttempt(() => this.redirectToLoginPage())
      }
      throw new CanNotObtainToken()
    }

    return token
  }

  invalidateToken(token: string): void {
    this.helper.invalidateAccessToken(token)
  }

  logout(): void {
    this.helper.resetState()
  }

  private async getCurrentToken(attemptTokenRefresh: boolean): Promise<string | undefined> {
    let accessContext
    try {
      accessContext = await this.helper.getAccessContext(attemptTokenRefresh)
    } catch (e: unknown) {
      console.log(e)
      return
    }
    return accessContext.token?.value
  }

  private async redirectToLoginPage(): Promise<never> {
    return await this.helper.fetchAuthorizationCode()
  }

}
