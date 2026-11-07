import { useMemo, useState } from 'react'
import { durationSince, FLEET_STATES, fleetState, isMoving, STATE_LABEL, stateSince, type FleetState } from '../fleetState'
import { assignedDevice, formatDateTime, knotsToKmh, timeAgo, type Device, type Driver, type Position } from '../traccar'
import { vehicleColor, vehicleKind, vehicleSideHtml } from '../vehicleIcons'
import EngineControl from './EngineControl'
import VehicleHealth from './VehicleHealth'

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
  const [filter, setFilter] = useState<FleetState | 'all'>('all')

  const states = useMemo(() => {
    const out: Record<number, FleetState> = {}
    for (const d of Object.values(devices)) out[d.id] = fleetState(d, positions[d.id])
    return out
  }, [devices, positions])

  const counts = useMemo(() => {
    const c: Record<FleetState, number> = { moving: 0, stopped: 0, inactive: 0, offline: 0 }
    for (const st of Object.values(states)) c[st]++
    return c
  }, [states])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.values(devices)
      .filter((d) => filter === 'all' || states[d.id] === filter)
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.uniqueId.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [devices, query, filter, states])

  const total = Object.keys(devices).length
  const selected = selectedId != null ? devices[selectedId] : null
  const selectedPos = selectedId != null ? positions[selectedId] : undefined
  // Chofer: el que reporta el lector de tarjeta del vehículo o, si no hay, el asignado en Admin.
  const cardId = selectedPos?.attributes.driverUniqueId
  const driver = selectedId == null ? undefined : (drivers.find((d) => d.uniqueId === cardId) ?? drivers.find((d) => assignedDevice(d) === selectedId))

  return (
    <div className="panel">
      <div className="state-filters" role="tablist" aria-label="Filtrar por estado">
        <button type="button" role="tab" aria-selected={filter === 'all'} className={`state-chip st-all ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          <span className="chip-ball">{total}</span>
          <span className="chip-label">Todos</span>
        </button>
        {FLEET_STATES.map((st) => (
          <button
            key={st.id}
            type="button"
            role="tab"
            aria-selected={filter === st.id}
            className={`state-chip st-${st.id} ${filter === st.id ? 'on' : ''}`}
            onClick={() => setFilter(filter === st.id ? 'all' : st.id)}
          >
            <span className="chip-ball">{counts[st.id]}</span>
            <span className="chip-label">{st.label}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="detail">
          <div className="detail-head">
            <StatusDot device={selected} position={selectedPos} />
            <strong>{selected.name}</strong>
            <button className="link close" onClick={() => onSelect(null)} aria-label="Cerrar">
              ✕
            </button>
          </div>
          <div className="muted small">
            {isMoving(selected, selectedPos) ? 'En movimiento' : STATUS_LABEL[selected.status]} · {selectedPos ? `${knotsToKmh(selectedPos.speed)} km/h · ` : ''}
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
          <VehicleHealth position={selectedPos} />
          {canHistory && (
            <button className="secondary" onClick={() => onHistory(selected.id)}>
              Ver historial de hoy
            </button>
          )}
          {canEngine && <EngineControl key={selected.id} device={selected} position={selectedPos} />}
        </div>
      )}

      <input className="search" placeholder="Buscar por nombre o IMEI" value={query} onChange={(e) => setQuery(e.target.value)} />

      <ul className="device-list vcards">
        {list.map((d) => (
          <VehicleCard key={d.id} device={d} position={positions[d.id]} state={states[d.id]} selected={d.id === selectedId} onSelect={() => onSelect(d.id)} />
        ))}
        {total > 0 && list.length === 0 && <li className="muted empty">{filter === 'all' ? 'Ningún vehículo coincide.' : `No hay vehículos "${STATE_LABEL[filter]}".`}</li>}
        {total === 0 && <li className="muted empty">No hay vehículos en esta cuenta.</li>}
      </ul>
    </div>
  )
}


/** Puntito de estado; si va en movimiento, una flechita verde que apunta hacia donde va y late. */
function StatusDot({ device, position }: { device: Device; position?: Position }) {
  if (!isMoving(device, position)) return <span className={`dot ${device.status}`} title={STATUS_LABEL[device.status]} />
  return (
    <span className="dot moving" title="En movimiento">
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" style={{ transform: `rotate(${position!.course}deg)` }}>
        <path d="M6 0.8 L10.6 11 L6 8.4 L1.4 11 Z" fill="currentColor" />
      </svg>
    </span>
  )
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Color de la carrocería en la tarjeta: el que eligieron, o el del estado. Apagado o sin señal, siempre gris. */
const STATE_BODY: Record<FleetState, string> = { moving: '#22c55e', stopped: '#ef4444', inactive: '#f59e0b', offline: '#9ca3af' }

/** Tarjeta de un vehículo: dibujo de lado a su color, estado, datos principales y dirección. */
function VehicleCard({ device: d, position: p, state, selected, onSelect }: { device: Device; position?: Position; state: FleetState; selected: boolean; onSelect: () => void }) {
  const a = p?.attributes ?? {}
  const own = vehicleColor(d.attributes)
  const body = state === 'offline' ? STATE_BODY.offline : (own ?? STATE_BODY[state])
  const since = stateSince(d, state)
  const odometer = num(a.totalDistance) ?? num(a.odometer)
  const hours = num(a.hours)
  const power = num(a.power)
  const rssi = num(a.rssi)
  const sat = num(a.sat)
  const bars = rssi == null ? null : Math.max(0, Math.min(5, Math.round(rssi)))
  const powerOk = power == null ? null : power / (power > 18 ? 24 : 12) >= 1
  return (
    <li className={`vcard st-${state} ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="vcard-top">
        <span className="vcard-img" style={{ color: body }} dangerouslySetInnerHTML={{ __html: vehicleSideHtml(vehicleKind(d.category)) }} />
        <div className="vcard-title">
          <div className="device-name" title={d.name}>
            {d.name}
          </div>
          <div className="vcard-state">
            <span className={`state-pill st-${state}`}>{STATE_LABEL[state]}</span>
            {since && <span className="muted small">{durationSince(since)}</span>}
          </div>
        </div>
        <div className="vcard-icons">
          {power != null && (
            <span className={powerOk ? 'ok' : 'warn'} title={`Batería del vehículo: ${power.toFixed(1)} V`}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M4 7h14a2 2 0 0 1 2 2v1h1a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v6h14V9H4zm1 1h7v4H5v-4z" />
              </svg>
            </span>
          )}
          {bars != null && (
            <span className={`signal ${bars <= 1 ? 'warn' : ''}`} title={`Señal celular: ${bars} de 5`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <i key={i} className={i <= bars ? 'on' : ''} style={{ height: `${3 + i * 2}px` }} />
              ))}
            </span>
          )}
          {sat != null && (
            <span className={sat >= 4 ? 'ok' : 'warn'} title={`GPS: ${sat} satélites`}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M11 2h2v3.07A7 7 0 0 1 18.93 11H22v2h-3.07A7 7 0 0 1 13 18.93V22h-2v-3.07A7 7 0 0 1 5.07 13H2v-2h3.07A7 7 0 0 1 11 5.07V2zm1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
              </svg>
            </span>
          )}
        </div>
      </div>
      <div className="vcard-stats">
        <div>
          <span>Velocidad</span>
          <strong>{p ? `${knotsToKmh(p.speed)} km/h` : '—'}</strong>
        </div>
        <div>
          <span>Odómetro</span>
          <strong>{odometer != null ? `${Math.round(odometer / 1000).toLocaleString('es-MX')} km` : '—'}</strong>
        </div>
        <div>
          <span>Horas motor</span>
          <strong>{hours != null && hours > 0 ? `${Math.round(hours / 3600000).toLocaleString('es-MX')} h` : '—'}</strong>
        </div>
        <div>
          <span>Último reporte</span>
          <strong title={d.lastUpdate ? formatDateTime(d.lastUpdate) : undefined}>{timeAgo(d.lastUpdate)}</strong>
        </div>
      </div>
      {p && (
        <div className="vcard-address">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
          </svg>
          <span>{p.address || `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`}</span>
        </div>
      )}
    </li>
  )
}
