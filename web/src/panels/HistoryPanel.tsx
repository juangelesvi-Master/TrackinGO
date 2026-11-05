import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { distance, escapeHtml, pinElement, removeLayers, whenReady } from '../mapUtil'
import { deleteRoute, formatDuration, formatTime, getPositions, getRoute, getStops, knotsToKmh, type Device, type Position, type Stop } from '../traccar'

interface Route {
  points: Position[]
  stops: Stop[]
}

const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const PLAY_SPEEDS = [1, 5, 20]

/** Kilómetros recorridos: usa el odómetro de Traccar si viene, si no suma las distancias entre puntos. */
function routeKm(points: Position[]) {
  const first = points[0]?.attributes.totalDistance
  const last = points[points.length - 1]?.attributes.totalDistance
  if (typeof first === 'number' && typeof last === 'number' && last >= first) return (last - first) / 1000
  let m = 0
  for (let i = 1; i < points.length; i++) {
    m += distance([points[i - 1].longitude, points[i - 1].latitude], [points[i].longitude, points[i].latitude])
  }
  return m / 1000
}

/** Dibuja la ruta, las paradas y el vehículo que se mueve al reproducir. */
function useRouteLayer(map: maplibregl.Map | null, route: Route | null, cursor: number) {
  const playback = useRef<maplibregl.Marker | null>(null)

  useEffect(() => {
    if (!map || !route || route.points.length === 0) return
    const pts = route.points
    const coords = pts.map((p) => [p.longitude, p.latitude] as [number, number])
    const markers: maplibregl.Marker[] = []

    whenReady(map, () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
      })
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#0f62fe', 'line-width': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })

      markers.push(new maplibregl.Marker({ element: pinElement('A', 'start') }).setLngLat(coords[0]).addTo(map))
      markers.push(new maplibregl.Marker({ element: pinElement('B', 'end') }).setLngLat(coords[coords.length - 1]).addTo(map))
      route.stops.forEach((s, i) => {
        const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
          `<strong>Parada ${i + 1}</strong><br/>${formatTime(s.startTime)} – ${formatTime(s.endTime)} (${formatDuration(s.duration)})${s.address ? '<br/>' + escapeHtml(s.address) : ''}`,
        )
        markers.push(new maplibregl.Marker({ element: pinElement(String(i + 1), 'stop') }).setLngLat([s.longitude, s.latitude]).setPopup(popup).addTo(map))
      })

      const el = document.createElement('div')
      el.className = 'vehicle-marker playback'
      el.dataset.status = 'online'
      el.innerHTML = '<div class="arrow"></div><div class="label"></div>'
      playback.current = new maplibregl.Marker({ element: el }).setLngLat(coords[0]).addTo(map)
      markers.push(playback.current)

      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      map.fitBounds(bounds, { padding: 60, maxZoom: 16 })
    })

    return () => {
      markers.forEach((m) => m.remove())
      playback.current = null
      removeLayers(map, ['route-line', 'route-casing'], ['route'])
    }
  }, [map, route])

  useEffect(() => {
    const p = route?.points[cursor]
    const marker = playback.current
    if (!p || !marker) return
    marker.setLngLat([p.longitude, p.latitude])
    const el = marker.getElement()
    el.querySelector<HTMLElement>('.arrow')!.style.transform = `rotate(${p.course}deg)`
    el.querySelector<HTMLElement>('.label')!.textContent = `${formatTime(p.fixTime)} · ${knotsToKmh(p.speed)} km/h`
  }, [route, cursor])
}

interface Props {
  map: maplibregl.Map | null
  devices: Device[]
  initialDeviceId: number | null
  /** Administradores: pueden borrar el historial. */
  canDelete: boolean
}

