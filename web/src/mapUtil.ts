import * as maplibregl from 'maplibre-gl'

// Mapas cuyo estilo está listo para recibir capas. Lo marca FleetMap al cargar
// o cambiar el mapa base; isStyleLoaded() también espera las teselas y no sirve.
const ready = new WeakSet<maplibregl.Map>()

export function setStyleReady(map: maplibregl.Map, isReady: boolean) {
  if (isReady) ready.add(map)
  else ready.delete(map)
}

/** Ejecuta fn cuando el estilo del mapa ya cargó (antes no se pueden agregar capas). */
export function whenReady(map: maplibregl.Map, fn: () => void) {
  if (ready.has(map)) fn()
  else map.once('style.load', fn)
}

/** Quita capas y fuentes si existen. */
export function removeLayers(map: maplibregl.Map, layers: string[], sources: string[]) {
  // Si el mapa ya se destruyó, no hay nada que limpiar.
  if (!map.getStyle()) return
  for (const id of layers) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of sources) if (map.getSource(id)) map.removeSource(id)
}

/** Marcador redondo con una letra (A = inicio, B = fin, P = parada). */
export function pinElement(letter: string, kind: 'start' | 'end' | 'stop') {
  const el = document.createElement('div')
  el.className = `pin pin-${kind}`
  el.textContent = letter
  return el
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

// --- Geocercas: Traccar usa WKT con el orden "latitud longitud" ---

export type Shape = { kind: 'circle'; center: [number, number]; radius: number } | { kind: 'polygon'; points: [number, number][] }

/** Convierte una figura (coordenadas [lng, lat]) al texto que guarda Traccar. */
export function shapeToWkt(shape: Shape) {
  const ll = ([lng, lat]: [number, number]) => `${lat.toFixed(6)} ${lng.toFixed(6)}`
  if (shape.kind === 'circle') return `CIRCLE (${ll(shape.center)}, ${Math.round(shape.radius)})`
  const ring = [...shape.points, shape.points[0]]
  return `POLYGON ((${ring.map(ll).join(', ')}))`
}

/** Lee el texto WKT de Traccar. Devuelve null si no es un círculo o polígono. */
export function wktToShape(wkt: string): Shape | null {
  const nums = (text: string) =>
    text
      .split(',')
      .map((pair) => pair.trim().split(/\s+/).map(Number))
      .map(([lat, lon]) => [lon, lat] as [number, number])
  const circle = wkt.match(/^\s*CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([\d.]+)\s*\)/i)
  if (circle) return { kind: 'circle', center: [Number(circle[2]), Number(circle[1])], radius: Number(circle[3]) }
  const polygon = wkt.match(/^\s*POLYGON\s*\(\(\s*(.+?)\s*\)\)/i)
  if (polygon) return { kind: 'polygon', points: nums(polygon[1]) }
  return null
}

/** Polígono aproximado de un círculo, para dibujarlo en el mapa. */
export function circlePolygon(center: [number, number], radius: number, steps = 64): [number, number][] {
  const [lng, lat] = center
  const dLat = radius / 111320
  const dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180))
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return ring
}

/** Anillo cerrado de cualquier figura, en [lng, lat]. */
export function shapeRing(shape: Shape): [number, number][] {
  return shape.kind === 'circle' ? circlePolygon(shape.center, shape.radius) : [...shape.points, shape.points[0]]
}

/** Distancia en metros entre dos puntos [lng, lat]. */
export function distance([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
