const CACHE_NAME = 'a1-tv-cache-v20';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './index.css',
  './manifest.json',
  './assets/a1-tv-logo.png',
  './assets/favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Avoid caching stream URLs (.m3u8, .ts, etc.) - only cache local app assets
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    // Cross-origin request (streams, logos on other CDNs) -> Network-only
    return;
  }

  if (
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/channels.js') ||
    url.pathname.endsWith('/assets/world-cup.dat')
  ) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request);
      })
  );
});
