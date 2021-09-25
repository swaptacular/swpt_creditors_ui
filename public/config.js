window.appConfig = {
  serverApiEntrypoint: 'https://demo.swaptacular.org/creditors/.creditor',
  serverApiTimeout: 8000,
  oauth2: {
    authorizationUrl: 'https://demo.swaptacular.org/creditors-hydra/oauth2/auth',
    tokenUrl: 'https://demo.swaptacular.org/creditors-hydra/oauth2/token',
    clientId: 'localhost',
    redirectUrl: 'http://localhost:3000/',
    useLocalStorage: true,
  },
  TransferDeletionDelaySeconds: 15 * 86400,
}

window.assert = function assert(condition, msg) {
  if (!condition) {
    let e = new Error(msg)
    e.name = 'AssertionError'
    throw e
  }
}

// if('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('./sw.js')
// }
