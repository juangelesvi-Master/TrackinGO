import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { knotsToKmh, timeAgo, type Device, type Position } from './traccar'
import { removeLayers, setStyleReady, whenReady } from './mapUtil'
import MapSearch from './MapSearch'
import { hasTomTom, incidentTiles } from './tomtom'
import { hasTraffic, MAP_STYLES, saveStyle, savedStyle, saveTraffic, savedTraffic, trafficTiles } from './mapStyles'

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

/** Tiempo que tarda un marcador en deslizarse a su nueva posición. */
const GLIDE_MS = 900
/** Más lejos que esto (en grados, unos 2 km) el marcador salta en vez de deslizarse. */
const GLIDE_MAX = 0.02

/** Desliza un marcador hasta su nueva posición, para que el vehículo se vea avanzar en lugar de brincar. */
function glide(marker: maplibregl.Marker, to: [number, number], frames: Map<maplibregl.Marker, number>) {
  cancelAnimationFrame(frames.get(marker) ?? 0)
  const from = marker.getLngLat()
  const [lng, lat] = to
  if (Math.abs(lng - from.lng) > GLIDE_MAX || Math.abs(lat - from.lat) > GLIDE_MAX || document.hidden) {
    marker.setLngLat(to)
    return
  }
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / GLIDE_MS)
    marker.setLngLat([from.lng + (lng - from.lng) * t, from.lat + (lat - from.lat) * t])
    if (t < 1) frames.set(marker, requestAnimationFrame(step))
    else frames.delete(marker)
  }
  frames.set(marker, requestAnimationFrame(step))
}

export default function FleetMap({ devices, positions, selectedId, onSelect, showLive, onMap }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef(new Map<number, maplibregl.Marker>())
  const frames = useRef(new Map<maplibregl.Marker, number>())
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
      const target: [number, number] = [p.longitude, p.latitude]
      const before = marker.getLngLat()
      if (before.lng !== target[0] || before.lat !== target[1]) {
        glide(marker, target, frames.current)
        // El mapa sigue al vehículo seleccionado mientras se mueve, salvo que lo estés arrastrando.
        if (d.id === selectedRef.current && !m.isMoving()) m.easeTo({ center: target, duration: GLIDE_MS, easing: (t) => t })
      }
      const el = marker.getElement()
      el.dataset.status = d.status
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
  }, [devices, positions])

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
