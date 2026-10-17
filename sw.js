// Offline support: app shell is cached; data and weather use the network first
// and fall back to the last copy, so the app still opens at a dark site with no signal.
const VERSION = 'simplesky-v3';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/style.css', 'assets/astro.js', 'assets/core.js', 'assets/rating.js',
  'assets/views/home.js', 'assets/views/tonight.js', 'assets/views/events.js', 'assets/views/kit.js', 'assets/views/map.js', 'assets/views/shop.js',
  'assets/icon.svg', 'assets/icon-192.png',
  'data/targets.json', 'data/gear.json', 'data/telescopes.json', 'data/cameras.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cacheable = sameOrigin || /api\.open-meteo\.com|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!cacheable) return;
  // Network first, cache fallback; keeps data fresh but works offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
