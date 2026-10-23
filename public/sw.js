// S.A.Y.A.D. Service Worker for Offline Study & Native WebAPK Minting
const CACHE_NAME = 'sayad-v35-image-resilience';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/screenshots/screenshot-mobile-1.png',
  '/screenshots/screenshot-mobile-2.png',
  '/screenshots/screenshot-desktop-1.png',
  '/icons/theme-classic-512.png',
  '/icons/theme-titanium-512.png',
  '/icons/theme-glass-512.png',
  '/icons/theme-editorial-512.png'
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.log('[SW] Precache bypass for:', url, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Ignore chrome extension, dev server hot reload & API requests
  if (url.protocol.startsWith('chrome-extension') || url.pathname.includes('@vite') || url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-First for Navigation / HTML Entry (Ensures new published code loads immediately without cache blocking)
  const isNav = event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html') || url.pathname === '/' || url.pathname === '/index.html';

  if (isNav) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match(event.request) || caches.match('/') || caches.match('/index.html');
        })
    );
    return;
  }

  // Stale-While-Revalidate for static assets (images, icons, etc.)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});

