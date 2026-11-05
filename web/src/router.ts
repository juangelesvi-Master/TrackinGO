import { useSyncExternalStore } from 'react'

// Navegación mínima entre pantallas usando la dirección del navegador.
// Rutas: /  ·  /login  ·  /registro  ·  /recuperar  ·  /reset-password?passwordReset=CODIGO
// (/reset-password es la dirección que Traccar pone en el correo de recuperación).

const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb)
  return () => window.removeEventListener('popstate', cb)
}

export function useLocation() {
  const href = useSyncExternalStore(subscribe, () => location.href)
  const url = new URL(href)
  return { path: url.pathname, params: url.searchParams }
}

export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
