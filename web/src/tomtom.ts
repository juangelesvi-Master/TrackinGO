// Servicios de TomTom: buscador de lugares y rutas con tráfico real.
// La llave es la misma de la capa de tráfico (TOMTOM_KEY en servidor/.env).

const KEY = import.meta.env.VITE_TOMTOM_KEY as string | undefined
export const hasTomTom = !!KEY
const API = 'https://api.tomtom.com'

export interface Place {
  id: string
  name: string
  address: string
  lat: number
  lon: number
}

interface SearchResult {
  id: string
  type: string
  poi?: { name: string }
  address: { freeformAddress: string }
  position: { lat: number; lon: number }
}

/** Busca lugares o direcciones, dando preferencia a los cercanos al centro del mapa. */
export async function searchPlaces(query: string, near: { lat: number; lon: number }, signal?: AbortSignal): Promise<Place[]> {
  const q = new URLSearchParams({ key: KEY!, language: 'es-419', countrySet: 'MX', limit: '6', lat: String(near.lat), lon: String(near.lon), typeahead: 'true' })
  const res = await fetch(`${API}/search/2/search/${encodeURIComponent(query)}.json?${q}`, { signal })
  if (!res.ok) throw new Error(`TomTom ${res.status}`)
  const data = (await res.json()) as { results: SearchResult[] }
  return data.results.map((r) => ({
    id: r.id,
    name: r.poi?.name ?? r.address.freeformAddress,
    address: r.poi ? r.address.freeformAddress : '',
    lat: r.position.lat,
    lon: r.position.lon,
  }))
}

export interface Eta {
  seconds: number // tiempo de viaje con el tráfico de ahorita
  delaySeconds: number // cuánto de ese tiempo es por tráfico
  meters: number
  arrival: string // hora estimada de llegada (ISO)
  line: [number, number][] // trazo de la ruta [lng, lat]
}

/** Ruta en coche de un punto a otro con el tráfico actual. */
export async function routeEta(from: { lat: number; lon: number }, to: { lat: number; lon: number }, signal?: AbortSignal): Promise<Eta> {
  const q = new URLSearchParams({ key: KEY!, traffic: 'true', travelMode: 'car', routeType: 'fastest' })
  const res = await fetch(`${API}/routing/1/calculateRoute/${from.lat},${from.lon}:${to.lat},${to.lon}/json?${q}`, { signal })
  if (!res.ok) throw new Error(`TomTom ${res.status}`)
  const data = (await res.json()) as {
    routes: {
      summary: { travelTimeInSeconds: number; trafficDelayInSeconds: number; lengthInMeters: number; arrivalTime: string }
      legs: { points: { latitude: number; longitude: number }[] }[]
    }[]
  }
  const r = data.routes[0]
  return {
    seconds: r.summary.travelTimeInSeconds,
    delaySeconds: r.summary.trafficDelayInSeconds,
    meters: r.summary.lengthInMeters,
    arrival: r.summary.arrivalTime,
    line: r.legs.flatMap((l) => l.points.map((p) => [p.longitude, p.latitude] as [number, number])),
  }
}

/** Teselas con los iconos de accidentes, obras y cierres. */
export const incidentTiles = () => [`${API}/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key=${KEY}&tileSize=256`]
