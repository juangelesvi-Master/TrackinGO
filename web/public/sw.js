// Service worker de Traking GO: permite instalar la app y recibe las notificaciones push.
const SHELL = 'trakinggo-shell-v2'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Páginas: siempre del servidor; si no hay internet, la última copia guardada.
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(SHELL).then((c) => c.put('/', copy))
        return res
      })
      .catch(() => caches.match('/')),
  )
})

// Avisos que manda Traccar a través de Firebase Cloud Messaging.
self.addEventListener('push', (e) => {
  let payload = {}
  try {
    payload = e.data ? e.data.json() : {}
  } catch {
    payload = { notification: { body: e.data ? e.data.text() : '' } }
  }
  const n = payload.notification || {}
  const data = payload.data || {}
  e.waitUntil(
    self.registration.showNotification(n.title || data.title || 'Traking GO', {
      body: n.body || data.body || data.message || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.eventId || undefined,
      data: { url: '/' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin)
      return open ? open.focus() : self.clients.openWindow('/')
    }),
  )
})
