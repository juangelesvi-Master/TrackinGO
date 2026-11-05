import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { knotsToKmh, timeAgo, type Device, type Position } from './traccar'
import { removeLayers, setStyleReady, whenReady } from './mapUtil'
import MapSearch from './MapSearch'
import { hasTomTom, incidentTiles } from './tomtom'
import { hasTraffic, MAP_STYLES, saveStyle, savedStyle, saveTraffic, savedTraffic, trafficTiles } from './mapStyles'
import { vehicleIconHtml, vehicleKind } from './vehicleIcons'

// Vite no encuentra solo el "worker" de MapLibre; le indicamos dónde está.
maplibregl.setWorkerUrl(workerUrl)

interface Props {
  devices: Record<number, Device>
  positions: Record<number, Position>
  selectedId: number | null
  onSelect: (id: number) => void
  /** false oculta los vehículos en vivo (por ejemplo, al ver un historial). */
  showLive: boolean
  /** Entrega el mapa a las otras pantallas para que dibujen encima (rutas, geocercas). */
  onMap: (map: maplibregl.Map | null) => void
  /** Puntos intermedios que llegaron en vivo y aún no se dibujan, por vehículo. El mapa los va tomando. */
  trail: Map<number, Position[]>
  /** Mapa ampliado (sin la lista de la izquierda). */
  wide: boolean
  onToggleWide: () => void
}

function markerElement() {
  const el = document.createElement('div')
  el.className = 'vehicle-marker'
  el.innerHTML = '<div class="arrow"></div><div class="label"></div>'
  return el
}

function popupHtml(d: Device, p: Position) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
  return `
    <strong>${esc(d.name)}</strong><br/>
    Velocidad: ${knotsToKmh(p.speed)} km/h<br/>
    Último reporte: ${timeAgo(p.fixTime)}<br/>
    ${p.address ? esc(p.address) + '<br/>' : ''}
    <span class="muted">${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}</span>`
}

/** Duración mínima del deslizamiento de un marcador. */
const GLIDE_MS = 900
/** Duración máxima: si el GPS tarda más en reportar, el marcador se detiene a esperar. */
const GLIDE_MAX_MS = 45000
/** Más lejos que esto (en grados, unos 2 km) el marcador salta en vez de deslizarse. */
const GLIDE_MAX = 0.02

/** Lo que el mapa recuerda de cada marcador para moverlo sin brincos. */
interface Track {
  /** Hora (del GPS) del último punto ya dibujado. */
  lastFix: number
  /** Cuándo llegó el último reporte a la app. */
  lastArrival: number
  /** Cada cuánto suele reportar este GPS, en ms. */
  interval: number
}

/**
 * Mueve un marcador por los puntos que mandó el GPS, a velocidad pareja y tardando
 * más o menos lo mismo que tarda en llegar el siguiente reporte. Así el vehículo se ve
 * avanzar sin pausas aunque el GPS mande sus puntos en paquetes cada 20 o 30 segundos.
 */
function travel(marker: maplibregl.Marker, points: [number, number][], ms: number, frames: Map<maplibregl.Marker, number>, onStep?: (at: [number, number]) => void) {
  cancelAnimationFrame(frames.get(marker) ?? 0)
  const from = marker.getLngLat()
  const path: [number, number][] = [[from.lng, from.lat], ...points]
  const last = path[path.length - 1]
  const far = path.some(([lng, lat]) => Math.abs(lng - from.lng) > GLIDE_MAX || Math.abs(lat - from.lat) > GLIDE_MAX)
  if (far || document.hidden) {
    marker.setLngLat(last)
    onStep?.(last)
    return
  }
  // Largo de cada tramo, para avanzar a velocidad pareja por toda la ruta.
  const lengths = path.slice(1).map(([lng, lat], i) => Math.hypot(lng - path[i][0], lat - path[i][1]))
  const total = lengths.reduce((a, b) => a + b, 0)
  if (total === 0) {
    marker.setLngLat(last)
    return
  }
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms)
    let left = t * total
    let i = 0
    while (i < lengths.length - 1 && left > lengths[i]) left -= lengths[i++]
    const f = lengths[i] ? Math.min(1, left / lengths[i]) : 1
    const at: [number, number] = [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f]
    marker.setLngLat(at)
    onStep?.(at)
    if (t < 1) frames.set(marker, requestAnimationFrame(step))
    else frames.delete(marker)
  }
  frames.set(marker, requestAnimationFrame(step))
}

