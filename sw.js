const CACHE = 'olivos-premio-pages-0.2.1';
const SHELL = [
  '/premio/offline.html', '/premio/assets/css/tokens.css', '/premio/assets/css/pwa.css',
  '/premio/assets/images/app/icon-192.png', '/premio/img/logoolivos.jpeg',
  '/premio/vendor/manrope-400.woff2', '/premio/vendor/manrope-700.woff2', '/premio/vendor/syne-600.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names
    .filter((name) => name.startsWith('olivos-premio-pages-') && name !== CACHE)
    .map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname === '/premio/healthz') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/premio/offline.html')));
    return;
  }
  const publicAsset = url.pathname.startsWith('/premio/assets/') || url.pathname.startsWith('/premio/vendor/') || url.pathname === '/premio/img/logoolivos.jpeg';
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
