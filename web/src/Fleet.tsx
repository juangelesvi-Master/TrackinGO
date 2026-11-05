import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import FleetMap from './FleetMap'
import { eventText, isUrgent } from './labels'
import { permsOf } from './permissions'
import AdminPage from './panels/AdminPage'
import AlertsPanel from './panels/AlertsPanel'
import GeofencesPanel from './panels/GeofencesPanel'
import HistoryPanel from './panels/HistoryPanel'
import LivePanel from './panels/LivePanel'
import MasterPage from './panels/MasterPage'
import ReportsPage from './panels/ReportsPage'
import { brandOf } from './brand'
import { AuthError, SUPPORT_KEY, connectSocket, getDevices, getDrivers, getEvents, getPositions, type Device, type Driver, type Position, type TraccarEvent, type User } from './traccar'

type Tab = 'live' | 'history' | 'reports' | 'geofences' | 'alerts' | 'admin' | 'master'

const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'En vivo' },
  { id: 'history', label: 'Historial' },
  { id: 'reports', label: 'Reportes' },
  { id: 'geofences', label: 'Geocercas' },
  { id: 'alerts', label: 'Alertas' },
  { id: 'admin', label: 'Admin' },
]

/** Junta avisos sin repetir, del más nuevo al más viejo. */
function mergeEvents(a: TraccarEvent[], b: TraccarEvent[]) {
  const byId = new Map([...a, ...b].map((e) => [e.id, e]))
  return [...byId.values()].sort((x, y) => y.eventTime.localeCompare(x.eventTime)).slice(0, 300)
}

