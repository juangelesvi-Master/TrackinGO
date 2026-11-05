import { useState, type FormEvent } from 'react'
import { permsOf } from '../permissions'
import {
  createDevice,
  deleteDevice,
  kmhToKnots,
  knotsToKmh,
  setOdometer,
  timeAgo,
  updateDevice,
  type Device,
  type Driver,
  type Position,
  type User,
} from '../traccar'
import DriversTab from './DriversTab'
import MaintenanceTab from './MaintenanceTab'
import { Modal } from './Modal'
import UsersTab from './UsersTab'
import PageTitle from './PageTitle'

const errorText = (err: unknown, fallback: string) => {
  const msg = err instanceof Error ? err.message.toLowerCase() : ''
  if (msg.includes('duplicate') || msg.includes('unique')) return 'Ya existe un registro con ese identificador o correo.'
  if (msg.includes('readonly') || msg.includes('security') || msg.includes('permission')) return 'Tu usuario no tiene permiso para hacer esto.'
  return fallback
}

// ---------------- Vehículos ----------------

function DeviceForm({ device, odometerKm, onDone, onCancel }: { device: Device | null; odometerKm: number | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(device?.name ?? '')
  const [uniqueId, setUniqueId] = useState(device?.uniqueId ?? '')
  const [phone, setPhone] = useState(device?.phone ?? '')
  const [model, setModel] = useState(device?.model ?? '')
  const limit = device?.attributes?.speedLimit
  const [speedLimit, setSpeedLimit] = useState(typeof limit === 'number' ? String(knotsToKmh(limit)) : '')
  const [odometer, setOdometerKm] = useState(odometerKm != null ? String(odometerKm) : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const attributes = { ...(device?.attributes ?? {}) }
    if (speedLimit.trim()) attributes.speedLimit = kmhToKnots(Number(speedLimit))
    else delete attributes.speedLimit
    const data = { name: name.trim(), uniqueId: uniqueId.trim(), phone: phone.trim() || null, model: model.trim() || null, attributes }
    try {
      if (device) await updateDevice({ ...device, ...data })
      else await createDevice(data)
      if (device && odometerKm != null && odometer.trim() && Number(odometer) !== odometerKm) await setOdometer(device.id, Number(odometer) * 1000)
      onDone()
    } catch (err) {
      setError(errorText(err, 'No se pudo guardar el vehículo.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={device ? 'Editar vehículo' : 'Agregar vehículo'} onClose={onCancel}>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Nombre o placa
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Ej. Camión 12 · ABC-123" />
        </label>
        <label>
          Identificador del rastreador (IMEI)
          <input value={uniqueId} onChange={(e) => setUniqueId(e.target.value)} required placeholder="Viene en la etiqueta del equipo" />
        </label>
        <label>
          Teléfono del chip (opcional)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          Modelo del rastreador (opcional)
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label>
          Límite de velocidad en km/h (opcional)
          <input type="number" min={1} value={speedLimit} onChange={(e) => setSpeedLimit(e.target.value)} placeholder="Ej. 90" />
        </label>
        {odometerKm != null && (
          <label>
            Odómetro actual en km (ajústalo al del tablero para que los servicios cuadren)
            <input type="number" min={0} value={odometer} onChange={(e) => setOdometerKm(e.target.value)} />
          </label>
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

const odometerKm = (p?: Position) => (typeof p?.attributes.totalDistance === 'number' ? Math.round(p.attributes.totalDistance / 1000) : null)

function DevicesTab({ devices, positions, canEdit, onChanged }: { devices: Device[]; positions: Record<number, Position>; canEdit: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<Device | null | 'new'>(null)
  const [error, setError] = useState('')

  const remove = async (d: Device) => {
    if (!confirm(`¿Borrar el vehículo "${d.name}"? Se perderá su historial.`)) return
    await deleteDevice(d.id).catch((err) => setError(errorText(err, 'No se pudo borrar.')))
    onChanged()
  }

  return (
    <>
      <div className="admin-toolbar">
        <span className="muted">{devices.length} vehículos</span>
        {canEdit && <button onClick={() => setEditing('new')}>+ Agregar vehículo</button>}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Vehículo</th>
              <th>IMEI</th>
              <th>Límite</th>
              <th>Odómetro</th>
              <th>Último reporte</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const limit = d.attributes?.speedLimit
              return (
                <tr key={d.id}>
                  <td>
                    <span className={`dot ${d.status}`} /> {d.name}
                  </td>
                  <td className="mono">{d.uniqueId}</td>
                  <td>{typeof limit === 'number' ? `${knotsToKmh(limit)} km/h` : '—'}</td>
                  <td>{odometerKm(positions[d.id])?.toLocaleString('es-MX') ?? '—'} {odometerKm(positions[d.id]) != null && 'km'}</td>
                  <td>{timeAgo(d.lastUpdate)}</td>
                  <td className="actions">
                    {canEdit && (
                      <>
                        <button className="link" onClick={() => setEditing(d)}>
                          Editar
                        </button>
                        <button className="link danger-text" onClick={() => remove(d)}>
                          Borrar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
            {devices.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Todavía no hay vehículos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && <DeviceForm device={editing === 'new' ? null : editing} odometerKm={editing === 'new' ? null : odometerKm(positions[editing.id])} onDone={() => {
            setEditing(null)
            onChanged()
          }}
          onCancel={() => setEditing(null)} />}
    </>
  )
}

type AdminTab = 'devices' | 'drivers' | 'maintenance' | 'users'

interface AdminProps {
  me: User
  devices: Device[]
  positions: Record<number, Position>
  drivers: Driver[]
  onChanged: () => void
}

export default function AdminPage({ me, devices, positions, drivers, onChanged, onBack }: AdminProps & { onBack: () => void }) {
  const perms = permsOf(me)
  const tabs: { id: AdminTab; label: string }[] = [
    ...(perms.vehicles
      ? [
          { id: 'devices' as AdminTab, label: 'Vehículos' },
          { id: 'drivers' as AdminTab, label: 'Choferes' },
          { id: 'maintenance' as AdminTab, label: 'Mantenimiento' },
        ]
      : []),
    ...(perms.users ? [{ id: 'users' as AdminTab, label: 'Usuarios' }] : []),
  ]
  const [tab, setTab] = useState<AdminTab>(tabs[0]?.id ?? 'devices')

  return (
    <div className="admin">
      <PageTitle title="Administración" onBack={onBack} />
      <div className="segmented inline wide">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'devices' && <DevicesTab devices={devices} positions={positions} canEdit={perms.vehicles} onChanged={onChanged} />}
      {tab === 'drivers' && <DriversTab drivers={drivers} devices={devices} onChanged={onChanged} />}
      {tab === 'maintenance' && <MaintenanceTab devices={devices} positions={positions} />}
      {tab === 'users' && perms.users && <UsersTab me={me} devices={devices} />}
    </div>
  )
}
