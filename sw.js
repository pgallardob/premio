const CACHE = 'olivos-public-0.2.0';
const SHELL = [
  '/offline.html', '/assets/css/tokens.css', '/assets/css/pwa.css',
  '/assets/images/app/icon-192.png', '/img/logoolivos.jpeg',
  '/vendor/manrope-400.woff2', '/vendor/manrope-700.woff2', '/vendor/syne-600.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names
    .filter((name) => name.startsWith('olivos-public-') && name !== CACHE)
    .map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }
  const publicAsset = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/vendor/') || url.pathname === '/img/logoolivos.jpeg';
  if (!publicAsset || url.search) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch {
      const cached = await cache.match(request);
      return cached ?? Response.error();
    }
  })());
});
