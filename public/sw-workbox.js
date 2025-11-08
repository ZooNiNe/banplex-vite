importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

if (workbox) {
  console.log(`Workbox berhasil dimuat.`);
  
  workbox.core.setCacheNameDetails({ prefix: 'banplex'});
  workbox.core.clientsClaim();
  self.skipWaiting();
  try { workbox.navigationPreload.enable(); } catch(_) {}

  workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

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
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'script',
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'banplex-scripts' })
  );

  try {
    const bgSyncPlugin = new workbox.backgroundSync.BackgroundSyncPlugin('banplex-api-queue', {
      maxRetentionTime: 24 * 60
    });
    const isApi = ({url}) => url.pathname.startsWith('/api/');
    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly({ plugins: [bgSyncPlugin] }), 'POST');
    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly({ plugins: [bgSyncPlugin] }), 'PUT');
    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly({ plugins: [bgSyncPlugin] }), 'PATCH');
    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly({ plugins: [bgSyncPlugin] }), 'DELETE');
    workbox.routing.registerRoute(isApi, new workbox.strategies.NetworkOnly(), 'GET');
  } catch (e) {
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


self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    console.error('[Service Worker] Push data error:', e);
    data = { title: 'Notifikasi Baru', body: 'Anda memiliki pembaruan.' };
  }

  const title = data.title || 'BanPlex Notifikasi';
  const options = {
    body: data.body || 'Ada sesuatu yang baru.',
    icon: data.icon || '/public/icons-logo.png', 
    badge: '/public/icons-logo.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.data?.url || '/index.html?page=dashboard'
    },
    actions: data.actions || []
  };

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes('index.html') && client.focused) {
          
          console.log('[Service Worker] App is focused, sending message to UI.');
          client.postMessage({
            type: 'SHOW_IN_APP_NOTIFICATION',
            payload: data // Kirim data notifikasi ke UI
          });
          return; // Berhenti di sini
        }
      }

      console.log('[Service Worker] App not focused, showing OS notification.');
      return self.registration.showNotification(title, options);
    })
  );
});


self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.');
  event.notification.close();

  const action = event.action || 'open';
  const urlToOpen = event.notification.data?.url || '/index.html?page=dashboard';

  if (action === 'dismiss') {
    return; // Do nothing
  }

  event.waitUntil(
    clients.matchAll({
      type: 'window'
    }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
