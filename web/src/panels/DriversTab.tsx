import { useState, type FormEvent } from 'react'
import { addLinks, assignedDevice, createDriver, deleteDriver, removeLinks, updateDriver, type Device, type Driver } from '../traccar'
import { Modal } from './Modal'


function DriverForm({ driver, drivers, devices, onDone, onCancel }: { driver: Driver | null; drivers: Driver[]; devices: Device[]; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(driver?.name ?? '')
  const [uniqueId, setUniqueId] = useState(driver?.uniqueId ?? '')
  const [phone, setPhone] = useState(typeof driver?.attributes.phone === 'string' ? driver.attributes.phone : '')
  const [license, setLicense] = useState(typeof driver?.attributes.licenseExpiry === 'string' ? driver.attributes.licenseExpiry : '')
  const [deviceId, setDeviceId] = useState<number | null>(driver ? assignedDevice(driver) : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const previous = driver ? assignedDevice(driver) : null
      const attributes = { ...(driver?.attributes ?? {}), phone: phone.trim(), licenseExpiry: license, deviceId }
      const data = { name: name.trim(), uniqueId: uniqueId.trim(), attributes }
      const saved = driver ? await updateDriver({ ...driver, ...data }) : await createDriver(data)

      if (previous !== deviceId) {
        if (previous != null) await removeLinks([{ deviceId: previous, driverId: saved.id }])
        if (deviceId != null) {
          // Un vehículo tiene un solo chofer asignado: se lo quitamos a quien lo tuviera.
          for (const other of drivers.filter((o) => o.id !== saved.id && assignedDevice(o) === deviceId)) {
            await updateDriver({ ...other, attributes: { ...other.attributes, deviceId: null } })
            await removeLinks([{ deviceId, driverId: other.id }])
          }
          await addLinks([{ deviceId, driverId: saved.id }])
        }
      }
      onDone()
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : ''
      setError(msg.includes('duplicate') || msg.includes('unique') ? 'Ya hay un chofer con ese número de identificación.' : 'No se pudo guardar el chofer.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={driver ? 'Editar chofer' : 'Nuevo chofer'} onClose={onCancel}>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Nombre completo
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label>
          Número de licencia o de tarjeta
          <input value={uniqueId} onChange={(e) => setUniqueId(e.target.value)} required placeholder="Si el vehículo tiene lector de tarjeta, el número de la tarjeta" />
        </label>
        <label>
          Teléfono
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          Vencimiento de la licencia (opcional)
          <input type="date" value={license} onChange={(e) => setLicense(e.target.value)} />
        </label>
        <label>
          Vehículo asignado
          <select value={deviceId ?? ''} onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sin asignar</option>
            {devices.map((d) => {
              const holder = drivers.find((o) => o.id !== driver?.id && assignedDevice(o) === d.id)
              return (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {holder ? ` (ahora: ${holder.name})` : ''}
                </option>
              )
            })}
          </select>
        </label>
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

export default function DriversTab({ drivers, devices, onChanged }: { drivers: Driver[]; devices: Device[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Driver | null | 'new'>(null)
  const [error, setError] = useState('')
  const byId = Object.fromEntries(devices.map((d) => [d.id, d]))
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  const remove = async (d: Driver) => {
    if (!confirm(`¿Borrar al chofer "${d.name}"?`)) return
    await deleteDriver(d.id).catch(() => setError('No se pudo borrar.'))
    onChanged()
  }

  return (
    <>
      <div className="admin-toolbar">
        <span className="muted">{drivers.length} choferes</span>
        <button onClick={() => setEditing('new')}>+ Nuevo chofer</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Chofer</th>
              <th>Licencia / tarjeta</th>
              <th>Teléfono</th>
              <th>Vehículo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => {
              const device = byId[assignedDevice(d) ?? -1]
              const expiry = typeof d.attributes.licenseExpiry === 'string' ? d.attributes.licenseExpiry : ''
              return (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>
                    <span className="mono">{d.uniqueId}</span>
                    {expiry && expiry < today && <span className="status status-overdue">Licencia vencida</span>}
                  </td>
                  <td>{typeof d.attributes.phone === 'string' && d.attributes.phone ? <a href={`tel:${d.attributes.phone}`}>{d.attributes.phone}</a> : '—'}</td>
                  <td>{device ? device.name : <span className="muted">Sin asignar</span>}</td>
                  <td className="actions">
                    <button className="link" onClick={() => setEditing(d)}>
                      Editar
                    </button>
                    <button className="link danger-text" onClick={() => remove(d)}>
                      Borrar
                    </button>
                  </td>
                </tr>
              )
            })}
            {drivers.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Todavía no hay choferes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <DriverForm
          driver={editing === 'new' ? null : editing}
          drivers={drivers}
          devices={devices}
          onDone={() => {
            setEditing(null)
            onChanged()
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  )
}
