/**
 * An implementation of rfc6749#section-4.1 and rfc7636.
 *
 * Derived from https://github.com/BitySA/oauth2-auth-code-pkce
 */

export type Configuration = {
  authorizationUrl: string;
  clientId: string;
  fetchTimeout: number;
  explicitlyExposedTokens?: string[];
  onAccessTokenExpiry: (refreshAccessToken: () => Promise<AccessContext>) => Promise<AccessContext>;
  onInvalidGrant: (refreshAuthCodeOrRefreshToken: () => Promise<never>) => void;
  redirectUrl: string;
  scopes: string[];
  tokenUrl: string;
  useLocalStorage: boolean;
  extraAuthorizationParams?: ObjStringDict;
  extraRefreshParams?: ObjStringDict;
}

export type State = {
  accessToken?: AccessToken;
  authorizationCode?: string;
  codeChallenge?: string;
  codeVerifier?: string;
  explicitlyExposedTokens?: ObjStringDict;
  refreshToken?: RefreshToken;
  stateQueryParam?: string;
  scopes?: string[];
}

export type RefreshToken = {
  value: string;
  obtainedAt: string;
};

export type AccessToken = {
  value: string;
  expiry: string;
};

export type AccessContext = {
  token?: AccessToken;
  explicitlyExposedTokens?: ObjStringDict;
  scopes?: string[];
  refreshToken?: RefreshToken;
};

export type ObjStringDict = { [_: string]: string };

export class OAuth2Error extends Error { name = 'OAuth2Error'; }

class UnknownError extends OAuth2Error { name = 'UnknownError'; }
class InvalidJson extends OAuth2Error { name = 'InvalidJson'; }
class InvalidScope extends OAuth2Error { name = 'InvalidScope'; }
class InvalidRequest extends OAuth2Error { name = 'InvalidRequest'; }
class InvalidToken extends OAuth2Error { name = 'InvalidToken'; }
class InvalidReturnedStateParam extends OAuth2Error { name = 'InvalidReturnedStateParam'; }
class AuthenticationGrantError extends OAuth2Error { name = 'AuthenticationGrantError'; }
class AccessTokenResponseError extends OAuth2Error { name = 'AccessTokenResponseError'; }

class UnauthorizedClient extends AuthenticationGrantError { name = 'UnauthorizedClient'; }
class AccessDenied extends AuthenticationGrantError { name = 'AccessDenied'; }
class UnsupportedResponseType extends AuthenticationGrantError { name = 'UnsupportedResponseType'; }
class ServerError extends AuthenticationGrantError { name = 'ServerError'; }
class TemporarilyUnavailable extends AuthenticationGrantError { name = 'TemporarilyUnavailable'; }

class InvalidClient extends AccessTokenResponseError { name = 'InvalidClient'; }
class InvalidGrant extends AccessTokenResponseError { name = 'InvalidGrant'; }
class UnsupportedGrantType extends AccessTokenResponseError { name = 'UnsupportedGrantType'; }

const ERROR_STRING_TO_ERROR_CLASS_MAP: { [_: string]: new (message?: string) => Error } = {
  invalid_request: InvalidRequest,
  invalid_grant: InvalidGrant,
  unauthorized_client: UnauthorizedClient,
  access_denied: AccessDenied,
  unsupported_response_type: UnsupportedResponseType,
  invalid_scope: InvalidScope,
  server_error: ServerError,
  temporarily_unavailable: TemporarilyUnavailable,
  invalid_client: InvalidClient,
  unsupported_grant_type: UnsupportedGrantType,
  invalid_json: InvalidJson,
  invalid_token: InvalidToken,
};

/**
 * Translate the raw error strings returned from the server into error classes.
 */
function createErrorInstance(rawError: string): OAuth2Error {
  return new (ERROR_STRING_TO_ERROR_CLASS_MAP[rawError] || UnknownError)();
}

const LOCALSTORAGE_ID = `debtors.oauth2`;
const LOCALSTORAGE_STATE = `${LOCALSTORAGE_ID}-state`;

/**
 * The maximum length for a code verifier for the best security we can offer.
 * Please note the NOTE section of RFC 7636 § 4.1 - the length must be >= 43,
 * but <= 128, **after** base64 url encoding. This means 32 code verifier bytes
 * encoded will be 43 bytes, or 96 bytes encoded will be 128 bytes. So 96 bytes
 * is the highest valid value that can be used.
 */
