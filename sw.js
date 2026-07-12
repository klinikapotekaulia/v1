/**
 * sw.js — Service Worker Aulia Apotek Klinik
 * Strategi: Cache shell statis, skip Firebase/CDN dynamic calls.
 */

var CACHE_NAME = 'aulia-v6'; // FIX: dinaikkan karena dashboard.js berubah (perbaikan tinggi kontainer grafik Tren Penjualan Periode)

var SHELL_URLS = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './icon-192.png',
    './icon-512.png',
    './js/app.js',
    './js/auth.js',
    './js/dashboard.js'
];

// Install: cache shell
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return Promise.all(
                SHELL_URLS.map(function (url) {
                    return cache.add(url).catch(function (err) {
                        console.warn('[SW] Tidak dapat cache:', url, err.message);
                    });
                })
            );
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

// Activate: bersihkan cache lama
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys
                    .filter(function (k) { return k !== CACHE_NAME; })
                    .map(function (k) { return caches.delete(k); })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

// Fetch: stale-while-revalidate untuk file lokal; network-only untuk Firebase & CDN
self.addEventListener('fetch', function (event) {
    if (event.request.method !== 'GET') return;

    var url = new URL(event.request.url);

    // Jangan intercept Firebase, Google APIs, atau CDN eksternal
    var bypassHosts = [
        'firestore.googleapis.com',
        'identitytoolkit.googleapis.com',
        'securetoken.googleapis.com',
        'googleapis.com',
        'cdn.tailwindcss.com',
        'cdn.jsdelivr.net',
        'cdn.sheetjs.com',
        'cdnjs.cloudflare.com',
        'gstatic.com'
    ];
    for (var i = 0; i < bypassHosts.length; i++) {
        if (url.hostname.indexOf(bypassHosts[i]) !== -1) return;
    }

    // Untuk file lokal: stale-while-revalidate
    event.respondWith(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.match(event.request).then(function (cached) {
                var fetchPromise = fetch(event.request).then(function (response) {
                    if (response && response.status === 200 &&
                        (response.type === 'basic' || response.type === 'cors')) {
                        cache.put(event.request, response.clone());
                    }
                    return response;
                }).catch(function () {
                    return cached;
                });
                return cached || fetchPromise;
            });
        })
    );
});
