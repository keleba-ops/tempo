/* Tempo service worker — installable app shell + offline fallback */
const CACHE_NAME = 'tempo-shell-v4';
const BASE = new URL(self.registration.scope).pathname; // '/' locally, '/tempo/' on GitHub Pages
const OFFLINE_URL = BASE + 'offline.html';
const CORE_ASSETS = [
  BASE,
  OFFLINE_URL,
  BASE + 'manifest.webmanifest',
  BASE + 'favicon.svg',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
  BASE + 'icons/icon-maskable-512.png',
  BASE + 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset)));
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match(BASE)) ||
            (await caches.match(OFFLINE_URL)) ||
            new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        })
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith(BASE + 'assets/') ||
    url.pathname.startsWith(BASE + 'icons/') ||
    url.pathname.startsWith(BASE + 'images/') ||
    url.pathname.startsWith(BASE + 'screenshots/') ||
    url.pathname === BASE + 'favicon.svg' ||
    url.pathname === BASE + 'manifest.webmanifest';

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});
