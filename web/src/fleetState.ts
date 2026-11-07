import { knotsToKmh, type Device, type Position } from './traccar'

/** Estado de un vehículo para la lista y los filtros. */
export type FleetState = 'moving' | 'stopped' | 'inactive' | 'offline'

export const FLEET_STATES: { id: FleetState; label: string }[] = [
  { id: 'moving', label: 'En movimiento' },
  { id: 'stopped', label: 'Detenido' },
  { id: 'inactive', label: 'Inactivo' },
  { id: 'offline', label: 'Sin conexión' },
]

export const STATE_LABEL: Record<FleetState, string> = Object.fromEntries(FLEET_STATES.map((s) => [s.id, s.label])) as Record<FleetState, string>

/** A partir de esta velocidad se considera que el vehículo se mueve (el GPS quieto "brinca" 1-4 km/h). */
export const MOVING_KMH = 5

/** En movimiento: en línea, con el motor encendido (si el equipo lo reporta) y a 5 km/h o más. */
export function isMoving(d: Device, p?: Position) {
  if (d.status !== 'online' || !p) return false
  if (p.attributes.ignition === false) return false
  return knotsToKmh(p.speed) >= MOVING_KMH
}

/**
 * - Sin conexión: Traccar lo marca offline (gris, como en el mapa).
 * - Inactivo: Traccar no sabe su estado (dejó de reportar hace rato pero no cerró la conexión).
 * - En movimiento / Detenido: en línea, según la velocidad y el motor.
 */
export function fleetState(d: Device, p?: Position): FleetState {
  if (d.status === 'offline') return 'offline'
  if (d.status === 'unknown') return 'inactive'
  return isMoving(d, p) ? 'moving' : 'stopped'
}

/** Desde cuándo está en ese estado: Traccar guarda la hora del último cambio entre movimiento y parado. */
export function stateSince(d: Device, state: FleetState): string | null {
  if ((state === 'moving' || state === 'stopped') && d.motionTime) return d.motionTime
  return d.lastUpdate
}

/** Duración corta: "12 min", "3 h 05 min", "2 d 4 h". */
export function shortDuration(ms: number) {
  const mins = Math.max(0, Math.floor(ms / 60000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} h ${String(mins % 60).padStart(2, '0')} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

/** Cuánto lleva en ese estado, desde una hora ISO. */
export const durationSince = (iso: string) => shortDuration(Date.now() - new Date(iso).getTime())
