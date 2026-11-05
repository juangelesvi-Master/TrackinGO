import { useEffect, useState } from 'react'
import { disablePush, enablePush, isInstalled, isIosBrowser, pushState, type PushState } from '../push'
import type { User } from '../traccar'

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
}

// El navegador avisa una sola vez que se puede instalar; se guarda para el botón.
let deferredPrompt: InstallPrompt | null = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e as InstallPrompt
})

/** Instalar la app en el celular y activar los avisos push en este dispositivo. */
export default function PhoneBox({ user, onUser }: { user: User; onUser: (u: User) => void }) {
  const [state, setState] = useState<PushState | null>(null)
  const [canInstall, setCanInstall] = useState(() => !!deferredPrompt)
  const [installed] = useState(isInstalled)
  const [iosHelp, setIosHelp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    pushState().then(setState)
    const onPrompt = () => setCanInstall(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      deferredPrompt = null
      setCanInstall(false)
    } else setIosHelp(true)
  }

  const togglePush = async () => {
    setBusy(true)
    setError('')
    try {
      if (state === 'on') {
        onUser(await disablePush(user))
        setState('off')
      } else {
        onUser(await enablePush(user))
        setState('on')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'denied') {
        setState(await pushState())
        setError('No diste permiso para avisos. Puedes activarlo en los ajustes del navegador.')
      } else setError('No se pudieron activar los avisos en este dispositivo.')
    } finally {
      setBusy(false)
    }
  }

  const showInstall = !installed && (canInstall || isIosBrowser())
  if (!showInstall && (state === null || state === 'unavailable')) return null

  return (
    <div className="phone-box">
      <div className="device-name">En este dispositivo</div>
      {showInstall && (
        <button className="secondary" onClick={install}>
          Instalar la app
        </button>
      )}
      {iosHelp && <p className="muted small">En iPhone: toca el botón Compartir de Safari y elige “Agregar a pantalla de inicio”. Después abre Traking GO desde el ícono.</p>}
      {state === 'blocked' && <p className="muted small">Los avisos están bloqueados para esta página. Actívalos en los ajustes del navegador.</p>}
      {(state === 'on' || state === 'off') && (
        <label className="rule">
          <div>
            <div className="device-name">Avisos en el celular</div>
            <div className="muted small">{state === 'on' ? 'Te llegan aunque la app esté cerrada.' : 'Recibe las alertas aunque la app esté cerrada.'}</div>
          </div>
          <input type="checkbox" className="switch" checked={state === 'on'} disabled={busy} onChange={togglePush} />
        </label>
      )}
      {isIosBrowser() && state === 'unavailable' && !installed && <p className="muted small">En iPhone los avisos funcionan después de instalar la app.</p>}
      {error && <div className="error">{error}</div>}
    </div>
  )
}
