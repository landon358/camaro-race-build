// Offline support for the garage. The build writes the full file list and a version in here,
// so every page file, font, model and the parts list is stored on install, and a new deploy
// replaces the old copy.
const VERSION = '__BUILD_VERSION__';
const PRECACHE = self.__PRECACHE__ || ['./', './index.html', './data/db.json'];
const CACHE = `camaro-build-${VERSION}`;

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache so a new version never stores a stale copy
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('camaro-build-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const tell = async (msg) => { for (const c of await self.clients.matchAll()) c.postMessage(msg); };

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const page = req.mode === 'navigate';
  const key = page ? './' : req;

  // pages and the parts list: answer from the device at once, refresh in the background
  if (page || url.pathname.endsWith('/db.json')) {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(req).then(async (res) => {
        if (res.ok) {
          const old = hit?.headers.get('etag') || hit?.headers.get('last-modified');
          const now = res.headers.get('etag') || res.headers.get('last-modified');
          await cache.put(key, res.clone());
          if (hit && old && now && old !== now && !page) tell('updated');
        }
        return res;
      });
      if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
      return fresh;
    }));
    return;
  }

  // everything else is versioned by the build: device copy first
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
