import { useMemo, useState } from 'react'
import { assignedDevice, knotsToKmh, timeAgo, type Device, type Driver, type Position } from '../traccar'
import EngineControl from './EngineControl'

const STATUS_LABEL: Record<Device['status'], string> = {
  online: 'En línea',
  offline: 'Sin conexión',
  unknown: 'Desconocido',
}

interface Props {
  devices: Record<number, Device>
  positions: Record<number, Position>
  selectedId: number | null
  onSelect: (id: number | null) => void
  onHistory: (id: number) => void
  drivers: Driver[]
  canHistory: boolean
  canEngine: boolean
}

export default function LivePanel({ devices, positions, selectedId, onSelect, onHistory, drivers, canHistory, canEngine }: Props) {
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.values(devices)
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.uniqueId.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [devices, query])

  const online = Object.values(devices).filter((d) => d.status === 'online').length
  const total = Object.keys(devices).length
  const selected = selectedId != null ? devices[selectedId] : null
  const selectedPos = selectedId != null ? positions[selectedId] : undefined
  // Chofer: el que reporta el lector de tarjeta del vehículo o, si no hay, el asignado en Admin.
  const cardId = selectedPos?.attributes.driverUniqueId
  const driver = selectedId == null ? undefined : (drivers.find((d) => d.uniqueId === cardId) ?? drivers.find((d) => assignedDevice(d) === selectedId))

  return (
    <div className="panel">
      <div className="stats">
        <div>
          <strong>{total}</strong>
          <span>vehículos</span>
        </div>
        <div>
          <strong className="ok">{online}</strong>
          <span>en línea</span>
        </div>
        <div>
          <strong className="off">{total - online}</strong>
          <span>sin conexión</span>
        </div>
      </div>

      {selected && (
        <div className="detail">
          <div className="detail-head">
            <span className={`dot ${selected.status}`} />
            <strong>{selected.name}</strong>
            <button className="link close" onClick={() => onSelect(null)} aria-label="Cerrar">
              ✕
            </button>
          </div>
          <div className="muted small">
            {STATUS_LABEL[selected.status]} · {selectedPos ? `${knotsToKmh(selectedPos.speed)} km/h · ` : ''}
            {timeAgo(selected.lastUpdate)}
          </div>
          {selectedPos?.address && <div className="small">{selectedPos.address}</div>}
          <div className="small">
            Chofer:{' '}
            {driver ? (
              <>
                <strong>{driver.name}</strong>
                {typeof driver.attributes.phone === 'string' && driver.attributes.phone && (
                  <>
                    {' · '}
                    <a href={`tel:${driver.attributes.phone}`}>{driver.attributes.phone}</a>
                  </>
                )}
              </>
            ) : (
              <span className="muted">sin asignar</span>
            )}
          </div>
          {canHistory && (
            <button className="secondary" onClick={() => onHistory(selected.id)}>
              Ver historial de hoy
            </button>
          )}
          {canEngine && <EngineControl key={selected.id} device={selected} position={selectedPos} />}
        </div>
      )}

      <input className="search" placeholder="Buscar por nombre o IMEI" value={query} onChange={(e) => setQuery(e.target.value)} />

      <ul className="device-list">
        {list.map((d) => {
          const p = positions[d.id]
          return (
            <li key={d.id} className={d.id === selectedId ? 'selected' : ''} onClick={() => onSelect(d.id)}>
              <span className={`dot ${d.status}`} title={STATUS_LABEL[d.status]} />
              <div className="device-info">
                <div className="device-name">{d.name}</div>
                <div className="muted small">
                  {p ? `${knotsToKmh(p.speed)} km/h · ` : 'Sin posición · '}
                  {timeAgo(d.lastUpdate)}
                </div>
              </div>
            </li>
          )
        })}
        {total > 0 && list.length === 0 && <li className="muted empty">Ningún vehículo coincide.</li>}
        {total === 0 && <li className="muted empty">No hay vehículos en esta cuenta.</li>}
      </ul>
    </div>
  )
}
