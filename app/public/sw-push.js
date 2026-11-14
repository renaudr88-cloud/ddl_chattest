// DDL Chat service worker: shows the DDL website's push notifications (same messages the website sends)
// and opens the chat when one is tapped. The website sends JSON { title, body } (push-functions.php).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'DDL';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) {
        // Open the right chat (?dm= / ?room=) in the window that is already open.
        if (url !== self.location.origin + '/' && 'navigate' in c) { try { await c.navigate(url); } catch {} }
        await c.focus(); return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
