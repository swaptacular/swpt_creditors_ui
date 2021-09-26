import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosError, AxiosResponse } from 'axios'
import { parse, stringify } from './json-bigint'
import {
  LoginAttemptHandler,
  AuthTokenSource,
  GetTokenOptions,
  CanNotObtainToken,
  Oauth2TokenSource,
} from './oauth2-token-source'


export type {
  LoginAttemptHandler,
  AuthTokenSource,
  GetTokenOptions,
}

export type RequestConfig =
  & AxiosRequestConfig
  & GetTokenOptions

type UserData = {
  entrypoint: string,
  tokenHash: string,
}

const LOCALSTORAGE_KEY = 'debtors.web-api-user'


function buffer2hex(buffer: ArrayBuffer, options = { toUpperCase: true }) {
  const bytes = [...new Uint8Array(buffer)]
  const hex = bytes.map(n => n.toString(16).padStart(2, '0')).join('')
  return options.toUpperCase ? hex.toUpperCase() : hex
}


async function calcSha256(buffer: string | ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof buffer === 'string') {
    buffer = new TextEncoder().encode(buffer)
  }
  return await crypto.subtle.digest('SHA-256', buffer)
}

function getRequestUrl(r: AxiosResponse): string {
  let url = r.request.responseURL
  if (url === undefined) {
    url = r.request.res.responseUrl  // running in Node.js
  }
  return url
}


export class HttpResponse<T = unknown> {
  url: string
  status: number
  headers: any
  data: T
  time: Date

  constructor(r: AxiosResponse) {
    this.url = getRequestUrl(r)
    this.status = r.status
    this.headers = r.headers
    this.data = r.data
    this.time = new Date()
    const data = this.data as any
    if (data && typeof data === 'object' && Object.getPrototypeOf(data) === null && typeof data.uri === 'string') {
      data.uri = this.buildUri(data.uri)
    }
  }

  buildUri(uriReference: string): string {
    return new URL(uriReference, this.url).href
  }
}


export class HttpError extends Error implements HttpResponse {
  name = 'HttpError'
  url: string
  status: number
  headers: any
  data: unknown
  time: Date

  constructor(r: AxiosResponse) {
    super(`Request failed with status code ${r.status}`)
    this.url = getRequestUrl(r)
    this.status = r.status
    this.headers = r.headers
    this.data = r.data
    this.time = new Date()
  }

  buildUri(uriReference: string): string {
    return new URL(uriReference, this.url).href
  }
}


export class ServerSessionError extends Error {
  name = 'ServerSessionError'
}


export class AuthenticationError extends ServerSessionError {
  name = 'AuthenticationError'
}


export class ServerSession {
  readonly entrypointPromise: Promise<string | undefined>

  private tokenSource: AuthTokenSource
  private loginAttemptHandler?: LoginAttemptHandler
  private authData?: {
    client: AxiosInstance,
    token: string,
    entrypointResponse?: HttpResponse,
  }

  constructor(options: { tokenSource?: AuthTokenSource, onLoginAttempt?: LoginAttemptHandler } = {}) {
    const { tokenSource = new Oauth2TokenSource(), onLoginAttempt } = options
    this.tokenSource = tokenSource
    this.loginAttemptHandler = onLoginAttempt
    this.entrypointPromise = this.getEntrypoint()
  }

  async login(onLoginAttempt = this.loginAttemptHandler): Promise<void> {
    const entrypoint = await this.entrypointPromise
    if (!entrypoint) {
      await this.authenticate({ attemptLogin: true, onLoginAttempt })
      await ServerSession.redirectHome()
    }
  }

  async logout(): Promise<never> {
    await this.tokenSource.logout()
    ServerSession.saveUserData(undefined)
    return await ServerSession.redirectHome()
  }

  async get(url: string, config?: RequestConfig): Promise<HttpResponse> {
    return await this.makeRequest(
      async client => new HttpResponse(await client.get(url, config)),
      config,
    )
  }

  async getDocument(url: string, config?: RequestConfig): Promise<HttpResponse<ArrayBuffer>> {
    const headers = { ...(config?.headers ?? {}), accept: '*/*' }
    const responseType = 'arraybuffer'
    return await this.get(url, { ...config, headers, responseType }) as HttpResponse<ArrayBuffer>
  }

  async getEntrypointResponse(): Promise<HttpResponse> {
    const entrypoint = await this.entrypointPromise
    if (entrypoint === undefined) {
      throw new Error('undefined entrypoint')
    }

    // Do not make a request at all, if the response saved during the
    // authentication is recent enough.
    let response = this.authData?.entrypointResponse
    if (response?.url !== entrypoint || Number(response.time) < Date.now() - 15000) {
      response = await this.get(entrypoint, { attemptLogin: false })
    }
    return response
  }

  async post(url: string, data?: any, config?: RequestConfig): Promise<HttpResponse> {
    return await this.makeRequest(
      async client => new HttpResponse(await client.post(url, data, config)),
      config,
    )
  }

