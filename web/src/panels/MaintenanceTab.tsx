import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { addLinks, createMaintenance, deleteMaintenance, getMaintenances, updateMaintenance, type Device, type Maintenance, type Position } from '../traccar'
import { Modal } from './Modal'

const DAY = 24 * 3600 * 1000
const MONTH = 30 * DAY
const SUGGESTIONS = ['Cambio de aceite', 'Afinación', 'Revisión de frenos', 'Rotación de llantas', 'Cambio de llantas', 'Verificación', 'Renovación de seguro', 'Refrendo / tenencia']

type Status = 'overdue' | 'soon' | 'ok' | 'unknown'
const STATUS_LABEL: Record<Status, string> = { overdue: 'Vencido', soon: 'Próximo', ok: 'Al día', unknown: 'Sin odómetro' }

const km = (meters: number) => Math.round(meters / 1000).toLocaleString('es-MX')
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
const odometer = (p?: Position) => (typeof p?.attributes.totalDistance === 'number' ? p.attributes.totalDistance : null)

/** Cuánto falta para el servicio y en qué estado está. */
function statusOf(m: Maintenance, position: Position | undefined, now: number) {
  if (m.type === 'fixTime') {
    const left = m.start - now
    const status: Status = left <= 0 ? 'overdue' : left < 15 * DAY ? 'soon' : 'ok'
    const days = Math.ceil(Math.abs(left) / DAY)
    return { status, left: left / m.period, text: left <= 0 ? `hace ${days} días` : `faltan ${days} días`, next: fmtDate(m.start) }
  }
  const current = odometer(position)
  if (current == null) return { status: 'unknown' as Status, left: 1, text: '—', next: `a los ${km(m.start)} km` }
  const left = m.start - current
  // "Próximo" cuando falta menos del 10 % del intervalo (máximo 1,000 km).
  const status: Status = left <= 0 ? 'overdue' : left < Math.min(1_000_000, m.period * 0.1) ? 'soon' : 'ok'
  return {
    status,
    left: left / m.period,
    text: left <= 0 ? `pasado por ${km(-left)} km` : `faltan ${km(left)} km`,
    next: `a los ${km(m.start)} km`,
  }
}

