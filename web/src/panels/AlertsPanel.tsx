import { useEffect, useMemo, useState } from 'react'
import { stayText, useGeofenceStays } from '../geofenceStay'
import { eventText, isUrgent } from '../labels'
import { myStaff, shareRules } from '../staff'
import PhoneBox from './PhoneBox'
import {
  createNotification,
  deleteNotification,
  formatDateTime,
  getGeofences,
  getNotificators,
  getNotifications,
  assignedDevice,
  type Device,
  type Driver,
  type Notification,
  type TraccarEvent,
  type User,
} from '../traccar'

// Reglas que ofrecemos. Cada una es una "notificación" de Traccar que aplica a todos los vehículos.
const RULES: { type: string; title: string; hint: string }[] = [
  { type: 'geofenceEnter', title: 'Entrada a geocerca', hint: 'Cuando un vehículo entra a una zona.' },
  { type: 'geofenceExit', title: 'Salida de geocerca', hint: 'Cuando un vehículo sale de una zona. Dice cuánto tiempo estuvo dentro y cuánto detenido.' },
  { type: 'deviceOverspeed', title: 'Exceso de velocidad', hint: 'Usa el límite de cada vehículo (se pone en Administración).' },
  { type: 'deviceOffline', title: 'Rastreador desconectado', hint: 'Cuando un equipo deja de reportar.' },
  { type: 'ignitionOn', title: 'Motor encendido', hint: 'Si el rastreador detecta la ignición.' },
  { type: 'ignitionOff', title: 'Motor apagado', hint: 'Si el rastreador detecta la ignición.' },
  { type: 'alarm', title: 'Alarmas del equipo', hint: 'Botón de pánico, corte de energía, batería baja, etc.' },
  { type: 'maintenance', title: 'Mantenimiento', hint: 'Cuando a un vehículo le toca un servicio (Admin → Mantenimiento).' },
  { type: 'driverChanged', title: 'Cambio de chofer', hint: 'Si el vehículo tiene lector de tarjeta para choferes.' },
]

interface Props {
  user: User
  onUser: (u: User) => void
  canEdit: boolean
  devices: Record<number, Device>
  drivers: Driver[]
  events: TraccarEvent[]
}

