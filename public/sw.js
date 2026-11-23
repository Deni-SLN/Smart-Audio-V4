const CACHE_NAME = 'musik-pintar-v9';
const AUDIO_CACHE = 'musik-pintar-audio-v4';

// Install
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll([
                '/',
                '/index.html',
                '/manifest.json',
                '/favicon.svg',
                '/icon-192.png',
                '/icon-512.png'
            ]);
        })
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME && key !== AUDIO_CACHE)
                    .map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch - Network first with cache fallback for HTML, Cache first for audio
self.addEventListener('fetch', event => {
    // Only handle GET requests - Cache API does not support POST, PATCH, PUT, DELETE
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // Jangan sentuh request lintas domain (Neon, API, CDN), proxy /api/ (Google Drive),
    // dan request Range (streaming audio/video) — biarkan browser menanganinya langsung.
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.headers.has('range')) {
        return;
    }

    // Audio files (same-origin) - Cache first for offline playback
    if (event.request.destination === 'audio' ||
        url.pathname.endsWith('.mp3') ||
        url.pathname.endsWith('.wav') ||
        url.pathname.endsWith('.ogg')) {

        event.respondWith(
            caches.open(AUDIO_CACHE).then(cache => {
                return cache.match(event.request).then(cached => {
                    if (cached) return cached;

                    return fetch(event.request).then(response => {
                        // Only cache successful basic/cors responses
                        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
                            try {
                                cache.put(event.request, response.clone());
                            } catch(e) {}
                        }
                        return response;
                    }).catch(() => {
                        return new Response('', { status: 503, statusText: 'Offline' });
                    });
                });
            })
        );
        return;
    }

    // HTML/CSS/JS local assets - Network first
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        try { cache.put(event.request, clone); } catch(e) {}
                    });
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// Message handler for precaching audio URLs
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CACHE_AUDIO') {
        const urls = event.data.urls || [];
        caches.open(AUDIO_CACHE).then(cache => {
            urls.forEach(url => {
                fetch(url).then(response => {
                    if (response.ok) {
                        try { cache.put(url, response); } catch(e) {}
                    }
                }).catch(() => {});
            });
        });
    }
});
