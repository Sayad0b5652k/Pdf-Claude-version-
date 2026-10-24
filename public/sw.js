// S.A.Y.A.D. Service Worker for Offline Study & Native WebAPK Minting
//
// Strategy
//  - Navigations (HTML): network first, but fall back to the cached shell after NAV_TIMEOUT_MS so a
//    weak/hanging connection never leaves the app on a blank screen; offline always uses the cache.
//  - /assets/* (content-hashed by Vite): cache first, they never change under the same URL. Only the
//    newest MAX_HASHED_ASSETS entries are kept so old deploys do not pile up in storage.
//  - Everything else on this origin (icons, pdf.js, vendor libs): stale-while-revalidate.
//  - Google Fonts (css + font files): stale-while-revalidate, so typography also works offline.
const CACHE_NAME = 'sayad-v36-fast-start';
const NAV_TIMEOUT_MS = 3500;
const MAX_HASHED_ASSETS = 24;
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/pdfjs/pdf.min.js',
  '/pdfjs/pdf.worker.min.js',
  '/pdfjs/pdf_viewer.css',
  '/vendor/katex/katex.min.js',
  '/vendor/katex/katex.min.css',
  '/vendor/katex/contrib/auto-render.min.js',
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

// Keeps only the newest MAX_HASHED_ASSETS hashed bundles (cache.keys() is in insertion order).
async function trimHashedAssets(cache) {
  const keys = await cache.keys();
  const hashed = keys.filter((req) => new URL(req.url).pathname.startsWith('/assets/'));
  const excess = hashed.length - MAX_HASHED_ASSETS;
  for (let i = 0; i < excess; i++) {
    await cache.delete(hashed[i]);
  }
}

function putInCache(request, response) {
  return caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
}

async function offlineShell(request) {
  return (
    (await caches.match(request, { ignoreSearch: true })) ||
    (await caches.match('/')) ||
    (await caches.match('/index.html')) ||
    Response.error()
  );
}

function handleNavigation(event) {
  return (async () => {
    const request = event.request;
    const network = fetch(request).then((response) => {
      if (response && response.status === 200) {
        putInCache(request, response.clone()).catch(() => {});
      }
      return response;
    });

    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), NAV_TIMEOUT_MS);
    });

    try {
      const winner = await Promise.race([network, timeout]);
      clearTimeout(timer);
      if (winner) return winner;
      // Network is too slow: show the cached shell now (the fetch keeps going and refreshes the cache).
      const cached = await caches.match(request, { ignoreSearch: true }) || await caches.match('/');
      if (cached) {
        network.catch(() => {});
        return cached;
      }
      return await network;
    } catch (err) {
      clearTimeout(timer);
      return offlineShell(request);
    }
  })();
}

function handleHashedAsset(event) {
  return (async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response && response.status === 200 && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, response.clone());
      trimHashedAssets(cache).catch(() => {});
    }
    return response;
  })();
}

function handleStaleWhileRevalidate(event, allowOpaque) {
  return caches.match(event.request).then((cachedResponse) => {
    const fetchPromise = fetch(event.request).then((networkResponse) => {
      const cacheable = networkResponse && (
        (networkResponse.status === 200 && networkResponse.type === 'basic') ||
        (allowOpaque && (networkResponse.ok || networkResponse.type === 'opaque'))
      );
      if (cacheable) {
        putInCache(event.request, networkResponse.clone()).catch(() => {});
      }
      return networkResponse;
    }).catch(() => null);

    if (cachedResponse) {
      // Keep the worker alive until the background refresh finishes.
      event.waitUntil(fetchPromise);
      return cachedResponse;
    }
    return fetchPromise.then((res) => res || Response.error());
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Ignore chrome extension, dev server hot reload & API requests
  if (url.protocol.startsWith('chrome-extension') || url.pathname.includes('@vite') || url.pathname.startsWith('/api/')) {
    return;
  }

  // Large media is streamed with Range requests; the Cache API cannot answer those correctly.
  if (event.request.headers.has('range')) return;

  const isFontHost = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFontHost) return;

  const isNav = event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html') || url.pathname === '/' || url.pathname === '/index.html';
  if (isNav && url.origin === self.location.origin) {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(handleHashedAsset(event));
    return;
  }

  event.respondWith(handleStaleWhileRevalidate(event, isFontHost));
});