export default function HistoryPanel({ map, devices, initialDeviceId, canDelete }: Props) {
  const [deviceId, setDeviceId] = useState<number | null>(initialDeviceId ?? devices[0]?.id ?? null)
  const [today] = useState(() => toInputDate(new Date()))
  const [date, setDate] = useState(today)
  const [route, setRoute] = useState<Route | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(5)

  useRouteLayer(map, route, cursor)

  // Reproducción: avanza punto por punto.
  useEffect(() => {
    if (!playing || !route) return
    const timer = setInterval(() => {
      setCursor((c) => {
        if (c >= route.points.length - 1) {
          setPlaying(false)
          return c
        }
        return c + 1
      })
    }, 500 / speed)
    return () => clearInterval(timer)
  }, [playing, speed, route])

  const load = async () => {
    if (deviceId == null) return
    const [y, m, d] = date.split('-').map(Number)
    const from = new Date(y, m - 1, d)
    const to = new Date(y, m - 1, d + 1)
    setLoading(true)
    setError('')
    setPlaying(false)
    setCursor(0)
    try {
      const [points, stops] = await Promise.all([getRoute(deviceId, from, to), getStops(deviceId, from, to)])
      setRoute({ points, stops })
    } catch {
      setRoute(null)
      setError('No se pudo cargar el recorrido. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState('')

  /** Borra el recorrido de este día o todo el historial del vehículo. Siempre conserva su ubicación actual. */
  const remove = async (all: boolean) => {
    if (deviceId == null) return
    const name = devices.find((d) => d.id === deviceId)?.name ?? 'este vehículo'
    const [y, m, d] = date.split('-').map(Number)
    const question = all
      ? `¿Borrar TODO el historial de recorridos de "${name}"? Solo se conserva su ubicación actual. No se puede deshacer.`
      : `¿Borrar el recorrido de "${name}" del ${d}/${m}/${y}? No se puede deshacer.`
    if (!confirm(question)) return
    setDeleting(true)
    setError('')
    setNotice('')
    try {
      const from = all ? new Date(2000, 0, 1) : new Date(y, m - 1, d)
      let to = all ? new Date() : new Date(y, m - 1, d + 1)
      // No borrar la última posición: es la que se ve en el mapa en vivo.
      const latest = (await getPositions()).find((p) => p.deviceId === deviceId)
      if (latest) {
        const keep = new Date(new Date(latest.fixTime).getTime() - 1000)
        if (keep < to) to = keep
      }
      if (to > from) await deleteRoute(deviceId, from, to)
      setRoute(all || route ? { points: [], stops: [] } : null)
      setPlaying(false)
      setCursor(0)
      setNotice(all ? 'Se borró el historial del vehículo.' : 'Se borró el recorrido de ese día.')
    } catch {
      setError('No se pudo borrar el historial. Inténtalo de nuevo.')
    } finally {
      setDeleting(false)
    }
  }

  const shiftDay = (days: number) => {
    const [y, m, d] = date.split('-').map(Number)
    setDate(toInputDate(new Date(y, m - 1, d + days)))
  }

  const summary = useMemo(() => {
    if (!route || route.points.length === 0) return null
    const pts = route.points
    return {
      km: routeKm(pts),
      maxSpeed: Math.max(...pts.map((p) => knotsToKmh(p.speed))),
      start: formatTime(pts[0].fixTime),
      end: formatTime(pts[pts.length - 1].fixTime),
    }
  }, [route])

  const current = route?.points[cursor]

  return (
    <div className="panel">
      <div className="panel-form">
        <label>
          Vehículo
          <select value={deviceId ?? ''} onChange={(e) => setDeviceId(Number(e.target.value))}>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Día
          <span className="date-row">
            <button type="button" className="ghost" onClick={() => shiftDay(-1)} aria-label="Día anterior">
              ‹
            </button>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            <button type="button" className="ghost" onClick={() => shiftDay(1)} aria-label="Día siguiente">
              ›
            </button>
          </span>
        </label>
        <button onClick={load} disabled={loading || deviceId == null}>
          {loading ? 'Cargando…' : 'Ver recorrido'}
        </button>
        {error && <div className="error">{error}</div>}
        {notice && <div className="notice success">{notice}</div>}
      </div>

      {route && route.points.length === 0 && <p className="muted empty">Este vehículo no reportó posiciones ese día.</p>}

      {summary && (
        <>
          <div className="stats">
            <div>
              <strong>{summary.km.toFixed(1)}</strong>
              <span>km</span>
            </div>
            <div>
              <strong>{summary.maxSpeed}</strong>
              <span>km/h máx.</span>
            </div>
            <div>
              <strong>{route!.stops.length}</strong>
              <span>paradas</span>
            </div>
          </div>
          <p className="muted small panel-pad">
            Primer reporte {summary.start} · último {summary.end}
          </p>

          <div className="player">
            <button
              onClick={() => {
                if (!playing && cursor >= route!.points.length - 1) setCursor(0)
                setPlaying(!playing)
              }}
            >{playing ? 'Pausa' : cursor >= route!.points.length - 1 ? 'Repetir' : 'Reproducir'}</button>
            <input
              type="range"
              min={0}
              max={route!.points.length - 1}
              value={cursor}
              onChange={(e) => {
                setPlaying(false)
                setCursor(Number(e.target.value))
              }}
            />
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Velocidad de reproducción">
              {PLAY_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  x{s}
                </option>
              ))}
            </select>
          </div>
          {current && (
            <p className="small panel-pad">
              {formatTime(current.fixTime)} · {knotsToKmh(current.speed)} km/h
            </p>
          )}

          <ul className="device-list">
            {route!.stops.map((s, i) => (
              <li key={s.positionId + s.startTime} onClick={() => map?.flyTo({ center: [s.longitude, s.latitude], zoom: 16 })}>
                <span className="pin pin-stop pin-small">{i + 1}</span>
                <div className="device-info">
                  <div className="device-name">
                    {formatTime(s.startTime)} – {formatTime(s.endTime)} · {formatDuration(s.duration)}
                  </div>
                  <div className="muted small">{s.address || `${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {canDelete && deviceId != null && (
        <div className="panel-pad danger-zone">
          <p className="muted small">Borrar historial (solo administradores, no se puede deshacer)</p>
          <div className="row-actions">
            <button type="button" className="danger" onClick={() => remove(false)} disabled={deleting}>
              Borrar este día
            </button>
            <button type="button" className="danger" onClick={() => remove(true)} disabled={deleting}>
              Borrar todo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
