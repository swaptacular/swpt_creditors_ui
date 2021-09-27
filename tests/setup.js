const axios = require('axios')

// This is a workaroud that allows us to make cross-origin requests in
// jest's "jsdom" testing environment. For details see:
// https://stackoverflow.com/questions/51054286/cross-origin-http-request-originating-from-server-side-nodejs-axios-jsdom
axios.defaults.adapter = require('axios/lib/adapters/http')

require("fake-indexeddb/auto")

globalThis.Blob = require("cross-blob")
globalThis.TextEncoder = require("util").TextEncoder
globalThis.TextDecoder = require("util").TextDecoder
globalThis.crypto = {
  subtle: {
    async digest() {
      return Int8Array.from({length: 32}).map(() => 0).buffer
    }
  }
}
