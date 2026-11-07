const CACHE_NAME = 'yogesh-streamer-v2.2.0-official';
const STATIC_ASSETS = [
    '/manifest.webmanifest',
    '/logo.jpg',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.12/hls.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.7.11/shaka-player.compiled.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch(() => {});
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Aggressively delete ALL prior caches so users see latest updates immediately
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map(k => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Never cache app HTML shell, video chunks, live streams, or API endpoints
    if (url.pathname === '/app' ||
        url.pathname === '/app.html' ||
        url.pathname === '/watch' ||
        url.pathname.includes('/proxy/') ||
        url.pathname.includes('/stream/') ||
        url.pathname.includes('/catalog/') ||
        url.pathname.includes('/manifest.json') ||
        url.pathname.includes('/api/') ||
        url.pathname.includes('.m3u8') ||
        url.pathname.includes('.mpd') ||
        url.pathname.includes('.mp4') ||
        url.pathname.includes('.ts')) {
        return; // Always direct to network
    }

    // Network-first strategy with cache fallback for static CDNs
    event.respondWith(
        fetch(req)
            .then((networkRes) => {
                if (networkRes && networkRes.status === 200 && req.method === 'GET') {
                    const resClone = networkRes.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, resClone));
                }
                return networkRes;
            })
            .catch(() => caches.match(req))
    );
});
