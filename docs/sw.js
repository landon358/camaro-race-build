// Offline support for the garage. The build writes the full file list and a version in here,
// so every page file, font, model and the parts list is stored on install, and a new deploy
// replaces the old copy.
const VERSION = 'dea5f271c1';
const PRECACHE = ["./","./assets/index-BTjouGVU.js","./assets/index-BkzcXFsX.css","./assets/inter-latin-400-normal-BOOGhInR.woff2","./assets/inter-latin-500-normal-D2bGa7uu.woff2","./assets/inter-latin-600-normal-D273HNI0.woff2","./assets/inter-latin-700-normal-Sckx8rpT.woff2","./assets/inter-latin-800-normal-qNthNgub.woff2","./assets/jetbrains-mono-latin-500-normal-BWZEU5yA.woff2","./assets/jetbrains-mono-latin-600-normal-C8RAYTDA.woff2","./assets/viewer-BK-R0MsI.js","./brand/camaro-badge-240.png","./brand/camaro-badge.png","./brand/camaro-badge.svg","./brand/chevy-performance-black.png","./brand/chevy-performance-white-640.png","./brand/chevy-performance-white.png","./data/db.json","./icon-192.png","./icon-512.png","./img/parts/c-brake-caliper.jpg","./img/parts/e-breather-filter.jpg","./img/parts/e-cam-bearing.jpg","./img/parts/e-cam-phaser.jpg","./img/parts/e-camshaft.jpg","./img/parts/e-catalytic-converter.jpg","./img/parts/e-connecting-rod.jpg","./img/parts/e-crankshaft.jpg","./img/parts/e-cylinder-head.jpg","./img/parts/e-direct-injector.jpg","./img/parts/e-dry-sump-engine.jpg","./img/parts/e-engine-block.jpg","./img/parts/e-exhaust-manifold.jpg","./img/parts/e-expansion-tank.jpg","./img/parts/e-fuel-cell-bladder.jpg","./img/parts/e-fuel-filter.jpg","./img/parts/e-fuel-pressure-regulator.jpg","./img/parts/e-fuel-pump.jpg","./img/parts/e-headers.jpg","./img/parts/e-hp-fuel-pump.jpg","./img/parts/e-ignition-coil.jpg","./img/parts/e-intake-manifold.jpg","./img/parts/e-intercooler.jpg","./img/parts/e-oil-cooler-adapter.jpg","./img/parts/e-oil-cooler.jpg","./img/parts/e-oil-filter.jpg","./img/parts/e-oil-pump.jpg","./img/parts/e-piston.jpg","./img/parts/e-rocker-arm.jpg","./img/parts/e-spark-plug.jpg","./img/parts/e-thermostat.jpg","./img/parts/e-throttle-body.jpg","./img/parts/e-timing-chain.jpg","./img/parts/s-air-dam.jpg","./img/parts/s-body-shell.jpg","./img/parts/s-body-structure.jpg","./img/parts/s-cage-cockpit.jpg","./img/parts/s-cage-door-bars.jpg","./img/parts/s-cage-in-shell.jpg","./img/parts/s-cage-rear-stays.jpg","./img/parts/s-canards.jpg","./img/parts/s-diffuser.jpg","./img/parts/s-digital-dash.jpg","./img/parts/s-door-card.jpg","./img/parts/s-driveshaft-tunnel.jpg","./img/parts/s-fender-vent.jpg","./img/parts/s-fhr-devices.jpg","./img/parts/s-hand-extinguisher.jpg","./img/parts/s-hans-helmet.jpg","./img/parts/s-harness-in-seat.jpg","./img/parts/s-headlamp.jpg","./img/parts/s-heat-shield.jpg","./img/parts/s-kill-switch-pulls.jpg","./img/parts/s-master-switch.jpg","./img/parts/s-naca-duct.jpg","./img/parts/s-race-dash.jpg","./img/parts/s-race-numbers.jpg","./img/parts/s-racing-harness.jpg","./img/parts/s-racing-seat.jpg","./img/parts/s-rear-fascia.jpg","./img/parts/s-rear-wing.jpg","./img/parts/s-roll-cage.jpg","./img/parts/s-seat-on-mount.jpg","./img/parts/s-side-mirror.jpg","./img/parts/s-sound-deadener.jpg","./img/parts/s-splitter.jpg","./img/parts/s-strut-brace.jpg","./img/parts/s-subframe.jpg","./img/parts/s-suppression-bottles.jpg","./img/parts/s-switch-panel.jpg","./img/parts/s-tail-lamp.jpg","./img/parts/s-tow-eye.jpg","./img/parts/s-tow-strap.jpg","./img/parts/s-underbody-rustproof.jpg","./img/parts/s-undercoat-removal.jpg","./img/parts/s-vented-hood.jpg","./img/parts/s-vinyl-wrap.jpg","./img/parts/s-window-net.jpg","./img/parts/s-wing-endplate.jpg","./img/parts/s-wing-swan-neck.jpg","./index.html","./manifest.webmanifest","./models/body-parts.glb","./models/camaro.glb"] || ['./', './index.html', './data/db.json'];
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
