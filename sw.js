/* DOUGH_FORMULATOR service worker: cache-first with background refresh, so the
 * app works offline and picks up new versions on the next load. */

const CACHE = 'dough-formulator-v3';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/calculator.js',
    './js/storage.js',
    './js/app.js',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

    event.respondWith(
        caches.open(CACHE).then(async (cache) => {
            const cached = await cache.match(req, { ignoreSearch: true });
            const network = fetch(req)
                .then((res) => {
                    if (res && res.ok) cache.put(req, res.clone());
                    return res;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});
