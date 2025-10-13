importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  console.log(`Workbox berhasil dimuat.`);
  
  workbox.core.clientsClaim();
  self.skipWaiting();

  // Perbaikan di sini: Gunakan path relatif
  workbox.precaching.precacheAndRoute([
    { url: './', revision: null },
    { url: 'index.html', revision: null },
    { url: 'script.js', revision: null }, // <-- DIUBAH
    { url: 'style.css', revision: null },
    { url: 'desktop-styles.css', revision: null }, // <-- DITAMBAHKAN
    { url: 'manifest.json', revision: null },
    { url: 'logo-data.js', revision: null },
    { url: 'icons-logo.png', revision: null },
    { url: 'logo-main.png', revision: null },
  ]);

  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'banplex-pages',
    })
  );

  workbox.routing.registerRoute(
    ({ request }) => 
      request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'worker',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'banplex-static-assets',
    })
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
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 60, // Simpan hingga 60 gambar
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 hari
        }),
      ],
    })
  );

  workbox.routing.registerRoute(
    ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'banplex-google-fonts',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 10 }),
      ],
    })
  );

  self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
      self.skipWaiting();
    }
  });

} else {
  console.log(`Workbox gagal dimuat.`);
}