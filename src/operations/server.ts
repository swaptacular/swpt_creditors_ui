import { ServerSession } from '../web-api'
export * from '../web-api'
export * from '../web-api-schemas'

export const server = new ServerSession({
  onLoginAttempt: async (login) => {
    if (confirm('This operation requires authentication. You will be redirected to the login page.')) {
      return await login()
    }
    return false
  }
})
