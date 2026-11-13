/* Fast Four service worker. It keeps the app shell so the app opens without a network and shows a
   friendly offline page when it cannot. It never touches /api, /socket.io or /.well-known: game
   data always comes live from the server. There is no offline gameplay. */
const VERSION = 'ff-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const PRECACHE = ['/offline.html', '/offline.css', '/icon-192.png', '/favicon.svg'];
const LIVE = ['/api', '/socket.io', '/.well-known', '/health', '/ready'];

const isLive = (url) => LIVE.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || isLive(url)) return;

  // Pages: the network first (so a new release shows at once), the saved copy when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('/')) ?? (await caches.match('/offline.html'))),
    );
    return;
  }

  // Fingerprinted files never change: saved copy first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Icons and the like: the saved copy when there is no network.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
