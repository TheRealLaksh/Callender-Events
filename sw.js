const CACHE_NAME = 'calibridge-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/js/main.js',
    '/js/config.js',
    '/js/state.js',
    '/js/utils.js',
    '/js/calendar.js',
    '/js/events.js',
    '/js/ics.js',
    '/assets/favicon.jpg',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&family=Inter:wght@400;500;600&display=swap'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});