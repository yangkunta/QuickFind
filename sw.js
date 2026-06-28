const CACHE_NAME = 'quickfind-v4';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './crypto.js',
  './gdrive.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // For HTML navigation requests (e.g. visiting the URL directly)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If offline, return the cached index.html
        return caches.match('./index.html', {ignoreSearch: true});
      })
    );
    return;
  }

  // For other requests (CSS, JS, images, etc.)
  event.respondWith(
    caches.match(event.request, {ignoreSearch: true}).then(response => {
      return response || fetch(event.request);
    })
  );
});
