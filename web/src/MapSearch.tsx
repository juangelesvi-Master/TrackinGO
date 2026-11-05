import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { pinElement, removeLayers, whenReady } from './mapUtil'
import { routeEta, searchPlaces, type Eta, type Place } from './tomtom'
import { formatDuration, formatTime, type Device, type Position } from './traccar'

interface Props {
  getMap: () => maplibregl.Map | null
  devices: Record<number, Device>
  positions: Record<number, Position>
  selectedId: number | null
}

/** Cuántos vehículos se comparan para la hora de llegada. */
const MAX_ETAS = 3

type Row = { deviceId: number; eta?: Eta; error?: boolean }

const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`)
// Distancia aproximada en línea recta, solo para escoger los vehículos más cercanos.
const far = (a: Position, p: Place) => (a.latitude - p.lat) ** 2 + ((a.longitude - p.lon) * Math.cos((p.lat * Math.PI) / 180)) ** 2

/** Buscador de lugares sobre el mapa, con la hora de llegada de los vehículos más cercanos. */
export default function MapSearch({ getMap, devices, positions, selectedId }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [place, setPlace] = useState<Place | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [routeFor, setRouteFor] = useState<number | null>(null)
  const [error, setError] = useState('')
  const pin = useRef<maplibregl.Marker | null>(null)

  // Busca mientras escribes (espera a que dejes de teclear).
  useEffect(() => {
    const text = query.trim()
    const m = getMap()
    if (text.length < 3 || !m || place) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      const c = m.getCenter()
      searchPlaces(text, { lat: c.lat, lon: c.lng }, ctrl.signal)
        .then((r) => {
          setResults(r)
          setError(r.length ? '' : 'No encontré ese lugar.')
        })
        .catch((e: Error) => {
          if (e.name === 'AbortError') return
          // El código ayuda a saber qué falla: 403 = la llave no tiene el buscador activado.
          const code = e.message.match(/\d{3}/)?.[0]
          setError(
            code === '403' || code === '401'
              ? `TomTom rechazó la llave (${code}). Revisa que tenga activado "Search API".`
              : `No se pudo buscar${code ? ` (error ${code})` : ''}.`,
          )
        })
    }, 350)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, place, getMap])

  const clearRoute = () => {
    const m = getMap()
    if (m) removeLayers(m, ['eta-route', 'eta-route-casing'], ['eta-route'])
    setRouteFor(null)
  }

  const close = () => {
    pin.current?.remove()
    pin.current = null
    clearRoute()
    setPlace(null)
    setRows([])
    setQuery('')
    setResults([])
    setError('')
  }

  useEffect(
    () => () => {
      pin.current?.remove()
    },
    [],
  )

  const choose = (p: Place) => {
    const m = getMap()
    if (!m) return
    clearRoute()
    setPlace(p)
    setQuery(p.name)
    setResults([])
    pin.current?.remove()
    pin.current = new maplibregl.Marker({ element: pinElement('B', 'end') }).setLngLat([p.lon, p.lat]).addTo(m)
    m.flyTo({ center: [p.lon, p.lat], zoom: Math.max(m.getZoom(), 14) })

    // El seleccionado primero, luego los más cercanos en línea recta.
    const withPos = Object.values(positions).filter((x) => devices[x.deviceId] && !devices[x.deviceId].disabled)
    const sorted = withPos.sort((a, b) => far(a, p) - far(b, p))
    const chosen = [...sorted.filter((x) => x.deviceId === selectedId), ...sorted.filter((x) => x.deviceId !== selectedId)].slice(0, MAX_ETAS)
    setRows(chosen.map((x) => ({ deviceId: x.deviceId })))
    chosen.forEach((x) =>
      routeEta({ lat: x.latitude, lon: x.longitude }, p)
        .then((eta) => setRows((prev) => prev.map((r) => (r.deviceId === x.deviceId ? { ...r, eta } : r))))
        .catch(() => setRows((prev) => prev.map((r) => (r.deviceId === x.deviceId ? { ...r, error: true } : r)))),
    )
  }

  const showRoute = (row: Row) => {
    const m = getMap()
    if (!m || !row.eta) return
    const line = row.eta.line
    setRouteFor(row.deviceId)
    whenReady(m, () => {
      const data: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }
      const src = m.getSource('eta-route') as maplibregl.GeoJSONSource | undefined
      if (src) src.setData(data)
      else {
        m.addSource('eta-route', { type: 'geojson', data })
        m.addLayer({
          id: 'eta-route-casing',
          type: 'line',
          source: 'eta-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#fff', 'line-width': 8 },
        })
        m.addLayer({
          id: 'eta-route',
          type: 'line',
          source: 'eta-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#2563eb', 'line-width': 5 },
        })
      }
      const bounds = line.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(line[0], line[0]))
      // Deja libre el lado izquierdo, donde está la tarjeta.
      const left = Math.min(380, m.getContainer().clientWidth * 0.45)
      m.fitBounds(bounds, { padding: { top: 70, bottom: 70, right: 70, left }, maxZoom: 15 })
    })
  }

  const searching = query.trim().length >= 3 && !place
  const sortedRows = [...rows].sort((a, b) => (a.eta?.seconds ?? Infinity) - (b.eta?.seconds ?? Infinity))

  return (
    <div className="map-search">
      <div className="map-search-box">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M10 2a8 8 0 0 1 6.3 12.9l5.4 5.4-1.4 1.4-5.4-5.4A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" />
        </svg>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (place) setPlace(null)
          }}
          placeholder="Buscar un lugar o dirección"
          aria-label="Buscar un lugar o dirección"
        />
        {(query || place) && (
          <button type="button" className="link" onClick={close} aria-label="Cerrar búsqueda">
            ✕
          </button>
        )}
      </div>
      {searching && results.length > 0 && (
        <ul className="map-search-results" role="listbox">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => choose(r)}>
                <strong>{r.name}</strong>
                {r.address && <small>{r.address}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && error && <div className="map-search-note">{error}</div>}
      {place && (
        <div className="map-search-card">
          <span className="field-title">¿Quién llega primero?</span>
          {rows.length === 0 && <span className="muted small">No hay vehículos con ubicación.</span>}
          {sortedRows.map((r) => (
            <button
              key={r.deviceId}
              type="button"
              className={routeFor === r.deviceId ? 'eta-row active' : 'eta-row'}
              onClick={() => showRoute(r)}
              disabled={!r.eta}
            >
              <span className="eta-name">{devices[r.deviceId]?.name}</span>
              {r.eta ? (
                <span className="eta-time">
                  <strong>{formatDuration(r.eta.seconds * 1000)}</strong>
                  <small>
                    {km(r.eta.meters)} · llega {formatTime(r.eta.arrival)}
                    {r.eta.delaySeconds >= 60 && <span className="eta-delay"> · +{Math.round(r.eta.delaySeconds / 60)} min por tráfico</span>}
                  </small>
                </span>
              ) : (
                <small className="muted">{r.error ? 'Sin ruta' : 'Calculando…'}</small>
              )}
            </button>
          ))}
          {rows.length > 0 && <span className="muted small">Toca un vehículo para ver su ruta.</span>}
        </div>
      )}
    </div>
  )
}