export default function AlertsPanel({ user, onUser, devices, drivers, events, canEdit }: Props) {
  const [tab, setTab] = useState<'recent' | 'rules'>('recent')
  // Filtro de avisos: '' = todos, 'v:ID' = un vehículo, 'c:ID' = un conductor (avisos de su vehículo asignado).
  const [filter, setFilter] = useState('')
  const [rules, setRules] = useState<Notification[]>([])
  const [mailAvailable, setMailAvailable] = useState(false)
  const [mail, setMail] = useState(false)
  const [pushAvailable, setPushAvailable] = useState(false)
  const [busyType, setBusyType] = useState<string | null>(null)
  const [geofenceNames, setGeofenceNames] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const stays = useGeofenceStays(events)

  const deviceOptions = useMemo(() => Object.values(devices).sort((a, b) => a.name.localeCompare(b.name)), [devices])
  const driverOptions = useMemo(() => [...drivers].sort((a, b) => a.name.localeCompare(b.name)), [drivers])
  const filterDriver = filter.startsWith('c:') ? drivers.find((d) => d.id === Number(filter.slice(2))) : undefined
  const filterDeviceId = filter.startsWith('v:') ? Number(filter.slice(2)) : filterDriver ? assignedDevice(filterDriver) : null
  const shown = useMemo(() => {
    if (!filter) return events
    return events.filter(
      (e) =>
        (filterDeviceId != null && e.deviceId === filterDeviceId) ||
        // Cambio de chofer: también cuenta si el aviso trae la tarjeta de este conductor.
        (filterDriver && e.attributes?.driverUniqueId === filterDriver.uniqueId),
    )
  }, [events, filter, filterDeviceId, filterDriver])

  useEffect(() => {
    getNotifications().then(setRules).catch(() => setError('No se pudieron cargar las reglas.'))
    getNotificators()
      .then((n) => {
        setMailAvailable(n.some((x) => x.type === 'mail'))
        setPushAvailable(n.some((x) => x.type === 'firebase'))
      })
      .catch(() => {})
    getGeofences()
      .then((list) => setGeofenceNames(Object.fromEntries(list.map((g) => [g.id, g.name]))))
      .catch(() => {})
  }, [])

  const toggle = async (type: string) => {
    setBusyType(type)
    setError('')
    try {
      const existing = rules.filter((r) => r.type === type && r.always)
      if (existing.length) {
        await Promise.all(existing.map((r) => deleteNotification(r.id)))
        setRules(rules.filter((r) => !existing.includes(r)))
      } else {
        const notificators = ['web', ...(mail ? ['mail'] : []), ...(pushAvailable ? ['firebase'] : [])].join(',')
        const created = await createNotification({ type, always: true, notificators, attributes: {} })
        setRules([...rules, created])
        // Que también le llegue al personal (monitoristas, supervisores…).
        const staff = await myStaff(user).catch(() => [])
        await shareRules(
          staff.map((u) => u.id),
          [created.id],
        ).catch(() => {})
      }
    } catch {
      setError('No se pudo cambiar la regla.')
    } finally {
      setBusyType(null)
    }
  }

  return (
    <div className="panel">
      <div className="segmented">
        <button className={tab === 'recent' ? 'active' : ''} onClick={() => setTab('recent')}>
          Avisos recientes
        </button>
        <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>
          Qué avisar
        </button>
      </div>

      {tab === 'recent' && (deviceOptions.length > 1 || driverOptions.length > 0) && (
        <div className="alert-filter">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar avisos">
            <option value="">Todos los vehículos y conductores</option>
            <optgroup label="Vehículo">
              {deviceOptions.map((d) => (
                <option key={d.id} value={`v:${d.id}`}>
                  {d.name}
                </option>
              ))}
            </optgroup>
            {driverOptions.length > 0 && (
              <optgroup label="Conductor">
                {driverOptions.map((d) => (
                  <option key={d.id} value={`c:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {filterDriver && (
            <div className="muted small">
              {filterDeviceId != null && devices[filterDeviceId]
                ? `Avisos de su vehículo asignado: ${devices[filterDeviceId].name}`
                : 'Este conductor no tiene vehículo asignado (Admin → Choferes).'}
            </div>
          )}
          {filter && <div className="muted small">{shown.length} de {events.length} avisos</div>}
        </div>
      )}

      {tab === 'recent' && (
        <ul className="device-list">
          {shown.map((e) => {
            const { vehicle, what } = eventText(e, devices, geofenceNames[e.geofenceId])
            return (
              <li key={e.id}>
                <span className={`dot ${isUrgent(e) ? 'urgent' : 'online'}`} />
                <div className="device-info">
                  <div className="device-name">{what}</div>
                  {stays[e.id] && <div className="small">{stayText(stays[e.id])}</div>}
                  <div className="muted small">
                    {vehicle} · {formatDateTime(e.eventTime)}
                  </div>
                </div>
              </li>
            )
          })}
          {events.length === 0 && <li className="muted empty">Sin avisos en las últimas 24 horas. Activa reglas en “Qué avisar”.</li>}
          {events.length > 0 && shown.length === 0 && <li className="muted empty">Sin avisos para este filtro en las últimas 24 horas.</li>}
        </ul>
      )}

      {tab === 'rules' && (
        <div className="panel-form">
          <PhoneBox user={user} onUser={onUser} />
          {!canEdit && <div className="notice">Solo un supervisor o administrador puede cambiar qué se avisa.</div>}
          {canEdit && mailAvailable && (
            <label className="check">
              <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} />
              Las reglas que active también llegan por correo
            </label>
          )}
          {RULES.map((r) => {
            const on = rules.some((n) => n.type === r.type && n.always)
            return (
              <label key={r.type} className="rule">
                <div>
                  <div className="device-name">{r.title}</div>
                  <div className="muted small">{r.hint}</div>
                </div>
                <input type="checkbox" className="switch" checked={on} disabled={!canEdit || busyType === r.type} onChange={() => toggle(r.type)} />
              </label>
            )
          })}
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </div>
  )
}
