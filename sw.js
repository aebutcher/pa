const CACHE_NAME = 'plank-tracker-v1';
const ASSETS = [
  '/pa/index.html',
  '/pa/style.css',
  '/pa/app.js',
  '/pa/manifest.json',
  '/pa/icons/icon-192.png',
  '/pa/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      // Directory requests (e.g. /pa/ on install launch) → serve index.html from cache
      const url = event.request.url;
      if (url.endsWith('/pa/') || url.endsWith('/pa')) {
        return caches.match('/pa/index.html').then(r => r || fetch(event.request));
      }
      return fetch(event.request);
    })
  );
});
