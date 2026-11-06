// Service worker de Traking GO: permite instalar la app y recibe las notificaciones push.

self.addEventListener('install', () => self.skipWaiting())
// Borra la copia vieja de la página que guardaban versiones anteriores.
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim())))

// Página que se muestra cuando el servidor está apagado o no hay internet.
// Va escrita aquí mismo porque, con el servidor apagado, no se puede pedir nada.
const OFFLINE_PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Server offline · Traking GO</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    background:linear-gradient(160deg,#0f62fe,#0a3fa8);color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center}
  .card{max-width:380px}
  .icon{width:84px;height:84px;margin:0 auto 20px;border-radius:50%;background:rgb(255 255 255 / .14);display:grid;place-items:center}
  h1{margin:0 0 10px;font-size:30px;letter-spacing:.5px}
  p{margin:0 0 8px;line-height:1.5;opacity:.92}
  .small{font-size:13px;opacity:.75;margin-top:18px}
  button{margin-top:22px;padding:13px 32px;border:0;border-radius:10px;background:#fff;color:#0f62fe;font-size:16px;font-weight:700;cursor:pointer}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ffb020;margin-right:6px;animation:b 1.4s infinite}
  @keyframes b{50%{opacity:.25}}
</style></head>
<body><div class="card">
  <div class="icon"><svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path fill="#fff" d="M4 4h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 10h9.5a6 6 0 0 0 0 6H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zm2-7.5a1 1 0 1 0 0 1 1 1 0 0 0 0-1zM18 13a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-1.4 1.9-.7.7 1.4 1.4-1.4 1.4.7.7 1.4-1.4 1.4 1.4.7-.7-1.4-1.4 1.4-1.4-.7-.7-1.4 1.4z"/></svg></div>
  <h1 id="t">Server offline</h1>
  <p id="m">Estamos trabajando para restablecer el servicio. Pronto estará disponible de nuevo.</p>
  <p>Gracias por tu paciencia.</p>
  <button id="b" onclick="check(true)">Reintentar</button>
  <p class="small" id="s"><span class="dot"></span>Revisando cada 30 segundos…</p>
</div>
<script>
  if (navigator.onLine === false) {
    document.getElementById('t').textContent = 'Sin internet'
    document.getElementById('m').textContent = 'Tu celular o computadora no tiene conexión. Revisa tu internet.'
  }
  // Solo se recarga cuando el servidor ya contesta; si no, se queda en esta página.
  var b = document.getElementById('b'), st = document.getElementById('s'), busy = false
  function check(manual) {
    if (busy) return
    busy = true
    if (manual) { b.disabled = true; b.textContent = 'Revisando…' }
    fetch('/api/server', { cache: 'no-store' })
      .then(function (r) { if (r.ok) { location.reload(); return true } })
      .catch(function () {})
      .then(function (ok) {
        busy = false
        if (ok || !manual) return
        b.disabled = false
        b.textContent = 'Reintentar'
        st.innerHTML = '<span class="dot"></span>Todavía no está listo. Seguimos revisando cada 30 segundos…'
      })
  }
  setInterval(function () { check(false) }, 30000)
</script>
</body></html>`

const offline = () => new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })

// Páginas: siempre del servidor. Si el servidor está apagado (Cloudflare responde con
// error 5xx) o no hay internet, se muestra la página de "Server offline".
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.status >= 500) return offline()
        return res
      })
      .catch(() => offline()),
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
