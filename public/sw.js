// S.A.Y.A.D. Service Worker for Offline Study & Native WebAPK Minting
const CACHE_NAME = 'sayad-v43-sharp-zoom-ocr';
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
  '/icons/theme-editorial-512.png',
  '/pdfjs/pdf.min.js',
  '/pdfjs/pdf.worker.min.js',
  '/pdfjs/pdf_viewer.css',
  '/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
  '/pdfjs/standard_fonts/LiberationSans-Bold.ttf',
  '/pdfjs/standard_fonts/LiberationSans-Italic.ttf',
  '/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf',
  '/pdfjs/standard_fonts/FoxitSerif.pfb',
  '/pdfjs/standard_fonts/FoxitSerifBold.pfb',
  '/pdfjs/standard_fonts/FoxitSerifItalic.pfb',
  '/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb',
  '/pdfjs/standard_fonts/FoxitFixed.pfb',
  '/pdfjs/standard_fonts/FoxitSymbol.pfb',
  '/pdfjs/standard_fonts/FoxitDingbats.pfb',
  '/vendor/katex/katex.min.css',
  '/vendor/katex/katex.min.js',
  '/vendor/katex/contrib/auto-render.min.js',
  '/vendor/mermaid.min.js',
  '/vendor/pdf-lib.min.js'
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Precache static shell, local PDF.js engine, and CDN libraries
      await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.log('[SW] Precache bypass for:', url, err))
        )
      );

      // 2. Discover and precache hashed Vite production bundles (/assets/*.js, /assets/*.css) from index.html
      try {
        const htmlRes = await fetch('/index.html', { cache: 'no-cache' });
        if (htmlRes && htmlRes.ok) {
          const htmlText = await htmlRes.clone().text();
          await cache.put('/', htmlRes.clone());
          await cache.put('/index.html', htmlRes);
          const matches = [...htmlText.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)];
          const bundleUrls = [...new Set(matches.map((m) => m[1]))];
          await Promise.allSettled(
            bundleUrls.map((bundleUrl) =>
              cache.add(bundleUrl).catch((err) => console.log('[SW] Bundle precache bypass:', bundleUrl, err))
            )
          );
        }
      } catch (e) {
        console.log('[SW] Dynamic asset discovery skipped:', e);
      }
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

function isCacheableResponse(response, reqUrl = '') {
  if (!response) return false;
  if (response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    if (/\.(?:m?js|css)$/i.test(reqUrl) && ct.includes('text/html')) {
      return false;
    }
    return true;
  }
  if (response.type === 'opaque') {
    return true;
  }
  return false;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (!url.protocol.startsWith('http')) return;

  // Ignore dev server hot reload, unbundled dev source scripts, /.well-known/ & API requests
  // IMPORTANT: Production compiled bundles in /assets/*.js and /assets/*.css MUST be cached for offline PWA launch
  if (
    url.pathname.includes('@vite') ||
    url.pathname.includes('@react-refresh') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/@id/') ||
    url.pathname.startsWith('/.well-known/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  // Network-First for Navigation / HTML Entry (Ensures new published code loads immediately when online, with full offline fallback)
  const isNav =
    event.request.mode === 'navigate' ||
    event.request.headers.get('accept')?.includes('text/html') ||
    url.pathname === '/' ||
    url.pathname === '/index.html';

  if (isNav) {
    // A weak or hanging connection must never leave a blank screen: after 3.5s fall back to the cached shell.
    const fromCache = async () => (await caches.match(event.request)) || (await caches.match('/')) || (await caches.match('/index.html'));
    const timeoutToCache = new Promise((resolve) => setTimeout(async () => resolve(await fromCache()), 3500));
    event.respondWith(
      Promise.race([
        fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cloneForReq = networkResponse.clone();
            const cloneForRoot = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cloneForReq);
              cache.put('/', cloneForRoot);
            });
          }
          return networkResponse;
        }), timeoutToCache.then((r) => r || new Promise(() => {}))])
        .catch(async () => {
          return (
            (await caches.match(event.request)) ||
            (await caches.match(event.request, { ignoreSearch: true })) ||
            (await caches.match('/')) ||
            (await caches.match('/index.html'))
          );
        })
    );
    return;
  }

  // Cache-First with background Stale-While-Revalidate for compiled /assets/* bundles, /pdfjs/*, icons, fonts & CDN scripts
  event.respondWith(
    (async () => {
      const cachedResponse =
        (await caches.match(event.request)) ||
        (await caches.match(event.request, { ignoreSearch: true }));

      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (isCacheableResponse(networkResponse, url.pathname)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
            return networkResponse;
          }
          if (/\.(?:m?js|css)$/i.test(url.pathname)) {
            return null;
          }
          return networkResponse;
        })
        .catch(() => null);

      if (cachedResponse && isCacheableResponse(cachedResponse, url.pathname)) {
        return cachedResponse;
      }

      const networkResult = await fetchPromise;
      if (networkResult) {
        return networkResult;
      }

      // Safe offline fallback so non-critical external scripts/styles never crash or hang page parsing
      if (/\.m?js$/i.test(url.pathname)) {
        return new Response('/* offline fallback */', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
        });
      }
      if (/\.css$/i.test(url.pathname)) {
        return new Response('/* offline fallback */', {
          status: 200,
          headers: { 'Content-Type': 'text/css; charset=utf-8' }
        });
      }
      return new Response('', { status: 503, statusText: 'Offline' });
    })()
  );
});
