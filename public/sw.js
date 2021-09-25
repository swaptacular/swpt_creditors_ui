const appName = 'swpt-creditors-ui'
const cacheName = `${appName}-v0.1.1`
const appFiles = [
  './',
  'index.html',
  'manifest.json',
  'favicon.svg',
  'global.css',
  'config.js',
  'qr-scanner-worker.min.js',
  'material.min.css',
  'material-icons.css',
  'fonts/material-icons.woff2',
  // TODO: List the real file names. Currently random strings are
  // appended to the file names by the bundler, so this is not
  // possible.
  'assets/bundle.css',
  'assets/bundle.js',
]
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install')
  e.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    console.log('[Service Worker] Caching app files')
    await cache.addAll(appFiles)
  })())
})
self.addEventListener('fetch', (e) => {
  e.respondWith((async () => {
    const cache = await caches.open(cacheName)
    const r = await cache.match(e.request, {ignoreSearch: true})
    if (r) { return r }
    return await fetch(e.request)
  })())
})
self.addEventListener('activate', async (e) => {
  e.waitUntil((async () => {
    const keyList = await caches.keys()
    const deleteList = keyList.filter(key => key.startsWith(appName) && key !== cacheName)
    await Promise.all(deleteList.map(key => caches.delete(key)))
  })())
})