export default function FleetMap({ devices, positions, trail, selectedId, onSelect, showLive, onMap, wide, onToggleWide }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef(new Map<number, maplibregl.Marker>())
  const frames = useRef(new Map<maplibregl.Marker, number>())
  const tracks = useRef(new Map<number, Track>())
  const selectedRef = useRef(selectedId)
  const fitted = useRef(false)
  const [styleId, setStyleId] = useState(() => savedStyle().id)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [traffic, setTraffic] = useState(() => hasTraffic && savedTraffic())
  // Fuentes del mapa base actual; las demás son nuestras (rutas, geocercas) y se conservan al cambiarlo.
  const baseSources = useRef<Set<string> | null>(null)
  const carried = useRef(new Set<string>())
  const onSelectRef = useRef(onSelect)
  const onMapRef = useRef(onMap)
  useEffect(() => {
    onSelectRef.current = onSelect
    onMapRef.current = onMap
    selectedRef.current = selectedId
  })

  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: savedStyle().style,
      center: [-99.13, 19.43],
      zoom: 4,
    })
    m.on('style.load', () => {
      const ids = Object.keys(m.getStyle().sources)
      baseSources.current = new Set(ids.filter((id) => !carried.current.has(id)))
      setStyleReady(m, true)
    })
    m.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.current = m
    onMapRef.current(m)
    const current = markers.current
    return () => {
      onMapRef.current(null)
      current.clear()
      m.remove()
      map.current = null
      fitted.current = false
    }
  }, [])

  // Crea, mueve o quita marcadores cuando llegan posiciones nuevas.
  useEffect(() => {
    const m = map.current
    if (!m) return
    const seen = new Set<number>()
    for (const p of Object.values(positions)) {
      const d = devices[p.deviceId]
      if (!d) continue
      seen.add(d.id)
      let marker = markers.current.get(d.id)
      if (!marker) {
        const el = markerElement()
        el.addEventListener('click', () => onSelectRef.current(d.id))
        marker = new maplibregl.Marker({ element: el }).setLngLat([p.longitude, p.latitude]).addTo(m)
        marker.setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }))
        markers.current.set(d.id, marker)
      }
      const fix = new Date(p.fixTime).getTime()
      const now = performance.now()
      const track = tracks.current.get(d.id)
      // Puntos nuevos en orden: los intermedios del paquete y al final la posición actual.
      const fresh = (trail.get(d.id) ?? []).filter((q) => !track || new Date(q.fixTime).getTime() > track.lastFix)
      trail.delete(d.id)
      if (!fresh.some((q) => q.id === p.id)) fresh.push(p)
      fresh.sort((a, b) => new Date(a.fixTime).getTime() - new Date(b.fixTime).getTime())
      if (!track) {
        tracks.current.set(d.id, { lastFix: fix, lastArrival: now, interval: GLIDE_MS })
      } else if (fix > track.lastFix) {
        // Cada cuánto llegan los reportes de este GPS (promedio suave).
        const gap = Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MS, now - track.lastArrival))
        // Si pasó mucho sin noticias (la app estuvo en segundo plano), va directo a la posición actual.
        const stale = now - track.lastArrival > 2 * GLIDE_MAX_MS
        track.interval = track.interval === GLIDE_MS ? gap : track.interval * 0.6 + gap * 0.4
        track.lastArrival = now
        track.lastFix = fix
        const points = fresh.map((q): [number, number] => [q.longitude, q.latitude])
        const follow = d.id === selectedRef.current
        // El mapa sigue al vehículo seleccionado mientras se mueve, salvo que lo estés arrastrando.
        travel(marker, stale ? points.slice(-1) : points, stale ? GLIDE_MS : track.interval, frames.current, follow ? (at) => !m.isMoving() && m.jumpTo({ center: at }) : undefined)
      }
      const el = marker.getElement()
      el.dataset.status = d.status
      const kind = vehicleKind(d.category)
      if (el.dataset.kind !== kind) {
        el.dataset.kind = kind
        el.querySelector<HTMLElement>('.arrow')!.innerHTML = vehicleIconHtml(kind)
      }
      el.querySelector<HTMLElement>('.arrow')!.style.transform = `rotate(${p.course}deg)`
      el.querySelector<HTMLElement>('.label')!.textContent = d.name
      marker.getPopup()?.setHTML(popupHtml(d, p))
    }
    for (const [id, marker] of markers.current) {
      if (!seen.has(id)) {
        marker.remove()
        markers.current.delete(id)
      }
    }

    // La primera vez, encuadra toda la flota.
    if (!fitted.current && seen.size > 0) {
      fitted.current = true
      const bounds = new maplibregl.LngLatBounds()
      for (const id of seen) bounds.extend(markers.current.get(id)!.getLngLat())
      m.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 })
    }
  }, [devices, positions, trail])

  // Al seleccionar un vehículo, centra el mapa y abre su ficha.
  useEffect(() => {
    const m = map.current
    if (!m) return
    for (const [id, marker] of markers.current) {
      marker.getElement().classList.toggle('selected', id === selectedId)
      if (id !== selectedId && marker.getPopup()?.isOpen()) marker.togglePopup()
    }
    if (selectedId == null) return
    const marker = markers.current.get(selectedId)
    if (!marker) return
    m.flyTo({ center: marker.getLngLat(), zoom: Math.max(m.getZoom(), 14) })
    if (!marker.getPopup()?.isOpen()) marker.togglePopup()
  }, [selectedId])

  // Capa de tráfico en vivo encima del mapa base (se conserva al cambiar de mapa).
  useEffect(() => {
    const m = map.current
    if (!m || !hasTraffic) return
    whenReady(m, () => {
      if (!traffic) return removeLayers(m, ['traffic', 'incidents'], ['traffic', 'incidents'])
      if (m.getSource('traffic')) return
      m.addSource('traffic', { type: 'raster', tiles: trafficTiles(), tileSize: 256, attribution: 'Tráfico © TomTom' })
      m.addLayer({ id: 'traffic', type: 'raster', source: 'traffic', paint: { 'raster-opacity': 0.85 } })
      // Accidentes, obras y cierres, con sus iconos.
      m.addSource('incidents', { type: 'raster', tiles: incidentTiles(), tileSize: 256 })
      m.addLayer({ id: 'incidents', type: 'raster', source: 'incidents' })
    })
  }, [traffic])

  // Al ampliar o reducir, el mapa se reacomoda al nuevo tamaño.
  useEffect(() => {
    const id = requestAnimationFrame(() => map.current?.resize())
    return () => cancelAnimationFrame(id)
  }, [wide])

  const getMap = useCallback(() => map.current, [])

  function toggleTraffic() {
    setTraffic((on) => {
      saveTraffic(!on)
      return !on
    })
  }

  function changeStyle(id: string) {
    setPickerOpen(false)
    const m = map.current
    const option = MAP_STYLES.find((s) => s.id === id)
    if (!m || !option || id === styleId) return
    setStyleId(id)
    saveStyle(id)
    setStyleReady(m, false)
    m.setStyle(option.style, {
      diff: false,
      // Pasa al mapa nuevo las capas que dibujamos encima (rutas, geocercas).
      transformStyle: (prev, next) => {
        const base = baseSources.current ?? new Set<string>()
        const keep = Object.entries(prev?.sources ?? {}).filter(([sid]) => !base.has(sid) && !(sid in next.sources))
        carried.current = new Set(keep.map(([sid]) => sid))
        const layers = (prev?.layers ?? []).filter((l) => 'source' in l && carried.current.has(l.source as string))
        return { ...next, sources: { ...next.sources, ...Object.fromEntries(keep) }, layers: [...next.layers, ...layers] }
      },
    })
  }

  useEffect(() => {
    if (!showLive) for (const marker of markers.current.values()) if (marker.getPopup()?.isOpen()) marker.togglePopup()
  }, [showLive])

  const current = MAP_STYLES.find((s) => s.id === styleId) ?? MAP_STYLES[0]
  return (
    <div className={showLive ? 'map' : 'map hide-live'}>
      <div ref={container} className="map-canvas" />
      {hasTomTom && showLive && <MapSearch getMap={getMap} devices={devices} positions={positions} selectedId={selectedId} />}
      <button
        type="button"
        className="map-expand"
        onClick={onToggleWide}
        aria-pressed={wide}
        title={wide ? 'Regresar el mapa a su tamaño' : 'Ampliar el mapa'}
        aria-label={wide ? 'Regresar el mapa a su tamaño' : 'Ampliar el mapa'}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d={wide ? 'M9 3v6H3V7h4V3h2zm6 0h2v4h4v2h-6V3zM3 15h6v6H7v-4H3v-2zm12 0h6v2h-4v4h-2v-6z' : 'M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 0h2v6h-6v-2h4v-4z'}
          />
        </svg>
      </button>
      <div className="style-picker">
        <button type="button" className="style-toggle" onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen} title="Cambiar tipo de mapa">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M12 3 2 8l10 5 10-5-10-5zm-7.6 8.7L2 13l10 5 10-5-2.4-1.3L12 15.5l-7.6-3.8zm0 4L2 17l10 5 10-5-2.4-1.3L12 19.5l-7.6-3.8z" />
          </svg>
          {current.name}
        </button>
        {hasTraffic && (
          <button type="button" className={traffic ? 'style-toggle traffic-toggle on' : 'style-toggle traffic-toggle'} onClick={toggleTraffic} aria-pressed={traffic} title="Mostrar el tráfico en vivo">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M9 2h6a2 2 0 0 1 2 2v1h3l-3 3v1h3l-3 3v1h3l-3 3v1a2 2 0 0 1-2 2h-1v2h-4v-2H9a2 2 0 0 1-2-2v-1l-3-3h3v-1L4 9h3V8L4 5h3V4a2 2 0 0 1 2-2zm3 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
              />
            </svg>
            Tráfico
          </button>
        )}
        {pickerOpen && (
          <ul className="style-list" role="menu">
            {MAP_STYLES.map((s) => (
              <li key={s.id}>
                <button type="button" role="menuitemradio" aria-checked={s.id === styleId} className={s.id === styleId ? 'active' : ''} onClick={() => changeStyle(s.id)}>
                  <span className={`style-swatch sw-${s.id}`} />
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.hint}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