export default function Fleet({ user, onUser, onLogout }: { user: User; onUser: (u: User) => void; onLogout: () => void }) {
  const [devices, setDevices] = useState<Record<number, Device>>({})
  const [positions, setPositions] = useState<Record<number, Position>>({})
  // Puntos que llegan en vivo, para que el mapa recorra el camino y no brinque al último.
  const [trail] = useState(() => new Map<number, Position[]>())
  // Mapa ampliado: esconde la lista de la izquierda.
  const [wide, setWide] = useState(false)
  const [events, setEvents] = useState<TraccarEvent[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [toasts, setToasts] = useState<TraccarEvent[]>([])
  const [unread, setUnread] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('live')
  const [historyFor, setHistoryFor] = useState<{ id: number | null; n: number }>({ id: null, n: 0 })
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [live, setLive] = useState(false)
  const logoutRef = useRef(onLogout)
  useEffect(() => {
    logoutRef.current = onLogout
  })

  const reloadDrivers = useCallback(
    () =>
      getDrivers()
        .then(setDrivers)
        .catch(() => {}),
    [],
  )

  // Después de cambios en Admin se vuelven a leer vehículos y choferes.
  const reloadAdmin = useCallback(() => {
    reloadDrivers()
    // Las posiciones se releen porque el odómetro ajustado vive en la última posición.
    getPositions()
      .then((list) => setPositions(Object.fromEntries(list.map((p) => [p.deviceId, p]))))
      .catch(() => {})
    return getDevices()
      .then((list) => setDevices(Object.fromEntries(list.map((d) => [d.id, d]))))
      .catch((err) => {
        if (err instanceof AuthError) logoutRef.current()
      })
  }, [reloadDrivers])

  useEffect(() => {
    reloadDrivers()
  }, [reloadDrivers])


  // Cambiarlo vuelve a cargar todo desde el servidor y reabre la conexión en vivo.
  const [reloadKey, setReloadKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refresh = useCallback(() => {
    setRefreshing(true)
    setReloadKey((k) => k + 1)
  }, [])

  // Al volver a la app después de un rato (por ejemplo, desde otra app en el celular), se actualiza sola.
  useEffect(() => {
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 30000) refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', refresh)
    }
  }, [refresh])

  useEffect(() => {
    const mergeDevices = (list: Device[]) => setDevices((prev) => ({ ...prev, ...Object.fromEntries(list.map((d) => [d.id, d])) }))
    const mergePositions = (list: Position[]) =>
      setPositions((prev) => ({ ...prev, ...Object.fromEntries(list.map((p) => [p.deviceId, p])) }))

    trail.clear()
    Promise.all([getDevices(), getPositions()])
      .then(([d, p]) => {
        mergeDevices(d)
        mergePositions(p)
        // Avisos de las últimas 24 horas.
        if (d.length) {
          const now = new Date()
          getEvents(
            d.map((x) => x.id),
            new Date(now.getTime() - 24 * 3600 * 1000),
            now,
          )
            .then((list) => setEvents((prev) => mergeEvents(prev, list)))
            .catch(() => {})
        }
      })
      .catch((err) => {
        if (err instanceof AuthError) logoutRef.current()
      })
      .finally(() => setRefreshing(false))

    return connectSocket((msg) => {
      if (msg.devices) mergeDevices(msg.devices)
      if (msg.positions) {
        for (const p of msg.positions) trail.set(p.deviceId, [...(trail.get(p.deviceId) ?? []), p].slice(-50))
        mergePositions(msg.positions)
      }
      if (msg.events?.length) {
        const fresh = msg.events
        setEvents((prev) => mergeEvents(prev, fresh))
        setUnread((n) => n + fresh.length)
        setToasts((prev) => [...fresh, ...prev].slice(0, 3))
        fresh.forEach((e) => setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== e.id)), 8000))
      }
    }, setLive)
  }, [trail, reloadKey])

  // Pestañas según los permisos del usuario.
  const perms = useMemo(() => permsOf(user), [user])
  // El administrador del servidor es la cuenta Maestro: solo él ve el panel de empresas.
  const isMaster = !!user.administrator
  const brand = useMemo(() => brandOf(user), [user])
  const [supportBy] = useState(() => {
    try {
      return sessionStorage.getItem(SUPPORT_KEY)
    } catch {
      return null
    }
  })
  // Pantallas que tapan el mapa con una página completa.
  const fullPage = tab === 'admin' || tab === 'master' || tab === 'reports'
  const tabs = TABS.filter((t) => (t.id === 'history' || t.id === 'reports' ? perms.history : t.id === 'admin' ? perms.vehicles || perms.users : true))

  const deviceList = useMemo(() => Object.values(devices).sort((a, b) => a.name.localeCompare(b.name)), [devices])

  const openTab = (t: Tab) => {
    // Las pantallas completas dejan una entrada en el historial: así el botón
    // "atrás" del celular (o del navegador) regresa al mapa en vez de salir.
    const isFull = (x: Tab) => x === 'admin' || x === 'master' || x === 'reports'
    if (isFull(t) && !isFull(tab)) history.pushState({ teesaPage: t }, '')
    else if (isFull(t)) history.replaceState({ teesaPage: t }, '')
    setTab(t)
    if (t === 'alerts') setUnread(0)
  }

  const closePage = () => {
    if (history.state?.teesaPage) history.back()
    else setTab('live')
  }

  useEffect(() => {
    const onPop = () => setTab((t) => (t === 'admin' || t === 'master' || t === 'reports' ? 'live' : t))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openHistory = (id: number) => {
    setHistoryFor((h) => ({ id, n: h.n + 1 }))
    setTab('history')
  }

  // Al volver del panel de administración el mapa recupera su tamaño.
  useEffect(() => {
    if (!fullPage) map?.resize()
  }, [fullPage, map])

  return (
    <div className={wide ? 'fleet wide' : 'fleet'}>
      <aside className="sidebar">
        {supportBy && (
          <div className="support-banner">
            Modo soporte: estás viendo el portal de <strong>{user.name}</strong>.{' '}
            <button className="link" onClick={onLogout}>
              Terminar
            </button>
          </div>
        )}
        <header className="sidebar-head">
          <div className="brand" title={brand.name}>
            {brand.logo ? <img className="brand-logo" src={brand.logo} alt="" /> : <span className="brand-dot" />}
            {/* El logo casi siempre ya trae el nombre. */}
            {!brand.logo && <span className="brand-name">{brand.name}</span>}
          </div>
          <div className="head-actions">
            {isMaster && (
              <button className={`link ${tab === 'master' ? 'current' : ''}`} onClick={() => openTab('master')}>
                Maestro
              </button>
            )}
            <button className={`link refresh ${refreshing ? 'spinning' : ''}`} onClick={refresh} disabled={refreshing} title="Actualizar" aria-label="Actualizar">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </button>
            <button className="link" onClick={onLogout} title={user.email}>
              Salir
            </button>
          </div>
        </header>

        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => openTab(t.id)}>
              {t.label}
              {t.id === 'alerts' && unread > 0 && <span className="count">{unread > 99 ? '99+' : unread}</span>}
            </button>
          ))}
        </nav>

        {(tab === 'live' || fullPage) && (
          <LivePanel devices={devices} positions={positions} selectedId={selectedId} onSelect={setSelectedId} onHistory={openHistory} drivers={drivers} canHistory={perms.history} canEngine={perms.engine} />
        )}
        {tab === 'history' && <HistoryPanel key={historyFor.n} map={map} devices={deviceList} initialDeviceId={historyFor.id ?? selectedId} canDelete={perms.users} />}
        {tab === 'geofences' && <GeofencesPanel map={map} devices={deviceList} canEdit={perms.geofences} />}
        {tab === 'alerts' && <AlertsPanel user={user} onUser={onUser} devices={devices} events={events} canEdit={perms.geofences} />}

        <footer className="muted small live">
          <span className={`dot ${live ? 'online' : 'offline'}`} />
          {live ? 'Actualizando en vivo' : 'Reconectando…'}
        </footer>
      </aside>

      <main className="main">
        <FleetMap
          devices={devices}
          positions={positions}
          trail={trail}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showLive={tab !== 'history'}
          onMap={setMap}
          wide={wide}
          onToggleWide={() => setWide((w) => !w)}
        />
        {tab === 'admin' && <AdminPage me={user} devices={deviceList} positions={positions} drivers={drivers} onChanged={reloadAdmin} onBack={closePage} />}
        {tab === 'reports' && perms.history && <ReportsPage devices={deviceList} brand={brand} onBack={closePage} />}
        {tab === 'master' && isMaster && <MasterPage me={user} devices={deviceList} onChanged={reloadAdmin} onBack={closePage} />}
      </main>

      <div className="toasts">
        {toasts.map((e) => {
          const { vehicle, what } = eventText(e, devices)
          return (
            <button key={e.id} className={`toast ${isUrgent(e) ? 'urgent' : ''}`} onClick={() => openTab('alerts')}>
              <strong>{what}</strong>
              <span>{vehicle}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
