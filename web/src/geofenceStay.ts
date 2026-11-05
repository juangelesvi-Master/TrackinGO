import { useEffect, useState } from 'react'
import { formatDuration, getEvents, getRoute, type TraccarEvent } from './traccar'

// Cuánto tiempo estuvo un vehículo dentro de una geocerca y cuánto de ese tiempo estuvo detenido.
// Se calcula al salir: busca la última entrada a esa misma geocerca y suma el tiempo entre puntos
// en los que iba casi parado (menos de ~4 km/h).

export interface Stay {
  inside: number // ms
  stopped: number // ms
}

const STOPPED_KNOTS = 2 // ≈ 3.7 km/h
const LOOK_BACK = 7 * 24 * 3600e3 // hasta 7 días antes de la salida

const cache = new Map<number, Promise<Stay | null>>()

async function compute(exit: TraccarEvent): Promise<Stay | null> {
  const to = new Date(exit.eventTime)
  const enters = await getEvents([exit.deviceId], new Date(to.getTime() - LOOK_BACK), to, ['geofenceEnter'])
  const enter = enters
    .filter((e) => e.geofenceId === exit.geofenceId && e.eventTime <= exit.eventTime)
    .sort((a, b) => b.eventTime.localeCompare(a.eventTime))[0]
  if (!enter) return null
  const from = new Date(enter.eventTime)
  const route = await getRoute(exit.deviceId, from, to)
  let stopped = 0
  for (let i = 1; i < route.length; i++) {
    const prev = route[i - 1]
    if (prev.speed < STOPPED_KNOTS && route[i].speed < STOPPED_KNOTS) {
      stopped += new Date(route[i].fixTime).getTime() - new Date(prev.fixTime).getTime()
    }
  }
  const inside = to.getTime() - from.getTime()
  return { inside, stopped: Math.min(Math.max(stopped, 0), inside) }
}

/** Tiempo dentro de la geocerca para un aviso de salida (se guarda para no volver a pedirlo). */
export function geofenceStay(exit: TraccarEvent): Promise<Stay | null> {
  let p = cache.get(exit.id)
  if (!p) {
    p = compute(exit).catch(() => null)
    cache.set(exit.id, p)
  }
  return p
}

export const stayText = (s: Stay) => `Estuvo ${formatDuration(s.inside)} dentro · detenido ${formatDuration(s.stopped)}`

/** Calcula el tiempo dentro para los avisos de salida de geocerca de la lista (los más recientes). */
export function useGeofenceStays(events: TraccarEvent[], limit = 30): Record<number, Stay> {
  const [stays, setStays] = useState<Record<number, Stay>>({})
  const ids = events
    .filter((e) => e.type === 'geofenceExit' && e.geofenceId)
    .slice(0, limit)
    .map((e) => e.id)
    .join(',')
  useEffect(() => {
    let alive = true
    const exits = events.filter((e) => e.type === 'geofenceExit' && e.geofenceId).slice(0, limit)
    exits.forEach((e) =>
      geofenceStay(e).then((s) => {
        if (alive && s) setStays((prev) => (prev[e.id] ? prev : { ...prev, [e.id]: s }))
      }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])
  return stays
}