  async postDocument(url: string, contentType: string, content: ArrayBuffer, config?: RequestConfig): Promise<HttpResponse> {
    const headers = config?.headers
    config = {
      ...config,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Accept': contentType,
      },
      transformRequest: [],
      responseType: 'arraybuffer' as const,
    }
    return await this.post(url, content, config)
  }

  async patch(url: string, data?: any, config?: RequestConfig): Promise<HttpResponse> {
    return await this.makeRequest(
      async client => new HttpResponse(await client.patch(url, data, config)),
      config,
    )
  }

  async delete(url: string, config?: RequestConfig): Promise<HttpResponse> {
    const responseType = 'arraybuffer'
    return await this.makeRequest(
      async client => new HttpResponse(await client.delete(url, { ...config, responseType })),
      config,
    )
  }

  private async authenticate(options?: GetTokenOptions) {
    let token
    try {
      token = await this.tokenSource.getToken({ onLoginAttempt: this.loginAttemptHandler, ...options })
    } catch (e: unknown) {
      if (e instanceof CanNotObtainToken) {
        throw new AuthenticationError('can not obtain token')
      }
      throw e
    }
    const tokenHash = buffer2hex(await calcSha256(token))
    const client = axios.create({
      timeout: appConfig.serverApiTimeout,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      transformRequest: (data) => stringify(data),
      transformResponse: (data, headers) => {
        if (typeof data === 'string' && data.length > 0 && headers['content-type'] === 'application/json') {
          return parse(data)
        }
        return data
      },
    })

    // We still do not know the entrypoint URL for the user that
    // corresponds to the new token. We try to obtain it from the
    // saved user data first. If this fails, we make a "redirect to
    // entrypoint" HTTP request.
    let entrypointResponse
    let entrypoint
    const userData = ServerSession.loadUserData()
    if (tokenHash === userData?.tokenHash) {
      entrypoint = userData.entrypoint
    } else {
      entrypointResponse = await ServerSession.makeEntrypointRequest(client)
      entrypoint = entrypointResponse.url
      ServerSession.saveUserData({ entrypoint, tokenHash })
    }

    const authData = { client, token, entrypointResponse }
    this.authData = authData
    return { authData, entrypoint }
  }

  private async makeRequest<T>(
    reqfunc: (client: AxiosInstance) => Promise<T>,
    options?: GetTokenOptions,
    retryOn401: boolean = true,
  ): Promise<T> {
    const authData = this.authData ?? (await this.authenticate(options)).authData

    try {
      return await reqfunc(authData.client)

    } catch (e: unknown) {
      const error = ServerSession.convertError(e)

      // If the request failed with status 401, the authentication
      // token is invalidated, and the request is retried (only once).
      if (error instanceof HttpError && error.status === 401) {
        await this.tokenSource.invalidateToken(authData.token)
        this.authData = undefined

        if (retryOn401) {
          return await this.makeRequest(reqfunc, options, false)
        }
      }

      throw error
    }
  }

  private async getEntrypoint(): Promise<string | undefined> {
    let entrypoint
    try {
      // By passing `attemptTokenRefresh: false` here, we make sure
      // that an unnecessary network request will not be made, causing
      // a delay, and harming the user experience.
      entrypoint = (await this.authenticate({ attemptLogin: false, attemptTokenRefresh: false })).entrypoint
    } catch (e: unknown) {
      if (e instanceof AuthenticationError) {
        // When the authentication have failed, but the user have not
        // explicitly terminated the previous login session, we
        // pretend that the user is still logged in. (An
        // authentication token will be obtained when needed.)
        entrypoint = ServerSession.loadUserData()?.entrypoint
      } else throw e
    }

    // Note that before we tell the user that he/she is not logged in
    // (`entrypoint === undefined`), we must ensure that there are no
    // authorization tokens remaining in in the browser local storage.
    if (entrypoint === undefined) {
      await this.tokenSource.logout()
    }
    return entrypoint
  }

  private static convertError(e: unknown): unknown {
    if (typeof e === 'object' && e !== null) {
      const error = e as AxiosError
      if (error.isAxiosError) {
        const r = error.response
        if (r) {
          return new HttpError(r)
        }
        return new ServerSessionError(error.message)
      }
    }

    return e
  }

  private static async makeEntrypointRequest(client: AxiosInstance): Promise<HttpResponse> {
    let r
    try {
      r = await client.get(appConfig.serverApiEntrypoint)
    } catch (e: unknown) {
      const error = ServerSession.convertError(e)
      if (error instanceof HttpError) {
        // This function should never throw an `HttpError` to the
        // caller, because it is always executed implicitly, as a part
        // of the authentication process.
        throw new AuthenticationError(error.message)
      }
      throw error
    }

    if (r.status !== 200) {
      throw new AuthenticationError('entrypoint not found')
    }
    return new HttpResponse(r)
  }

  private static redirectHome(): Promise<never> {
    location.replace(appConfig.oauth2.redirectUrl)
    return new Promise(() => { })
  }

  private static loadUserData(): UserData | undefined {
    let userData
    const s = localStorage.getItem(LOCALSTORAGE_KEY)
    if (s) {
      try {
        const obj = JSON.parse(s)
        userData = {
          entrypoint: String(obj.entrypoint),
          tokenHash: String(obj.tokenHash),
        }
      } catch {
        localStorage.removeItem(LOCALSTORAGE_KEY)
      }
    }
    return userData
  }

  private static saveUserData(userData?: UserData): void {
    if (userData) {
      localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(userData));
    } else {
      localStorage.removeItem(LOCALSTORAGE_KEY)
    }
  }

}