const RECOMMENDED_CODE_VERIFIER_LENGTH = 96;

/**
 * A sensible length for the state's length, for anti-csrf.
 */
const RECOMMENDED_STATE_LENGTH = 32;

/**
 * Character set to generate code verifier defined in rfc7636.
 */
const PKCE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';


/**
 * Add `timeout` to fetch's options.
 */
async function fetchWithTimeout(resource: RequestInfo, options: RequestInit & { timeout?: number }) {
  const { timeout } = options;

  if (timeout === undefined) {
    return await fetch(resource, options);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  return response;
}

/**
 * OAuth 2.0 client that ONLY supports authorization code flow, with PKCE.
 */
export class OAuth2AuthCodePKCE {
  private config: Configuration;
  private storage: Storage;
  private accessContextPromise?: Promise<AccessContext>;

  constructor(config: Configuration) {
    this.config = config;
    this.storage = config.useLocalStorage ? localStorage : sessionStorage
    this.recoverState();
  }

  /**
   * Tells whether we are redirected by authorization server, so that
   * we are expected to exchange an authorization code for an access
   * token. Will throw an error if the authorization server responded
   * with an error.
   */
  public isReturningFromAuthServer(): boolean {
    const error = OAuth2AuthCodePKCE.extractParamFromUrl(location.href, 'error');
    if (error) {
      throw createErrorInstance(error);
    }

    const authorizationCode = OAuth2AuthCodePKCE.extractParamFromUrl(location.href, 'code');
    if (!authorizationCode) {
      return false;
    }

    const state = this.recoverState()
    const stateQueryParam = OAuth2AuthCodePKCE.extractParamFromUrl(location.href, 'state');
    if (stateQueryParam !== state.stateQueryParam) {
      throw new InvalidReturnedStateParam();
    }

    this.setState({ ...state, authorizationCode });
    return true;
  }

  /**
   * Fetch an authorization grant via redirection. In a sense this function
   * doesn't return because of the redirect behavior (uses `location.replace`).
   */
  public async fetchAuthorizationCode(): Promise<never> {
    const { clientId, extraAuthorizationParams, redirectUrl, scopes, authorizationUrl } = this.config;
    const { codeChallenge, codeVerifier } = await OAuth2AuthCodePKCE.generatePKCECodes();
    const stateQueryParam = OAuth2AuthCodePKCE.generateRandomState(RECOMMENDED_STATE_LENGTH);

    this.setState({
      ...this.recoverState(),
      codeChallenge,
      codeVerifier,
      stateQueryParam,
    });

    let url = authorizationUrl
      + `?response_type=code&`
      + `client_id=${encodeURIComponent(clientId)}&`
      + `redirect_uri=${encodeURIComponent(redirectUrl)}&`
      + `scope=${encodeURIComponent(scopes.join(' '))}&`
      + `state=${stateQueryParam}&`
      + `code_challenge=${encodeURIComponent(codeChallenge)}&`
      + `code_challenge_method=S256`;

    if (extraAuthorizationParams) {
      url += `&${OAuth2AuthCodePKCE.objectToQueryString(extraAuthorizationParams)}`
    }

    location.replace(url);
    return new Promise(() => { })
  }

  /**
   * Tries to get the current access token. If there is none
   * it will try to fetch another one. If it is expired, it will fire
   * [onAccessTokenExpiry] but it's up to the user to call the refresh token
   * function. This is because sometimes not using the refresh token facilities
   * is easier.
   */
  public getAccessContext(attemptTokenRefresh = true): Promise<AccessContext> {
    const { onAccessTokenExpiry } = this.config;

    // This reads the current state from the local storage, which
    // fixes the most annoying problems when two instances of the app
    // run together and update the current state. A real fix would be
    // to use indexedDB to store the state, and perform every state
    // change in a transaction.
    const {
      accessToken,
      authorizationCode,
      explicitlyExposedTokens,
      refreshToken,
      scopes
    } = this.recoverState();

    // We use `this.accessContextPromise` to allow several parallel
    // `getAccessContext()` calls to reuse the same promise, instead
    // of making multiple requests to the auth server (of which only
    // the first would successfully obtain a token).
    if (this.accessContextPromise) {
      return this.accessContextPromise;
    }

    if (authorizationCode) {
      const p = this.accessContextPromise = this.exchangeAuthorizationCodeForAccessToken();
      p.finally(() => {
        this.accessContextPromise = undefined
      })
      return p;
    }

    // Depending on the server (and config), refreshToken may not be available.
    if (
      attemptTokenRefresh &&
      OAuth2AuthCodePKCE.isUsableRefreshToken(refreshToken) &&
      OAuth2AuthCodePKCE.isAccessTokenExpired(accessToken)
    ) {
      const p = this.accessContextPromise = onAccessTokenExpiry(() => this.exchangeRefreshTokenForAccessToken());
      p.finally(() => {
        this.accessContextPromise = undefined
      })
      return p;
    }

    return Promise.resolve({
      token: accessToken,
      explicitlyExposedTokens,
      scopes,
      refreshToken
    });
  }

  /**
   * Forgets the current access token if its value equals the passed
   * value. This is useful when we know that the given token is
   * already useless.
   */
  public invalidateAccessToken(tokenValue: string) {
    const state = this.recoverState()
    if (state.accessToken?.value === tokenValue) {
      state.accessToken = undefined;
      this.setState(state)
    }
  }

  /**
   * Resets the state of the client. Equivalent to "logging out" the user.
   */
  public resetState(): State {
    const state = {}
    this.setState(state);
    return state
  }

  /**
   * Fetch an access token from the remote service.
   */
  private async exchangeAuthorizationCodeForAccessToken(): Promise<AccessContext> {
    let error;
    let state = this.recoverState();
    const { clientId, onInvalidGrant, redirectUrl, explicitlyExposedTokens, tokenUrl, fetchTimeout } = this.config;

    try {
      const { authorizationCode, codeVerifier } = state;
      const body = `grant_type=authorization_code&`
        + `code=${encodeURIComponent(authorizationCode || '')}&`
        + `redirect_uri=${encodeURIComponent(redirectUrl)}&`
        + `client_id=${encodeURIComponent(clientId)}&`
        + `code_verifier=${codeVerifier || ''}`;

      const response = await fetchWithTimeout(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        timeout: fetchTimeout,
        body,
      });

      state.authorizationCode = undefined;
      state.codeChallenge = undefined;
      state.codeVerifier = undefined;
      state.stateQueryParam = undefined;

      if (!response.ok) {
        try {
          error = (await response.json())?.error;
        } catch {
          error = 'invalid_json';
        }
        throw createErrorInstance(error);
      }

      const json = await response.json();
      const extractTokens = (tokenNames: string[]): ObjStringDict => Object.fromEntries(tokenNames
        .map((name) => [name, json[name]])
        .filter(([_name, value]) => value !== undefined)
      );
      const { access_token, expires_in, refresh_token, scope } = json;

      state = {
        ...state,
        accessToken: {
          value: String(access_token),
          expiry: (new Date(Date.now() + (Number(expires_in) * 1000))).toString(),
        },
        refreshToken: refresh_token ? {
          value: String(refresh_token),
          obtainedAt: new Date().toString(),
        } : undefined,
        scopes: scope ? String(scope).split(' ') : undefined,
        explicitlyExposedTokens: explicitlyExposedTokens ? extractTokens(explicitlyExposedTokens) : undefined,
      }

      return {
        token: state.accessToken,
        scopes: state.scopes,
        explicitlyExposedTokens: state.explicitlyExposedTokens,
      };

    } finally {
      this.setState(state);
      if (error === 'invalid_grant') {
        onInvalidGrant(() => this.fetchAuthorizationCode());
      }
    }
  }

  /**
   * Refresh an access token from the remote service.
   */
  private async exchangeRefreshTokenForAccessToken(): Promise<AccessContext> {
    let error;
    let state = this.recoverState()
    const { extraRefreshParams, clientId, tokenUrl, explicitlyExposedTokens, onInvalidGrant, fetchTimeout } = this.config;

    try {
      const { refreshToken } = state;
      let body = `grant_type=refresh_token&`
        + `refresh_token=${refreshToken?.value || ''}&`
        + `client_id=${clientId}`;

      if (extraRefreshParams) {
        body += `&${OAuth2AuthCodePKCE.objectToQueryString(extraRefreshParams)}`
      }

      const response = await fetchWithTimeout(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        timeout: fetchTimeout,
        body,
      });

      state.refreshToken = undefined;

      if (!response.ok) {
        try {
          error = (await response.json())?.error;
        } catch {
          error = 'invalid_json';
        }
        throw createErrorInstance(error);
      }

      const json = await response.json();
      const extractTokens = (tokenNames: string[]): ObjStringDict => Object.fromEntries(tokenNames
        .map((name) => [name, json[name]])
        .filter(([_name, value]) => value !== undefined)
      );
      const { access_token, expires_in, refresh_token, scope } = json;

      state = {
        ...state,
        accessToken: {
          value: String(access_token),
          expiry: (new Date(Date.now() + (Number(expires_in) * 1000))).toString(),
        },
        refreshToken: refresh_token ? {
          value: String(refresh_token),
          obtainedAt: new Date().toString(),
        } : undefined,
        scopes: scope ? String(scope).split(' ') : undefined,
        explicitlyExposedTokens: explicitlyExposedTokens ? extractTokens(explicitlyExposedTokens) : undefined,
      }

      return {
        token: state.accessToken,
        scopes: state.scopes,
        explicitlyExposedTokens: state.explicitlyExposedTokens,
      };

    } finally {
      this.setState(state);
      if (error === 'invalid_grant') {
        onInvalidGrant(() => this.fetchAuthorizationCode());
      }
    }
  }

  private recoverState(): State {
    const s = this.storage.getItem(LOCALSTORAGE_STATE) || '{}';
    try {
      const state = JSON.parse(s);
      if (typeof state !== 'object') {
        throw new TypeError();
      }
      return state

    } catch {
      return this.resetState()
    }
  }

  private setState(state: State) {
    this.storage.setItem(LOCALSTORAGE_STATE, JSON.stringify(state));
  }

  /**
   * Implements *base64url-encode* (RFC 4648 § 5) without padding, which is NOT
   * the same as regular base64 encoding.
   */
  private static base64urlEncode(value: string): string {
    let base64 = btoa(value);
    base64 = base64.replace(/\+/g, '-');
    base64 = base64.replace(/\//g, '_');
    base64 = base64.replace(/=/g, '');
    return base64;
  }

  private static isAccessTokenExpired(accessToken?: AccessToken): boolean {
    return Boolean(!accessToken || (new Date()) >= (new Date(accessToken.expiry)));
  }

  private static isUsableRefreshToken(refreshToken?: RefreshToken): boolean {
    if (!refreshToken) {
      return false;
    }
    const millisecondsSinceObtained = Date.now() - new Date(refreshToken.obtainedAt).getTime()

    // It is not allowed to use the refresh token less than 1 minute
    // since it has been obtained. This prevents the scenario when new
    // tokens are obtained too frequently, possibly in an infinite
    // cycle.
    return millisecondsSinceObtained >= 60000
  }

  private static extractParamFromUrl(url: string, param: string): string {
    const urlParts = url.split('?');
    if (urlParts.length >= 2) {
      const queryString = urlParts[1].split('#')[0];
      for (const kvPair of queryString.split('&')) {
        const [key, value] = kvPair.split('=')
        if (key === param) {
          return decodeURIComponent(value ?? '')
        }
      }
    }
    return ''
  }

  private static objectToQueryString(dict: ObjStringDict): string {
    return Object
      .entries(dict)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
  }

  /**
   * Generates a code_verifier and code_challenge, as specified in rfc7636.
   */
  private static async generatePKCECodes() {
    const output = crypto.getRandomValues(new Uint32Array(RECOMMENDED_CODE_VERIFIER_LENGTH));
    const codeVerifier = OAuth2AuthCodePKCE.base64urlEncode(Array
      .from(output)
      .map((n) => PKCE_CHARSET[n % PKCE_CHARSET.length])
      .join('')
    );
    const buffer = await crypto.subtle.digest('SHA-256', (new TextEncoder()).encode(codeVerifier))
    const hash = new Uint8Array(buffer);
    const hashLength = hash.byteLength;
    let binary = '';
    for (let i: number = 0; i < hashLength; i++) {
      binary += String.fromCharCode(hash[i]);
    }
    const codeChallenge = OAuth2AuthCodePKCE.base64urlEncode(binary)
    return { codeChallenge, codeVerifier };
  }

  /**
   * Generates random state to be passed for anti-csrf.
   */
  private static generateRandomState(lengthOfState: number): string {
    const output = crypto.getRandomValues(new Uint32Array(lengthOfState));
    return Array
      .from(output)
      .map((n) => PKCE_CHARSET[n % PKCE_CHARSET.length])
      .join('');
  }
}
