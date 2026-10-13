const CACHE = 'tpb-v5';
const CORE = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/phrase-utils.js',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/data/index.json',
  '/data/france.json',
  '/data/germany.json',
  '/data/greece.json',
  '/data/italy.json',
  '/data/portugal.json',
  '/data/spain.json',
  '/data/china.json',
  '/data/japan.json',
  '/data/korea.json',
  '/data/india.json',
  '/data/indonesia.json',
  '/data/malaysia.json',
  '/data/singapore.json',
  '/data/thailand.json',
  '/data/vietnam.json',
  '/data/turkey.json',
  '/data/brazil.json',
  '/data/mexico.json',
  '/data/morocco.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const update = fetch(request).then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => null);
    if (cached) return cached;
    const response = await update;
    if (response) return response;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
