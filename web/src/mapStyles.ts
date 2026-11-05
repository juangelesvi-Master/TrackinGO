import type { StyleSpecification } from 'maplibre-gl'

// Mapas base gratuitos. Ninguno pide cuenta ni llave.
// - OpenFreeMap: datos de OpenStreetMap, sin límite de visitas.
// - Satélite: imágenes y etiquetas de Esri (ArcGIS), con su crédito en el mapa.

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'

const satellite: StyleSpecification = {
  version: 8,
  sources: {
    'sat-imagery': {
      type: 'raster',
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
    },
    'sat-roads': {
      type: 'raster',
      tiles: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
    'sat-places': {
      type: 'raster',
      tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'sat-imagery', type: 'raster', source: 'sat-imagery' },
    { id: 'sat-roads', type: 'raster', source: 'sat-roads', paint: { 'raster-opacity': 0.8 } },
    { id: 'sat-places', type: 'raster', source: 'sat-places' },
  ],
}

export interface MapStyleOption {
  id: string
  name: string
  hint: string
  style: string | StyleSpecification
  /** Mapas que piden algo al servidor antes de poder mostrarse (Google). */
  load?: () => Promise<StyleSpecification>
}

// --- Mapas de Google (Map Tiles API) ---
// Solo aparecen si el servidor tiene llave: GOOGLE_MAPS_KEY en servidor/.env (VITE_GOOGLE_MAPS_KEY al compilar).
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
const GOOGLE_TILES = 'https://tile.googleapis.com/v1'

interface GoogleSession {
  session: string
  expiry: string // segundos desde 1970
}

/** Google pide abrir una "sesión" para dar teselas; dura unas dos semanas y se guarda para reusarla. */
async function googleSession(id: string, body: Record<string, unknown>): Promise<string> {
  const cacheKey = `teesaGoogle_${id}`
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as GoogleSession | null
    if (saved && Number(saved.expiry) * 1000 - Date.now() > 24 * 3600e3) return saved.session
  } catch {
    // Sin almacenamiento: se pide una sesión nueva.
  }
  const res = await fetch(`${GOOGLE_TILES}/createSession?key=${GOOGLE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'es-MX', region: 'MX', highDpi: true, ...body }),
  })
  if (!res.ok) throw new Error(`Google ${res.status}`)
  const data = (await res.json()) as GoogleSession
  try {
    localStorage.setItem(cacheKey, JSON.stringify(data))
  } catch {
    // No pasa nada si no se puede guardar.
  }
  return data.session
}

function googleStyle(id: string, body: Record<string, unknown>) {
  return async (): Promise<StyleSpecification> => {
    const session = await googleSession(id, body)
    return {
      version: 8,
      sources: {
        google: {
          type: 'raster',
          tiles: [`${GOOGLE_TILES}/2dtiles/{z}/{x}/{y}?session=${session}&key=${GOOGLE_KEY}`],
          tileSize: 256,
          maxzoom: 22,
          attribution: `Datos del mapa ©${new Date().getFullYear()} Google`,
        },
      },
      layers: [{ id: 'google', type: 'raster', source: 'google' }],
    }
  }
}

const EMPTY: StyleSpecification = { version: 8, sources: {}, layers: [] }

const GOOGLE_STYLES: MapStyleOption[] = GOOGLE_KEY
  ? [
      { id: 'google', name: 'Google', hint: 'Calles de Google Maps', style: EMPTY, load: googleStyle('roadmap', { mapType: 'roadmap' }) },
      {
        id: 'google-sat',
        name: 'Google satélite',
        hint: 'Foto aérea de Google con calles',
        style: EMPTY,
        load: googleStyle('satellite', { mapType: 'satellite', layerTypes: ['layerRoadmap'] }),
      },
    ]
  : []

export const MAP_STYLES: MapStyleOption[] = [
  {
    id: 'streets',
    name: 'Calles',
    hint: 'Mapa normal con calles y edificios',
    // Se puede cambiar en .env con VITE_MAP_STYLE.
    style: import.meta.env.VITE_MAP_STYLE || 'https://tiles.openfreemap.org/styles/liberty',
  },
  { id: 'bright', name: 'Colores', hint: 'Más contraste, al estilo clásico', style: 'https://tiles.openfreemap.org/styles/bright' },
  { id: 'light', name: 'Claro', hint: 'Sencillo, los vehículos resaltan más', style: 'https://tiles.openfreemap.org/styles/positron' },
  { id: 'dark', name: 'Oscuro', hint: 'Para monitoreo de noche', style: 'https://tiles.openfreemap.org/styles/dark' },
  { id: 'satellite', name: 'Satélite', hint: 'Foto aérea con nombres de calles', style: satellite },
  ...GOOGLE_STYLES,
]

// --- Tráfico en vivo (TomTom) ---
// Solo aparece si el servidor tiene llave: TOMTOM_KEY en servidor/.env (VITE_TOMTOM_KEY al compilar).
const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_KEY as string | undefined
export const hasTraffic = !!TOMTOM_KEY
/** Teselas de flujo vehicular: verde fluido, naranja lento, rojo atorado. */
export const trafficTiles = () => [`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_KEY}&tileSize=256`]

const TRAFFIC_PREF = 'teesaTraffic'
export function savedTraffic() {
  try {
    return localStorage.getItem(TRAFFIC_PREF) === '1'
  } catch {
    return false
  }
}
export function saveTraffic(on: boolean) {
  try {
    localStorage.setItem(TRAFFIC_PREF, on ? '1' : '0')
  } catch {
    // No pasa nada si no se puede guardar.
  }
}

const KEY = 'teesaMapStyle'

export function savedStyle(): MapStyleOption {
  let id: string | null = null
  try {
    id = localStorage.getItem(KEY)
  } catch {
    // Sin almacenamiento: se usa el mapa normal.
  }
  return MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0]
}

export function saveStyle(id: string) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // No pasa nada si no se puede guardar.
  }
}
