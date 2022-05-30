import { ServerSession } from '../web-api'
export * from '../web-api'
export * from '../web-api-schemas'

export const server = new ServerSession({
  onLoginAttempt: async (login) => {
    // TODO: Consider not using `confirm()` or `alert()` anywhere.
    // These functions pause the event loop, which may result in
    // indexDB locks being held indefinitely, or broadcast channel
    // messages not being processed. It is not clear whether,
    // though, if this is a practical problem or not.
    if (confirm('This operation requires authentication. You will be redirected to the login page.')) {
      return await login()
    }
    return false
  }
})
