import type { Position } from '../traccar'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Estado de la batería del vehículo según su voltaje (12 V autos, 24 V camiones). */
function powerState(v: number): 'ok' | 'warn' | 'bad' {
  const base = v > 18 ? 24 : 12
  const ratio = v / base
  if (ratio < 0.5) return 'bad' // GPS desconectado o batería muerta
  if (ratio < 1.0) return 'warn' // batería baja
  return 'ok'
}

/** Ficha de salud: batería, señal, satélites, motor y horas de motor que manda el rastreador. */
export default function VehicleHealth({ position }: { position?: Position }) {
  if (!position) return null
  const a = position.attributes
  const power = num(a.power)
  const battery = num(a.battery)
  const rssi = num(a.rssi)
  const sat = num(a.sat)
  const hours = num(a.hours)
  const ignition = typeof a.ignition === 'boolean' ? a.ignition : null
  if (power == null && battery == null && rssi == null && sat == null && ignition == null) return null

  const bars = rssi == null ? 0 : Math.max(0, Math.min(5, Math.round(rssi)))
  return (
    <div className="health">
      {power != null && (
        <div className={`health-item ${powerState(power)}`} title="Voltaje de la batería del vehículo">
          <span>Batería vehículo</span>
          <strong>{power.toFixed(1)} V</strong>
        </div>
      )}
      {battery != null && (
        <div className={`health-item ${battery < 3.6 ? 'warn' : 'ok'}`} title="Batería de respaldo dentro del GPS">
          <span>Batería GPS</span>
          <strong>{battery.toFixed(2)} V</strong>
        </div>
      )}
      {rssi != null && (
        <div className={`health-item ${bars <= 1 ? 'warn' : 'ok'}`} title="Señal celular (0 a 5)">
          <span>Señal</span>
          <strong className="signal" aria-label={`${bars} de 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <i key={i} className={i <= bars ? 'on' : ''} style={{ height: `${4 + i * 2}px` }} />
            ))}
          </strong>
        </div>
      )}
      {sat != null && (
        <div className={`health-item ${sat < 4 ? 'warn' : 'ok'}`} title="Satélites GPS a la vista">
          <span>Satélites</span>
          <strong>{sat}</strong>
        </div>
      )}
      {ignition != null && (
        <div className="health-item" title="Motor encendido o apagado">
          <span>Motor</span>
          <strong>{ignition ? 'Encendido' : 'Apagado'}</strong>
        </div>
      )}
      {hours != null && hours > 0 && (
        <div className="health-item" title="Horas de motor acumuladas">
          <span>Horas de motor</span>
          <strong>{Math.round(hours / 3600000).toLocaleString('es-MX')} h</strong>
        </div>
      )}
    </div>
  )
}
