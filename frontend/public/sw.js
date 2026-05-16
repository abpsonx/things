// SW_VERSION 2026-05-16-04 — bump this string to force re-install on clients
const SW_VERSION = '2026-05-16-04';

self.addEventListener('install', (event) => {
  console.log('[SW] install', SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] activate', SW_VERSION);
  event.waitUntil(clients.claim());
});

self.addEventListener('push', function(event) {
  console.log('[SW] push received', SW_VERSION);

  let data = { title: 'Things', body: 'Ada notifikasi baru untuk kamu.' };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error('[SW] push parse error', e);
    try {
      data = { title: 'Things', body: event.data.text() };
    } catch (_) { /* keep defaults */ }
  }

  const title = data.title || 'Things';
  // Always use a unique tag if none provided so each push pops a fresh
  // banner instead of silently replacing the previous one in the
  // Notification Center. renotify forces a re-alert when the tag matches.
  const tag = data.tag || `things-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const options = {
    body: data.body || '',
    icon: data.icon || '/assets/logo.png',
    // Android tints `badge` as a monochrome silhouette; it MUST be a
    // white-on-transparent PNG or Android renders an empty outlined square.
    badge: '/assets/badge.png',
    tag: tag,
    renotify: true,
    vibrate: [100, 50, 100],
    requireInteraction: false,
    data: {
      url: data.url || '/dashboard'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.error('[SW] showNotification failed', err);
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const urlToOpen = event.notification.data.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
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
