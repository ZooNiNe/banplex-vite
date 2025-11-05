importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  console.log(`Workbox berhasil dimuat.`);
  
  workbox.core.setCacheNameDetails({ prefix: 'banplex' });
  workbox.core.clientsClaim();
  self.skipWaiting();
  // perf: enable navigation preload to speed up first paint on slow 3G
  try { workbox.navigationPreload.enable(); } catch(_) {}

  // Perbaikan di sini: Gunakan path relatif
  // precache app shell & key assets (keep list small to minimize install time)
  workbox.precaching.precacheAndRoute([
    { url: './', revision: null },
    { url: 'index.html', revision: null },
    { url: 'style.css', revision: null },
    { url: 'desktop-styles.css', revision: null },
    { url: 'public/manifest.json', revision: null },
    { url: 'public/icons-logo.png', revision: null },
    { url: 'public/logo-cv-aba.png', revision: null },
    { url: 'public/icons-logo.webp', revision: null }, // optional modern format
    { url: 'public/logo-cv-aba.webp', revision: null }, // optional modern format
    { url: 'root_files/app.js', revision: null },
  ]);

  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'banplex-pages',
    })
  );

  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'style' || request.destination === 'worker',
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'banplex-static-assets' })
  );
  // scripts benefit from SWR too, fallback to preload/network
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'script',
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'banplex-scripts' })
  );

  // ... sisa kode tetap sama ...
  try {
    const bgSyncPlugin = new workbox.backgroundSync.BackgroundSyncPlugin('banplex-api-queue', {
      maxRetentionTime: 24 * 60 // Retry for up to 24 hours
    });

    const isApi = ({url}) => url.pathname.startsWith('/api/');

    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly({ plugins: [bgSyncPlugin] }), 'POST');
    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly({ plugins: [bgSyncPlugin] }), 'PUT');
    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly({ plugins: [bgSyncPlugin] }), 'PATCH');
    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly({ plugins: [bgSyncPlugin] }), 'DELETE');
    // GETs to /api should also bypass cache completely
    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly(), 'GET');
  } catch (e) {
    // BackgroundSync may be unavailable in some environments; fall back to NetworkOnly
    const isApi = ({url}) => url.pathname.startsWith('/api/');
    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly());
  }

  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'banplex-images',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    })
  );

  workbox.routing.registerRoute(
    ({ url }) => (
      url.origin === 'https://fonts.googleapis.com' ||
      url.origin === 'https://fonts.gstatic.com' ||
      url.origin === 'https://cdn.jsdelivr.net' ||
      url.origin === 'https://cdnjs.cloudflare.com' ||
      url.origin === 'https://unpkg.com' ||
      url.origin === 'https://www.gstatic.com'
    ),
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'banplex-external-cdn' })
  );

  self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
      self.skipWaiting();
    }
  });

} else {
  console.log(`Workbox gagal dimuat.`);
}
