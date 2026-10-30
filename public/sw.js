// Minimal PWA service worker. Authenticated portal content is never cached.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request))
  }
})

// Push events work while the installed app is closed.
self.addEventListener('push', event => {
  if (!event.data) return
  let data
  try { data = event.data.json() } catch { return }
  event.waitUntil(self.registration.showNotification(data.title || 'Chromex', {
    body: data.body || 'New chat message',
    icon: '/chromex-icon-192.png?v=6',
    badge: '/favicon.png?v=6',
    tag: data.tag || 'chromex-chat',
    data: { url: '/?tab=chat' }
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL('/?tab=chat', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target)
        return client.focus()
      }
    }
    return self.clients.openWindow(target)
  })())
})