function MaintenanceForm({ devices, positions, onDone, onCancel }: { devices: Device[]; positions: Record<number, Position>; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'totalDistance' | 'fixTime'>('totalDistance')
  const [every, setEvery] = useState('10000')
  const [firstDate, setFirstDate] = useState('')
  const [allDevices, setAllDevices] = useState(true)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(every)
    if (!(n > 0)) return setError('Escribe cada cuánto se hace el servicio.')
    const ids = allDevices ? devices.map((d) => d.id) : [...chosen]
    if (!ids.length) return setError('Elige al menos un vehículo.')
    const period = type === 'totalDistance' ? n * 1000 : n * MONTH
    setBusy(true)
    setError('')
    try {
      const now = Date.now()
      for (const deviceId of ids) {
        const start = type === 'totalDistance' ? (odometer(positions[deviceId]) ?? 0) + period : firstDate ? new Date(`${firstDate}T09:00`).getTime() : now + period
        const m = await createMaintenance({ name: name.trim(), type, start, period, attributes: { deviceId, every: n } })
        await addLinks([{ deviceId, maintenanceId: m.id }])
      }
      onDone()
    } catch {
      setError('No se pudo guardar el servicio.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Nuevo servicio de mantenimiento" onClose={onCancel}>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Servicio
          <input value={name} onChange={(e) => setName(e.target.value)} list="service-names" required autoFocus placeholder="Ej. Cambio de aceite" />
          <datalist id="service-names">
            {SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <div className="segmented inline">
          <button
            type="button"
            className={type === 'totalDistance' ? 'active' : ''}
            onClick={() => {
              setType('totalDistance')
              setEvery('10000')
            }}
          >
            Por kilómetros
          </button>
          <button
            type="button"
            className={type === 'fixTime' ? 'active' : ''}
            onClick={() => {
              setType('fixTime')
              setEvery('6')
            }}
          >
            Por fecha
          </button>
        </div>
        <label>
          {type === 'totalDistance' ? 'Cada cuántos kilómetros' : 'Cada cuántos meses'}
          <input type="number" min={1} value={every} onChange={(e) => setEvery(e.target.value)} required />
        </label>
        {type === 'totalDistance' ? (
          <p className="muted small">El primer aviso será cuando cada vehículo recorra esa distancia a partir de su odómetro actual.</p>
        ) : (
          <label>
            Fecha del próximo servicio (opcional)
            <input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={allDevices} onChange={(e) => setAllDevices(e.target.checked)} />
          Para todos los vehículos
        </label>
        {!allDevices && (
          <div className="check-list">
            {devices.map((d) => (
              <label key={d.id} className="check">
                <input
                  type="checkbox"
                  checked={chosen.has(d.id)}
                  onChange={(e) => {
                    const next = new Set(chosen)
                    if (e.target.checked) next.add(d.id)
                    else next.delete(d.id)
                    setChosen(next)
                  }}
                />
                {d.name}
              </label>
            ))}
          </div>
        )}
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function MaintenanceTab({ devices, positions }: { devices: Device[]; positions: Record<number, Position> }) {
  const [items, setItems] = useState<Maintenance[]>([])
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending'>('all')
  const [error, setError] = useState('')
  const [now] = useState(() => Date.now())

  const reload = () =>
    getMaintenances()
      .then(setItems)
      .catch(() => setError('No se pudieron cargar los servicios.'))
  useEffect(() => {
    reload()
  }, [])

  const byId = useMemo(() => Object.fromEntries(devices.map((d) => [d.id, d])), [devices])

  const rows = useMemo(
    () =>
      items
        .map((m) => {
          const deviceId = Number(m.attributes.deviceId)
          return { m, device: byId[deviceId], ...statusOf(m, positions[deviceId], now) }
        })
        .filter((r) => r.device)
        .sort((a, b) => a.left - b.left),
    [items, byId, positions, now],
  )
  const overdue = rows.filter((r) => r.status === 'overdue').length
  const soon = rows.filter((r) => r.status === 'soon').length
  const shown = filter === 'pending' ? rows.filter((r) => r.status === 'overdue' || r.status === 'soon') : rows

  const markDone = async (m: Maintenance) => {
    const deviceId = Number(m.attributes.deviceId)
    if (!confirm(`¿Registrar que "${m.name}" de ${byId[deviceId]?.name} se hizo hoy?`)) return
    const current = m.type === 'fixTime' ? Date.now() : (odometer(positions[deviceId]) ?? m.start)
    try {
      await updateMaintenance({ ...m, start: current + m.period, attributes: { ...m.attributes, lastDone: new Date().toISOString(), lastDoneAt: current } })
      reload()
    } catch {
      setError('No se pudo registrar el servicio.')
    }
  }

  const remove = async (m: Maintenance) => {
    if (!confirm(`¿Borrar "${m.name}"?`)) return
    await deleteMaintenance(m.id).catch(() => setError('No se pudo borrar.'))
    reload()
  }

  return (
    <>
      <div className="admin-toolbar">
        <div className="row">
          <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            Todos ({rows.length})
          </button>
          <button className={`chip ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
            <span className="dot urgent" /> {overdue} vencidos · {soon} próximos
          </button>
        </div>
        <button onClick={() => setCreating(true)}>+ Nuevo servicio</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Vehículo</th>
              <th>Servicio</th>
              <th>Cada</th>
              <th>Próximo</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map(({ m, device, status, text, next }) => (
              <tr key={m.id}>
                <td>{device.name}</td>
                <td>{m.name}</td>
                <td>{m.type === 'fixTime' ? `${m.attributes.every ?? Math.round(m.period / MONTH)} meses` : `${km(m.period)} km`}</td>
                <td>{next}</td>
                <td>
                  <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span> <span className="muted small">{text}</span>
                </td>
                <td className="actions">
                  <button className="link" onClick={() => markDone(m)}>
                    Marcar hecho
                  </button>
                  <button className="link danger-text" onClick={() => remove(m)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {rows.length ? 'Nada pendiente. Todo al día.' : 'Agrega servicios como cambio de aceite, afinación o seguro, y la app te avisa cuando toquen.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small">Para recibir un aviso cuando un servicio venza, activa “Mantenimiento” en Alertas → Qué avisar.</p>
      {creating && (
        <MaintenanceForm
          devices={devices}
          positions={positions}
          onDone={() => {
            setCreating(false)
            reload()
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </>
  )
}
