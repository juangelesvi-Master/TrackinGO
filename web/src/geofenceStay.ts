import { useEffect, useState } from 'react'
import { distance, wktToShape, type Shape } from './mapUtil'
import { formatDuration, getEvents, getRoute, type Geofence, type Position, type TraccarEvent } from './traccar'

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

// --- Visitas a geocercas dentro de un recorrido (se calcula con la figura de cada geocerca) ---

export interface Visit {
  geofence: Geofence
  enter: Position // primer punto dentro
  exit: Position | null // primer punto fuera (null si el día terminó dentro)
  inside: number // ms
  stopped: number // ms
}

const MIN_VISIT = 60e3 // ignora pasadas de menos de 1 minuto

function inShape(shape: Shape, lng: number, lat: number) {
  if (shape.kind === 'circle') return distance(shape.center, [lng, lat]) <= shape.radius
  // Punto en polígono (rayo hacia la derecha).
  const pts = shape.points
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const ms = (p: Position) => new Date(p.fixTime).getTime()

/** Entradas a geocercas a lo largo del recorrido, con el tiempo dentro y el tiempo detenido. */
export function routeVisits(points: Position[], geofences: Geofence[]): Visit[] {
  const visits: Visit[] = []
  for (const geofence of geofences) {
    const shape = wktToShape(geofence.area)
    if (!shape) continue
    let start = -1
    const close = (endIdx: number, exit: Position | null) => {
      const enter = points[start]
      const last = exit ?? points[endIdx]
      let stopped = 0
      for (let i = start + 1; i <= endIdx; i++) {
        if (points[i - 1].speed < STOPPED_KNOTS && points[i].speed < STOPPED_KNOTS) stopped += ms(points[i]) - ms(points[i - 1])
      }
      const inside = ms(last) - ms(enter)
      if (inside >= MIN_VISIT) visits.push({ geofence, enter, exit, inside, stopped: Math.min(stopped, inside) })
      start = -1
    }
    points.forEach((p, i) => {
      const inside = inShape(shape, p.longitude, p.latitude)
      if (inside && start < 0) start = i
      else if (!inside && start >= 0) close(i - 1, p)
    })
    if (start >= 0) close(points.length - 1, null)
  }
  return visits.sort((a, b) => ms(a.enter) - ms(b.enter))
}
