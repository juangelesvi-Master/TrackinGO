import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { distance, escapeHtml, pinElement, removeLayers, whenReady } from '../mapUtil'
import { deleteRoute, formatDuration, formatTime, getPositions, getReport, getRoute, getStops, knotsToKmh, type Device, type Position, type Stop, type Trip } from '../traccar'

interface Route {
  points: Position[]
  stops: Stop[]
  trips: Trip[]
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

  const load = async (): Promise<Route | null> => {
    if (deviceId == null) return null
    const [y, m, d] = date.split('-').map(Number)
    const from = new Date(y, m - 1, d)
    const to = new Date(y, m - 1, d + 1)
    setLoading(true)
    setError('')
    setPlaying(false)
    setCursor(0)
    try {
      const [points, stops, trips] = await Promise.all([
        getRoute(deviceId, from, to),
        getStops(deviceId, from, to),
        getReport<Trip>('trips', [deviceId], from, to).catch(() => [] as Trip[]),
      ])
      const loaded = { points, stops, trips }
      setRoute(loaded)
      return loaded
    } catch {
      setRoute(null)
      setError('No se pudo cargar el recorrido. Inténtalo de nuevo.')
      return null
    } finally {
      setLoading(false)
    }
  }

  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState('')

  /** La última posición del vehículo: nunca se borra, porque es la que se ve en el mapa en vivo. */
  const latestFix = async () => {
    const latest = (await getPositions()).find((p) => p.deviceId === deviceId)
    return latest ? new Date(latest.fixTime).getTime() : Infinity
  }

  /** Borra las posiciones entre dos horas, sin tocar la ubicación actual. */
  const deleteBetween = async (from: Date, until: Date) => {
    const to = new Date(Math.min(until.getTime(), (await latestFix()) - 1000))
    if (deviceId != null && to > from) await deleteRoute(deviceId, from, to)
  }

  const removeRange = async (question: string, from: Date, until: Date, done: string) => {
    if (deviceId == null || !confirm(question)) return
    setDeleting(true)
    setError('')
    setNotice('')
    try {
      await deleteBetween(from, until)
      await load()
      setNotice(done)
    } catch {
      setError('No se pudo borrar. Inténtalo de nuevo.')
    } finally {
      setDeleting(false)
    }
  }

  const vehicleName = devices.find((d) => d.id === deviceId)?.name ?? 'este vehículo'

  const removeTrip = async (t: Trip, n: number) => {
    if (deviceId == null) return
    if (!confirm(`¿Borrar el recorrido ${n} de "${vehicleName}" (${formatTime(t.startTime)} – ${formatTime(t.endTime)})? No se puede deshacer.`)) return
    setDeleting(true)
    setError('')
    setNotice('')
    const a = new Date(t.startTime).getTime()
    const b = new Date(t.endTime).getTime()
    try {
      // Si el recorrido termina en la ubicación actual, el vehículo sigue en camino: no se puede borrar todavía.
      if (b >= (await latestFix()) - 1000) {
        setError(`El recorrido ${n} sigue en curso (el GPS todavía está mandando movimiento). Podrás borrarlo cuando el vehículo se detenga.`)
        return
      }
      await deleteBetween(new Date(a), new Date(b))
      // Traccar vuelve a calcular los recorridos con los puntos que quedan. Si con los puntos
      // de alrededor se forma otro recorrido en esas mismas horas, también se borra.
      const overlapping = (r: Route | null) =>
        (r?.trips ?? []).filter((x) => new Date(x.startTime).getTime() <= b && new Date(x.endTime).getTime() >= a)
      let left = overlapping(await load())
      for (let i = 0; i < 3 && left.length; i++) {
        const from = Math.min(...left.map((x) => new Date(x.startTime).getTime()))
        const to = Math.max(...left.map((x) => new Date(x.endTime).getTime()))
        await deleteBetween(new Date(from), new Date(to))
        left = overlapping(await load())
      }
      if (left.length) {
        setError(`No se pudo borrar por completo el recorrido ${n}. Vuelve a intentarlo en un momento.`)
        return
      }
      setNotice(`Se borró el recorrido ${n}.`)
    } catch {
      setError('No se pudo borrar. Inténtalo de nuevo.')
    } finally {
      setDeleting(false)
    }
  }
  const removeDay = () => {
    const [y, m, d] = date.split('-').map(Number)
    return removeRange(`¿Borrar todos los recorridos de "${vehicleName}" del ${d}/${m}/${y}? No se puede deshacer.`, new Date(y, m - 1, d), new Date(y, m - 1, d + 1), 'Se borraron los recorridos de ese día.')
  }
  const removeAll = () =>
    removeRange(
      `¿Borrar TODO el historial de recorridos de "${vehicleName}"? Solo se conserva su ubicación actual. No se puede deshacer.`,
      new Date(2000, 0, 1),
      new Date(),
      'Se borró el historial del vehículo.',
    )

  /** Acerca el mapa a un recorrido. */
  const showTrip = (t: Trip) => {
    if (!map || !route) return
    const a = new Date(t.startTime).getTime()
    const b = new Date(t.endTime).getTime()
    const pts = route.points.filter((p) => {
      const f = new Date(p.fixTime).getTime()
      return f >= a && f <= b
    })
    if (!pts.length) return
    const bounds = pts.reduce((bb, p) => bb.extend([p.longitude, p.latitude]), new maplibregl.LngLatBounds([pts[0].longitude, pts[0].latitude], [pts[0].longitude, pts[0].latitude]))
    map.fitBounds(bounds, { padding: 60, maxZoom: 16 })
    setPlaying(false)
    setCursor(route.points.indexOf(pts[0]))
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
        <button onClick={() => load()} disabled={loading || deviceId == null}>
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

          {route!.trips.length > 0 && (
            <>
              <h4 className="panel-pad list-title">Recorridos</h4>
              <ul className="device-list">
                {route!.trips.map((t, i) => (
                  <li key={t.startTime} onClick={() => showTrip(t)}>
                    <span className="pin pin-start pin-small">{i + 1}</span>
                    <div className="device-info">
                      <div className="device-name">Recorrido {i + 1}</div>
                      <div className="muted small">
                        {formatTime(t.startTime)} – {formatTime(t.endTime)} · {(t.distance / 1000).toFixed(1)} km · {formatDuration(t.duration)}
                      </div>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        className="icon-button danger-text"
                        title={`Borrar recorrido ${i + 1}`}
                        aria-label={`Borrar recorrido ${i + 1}`}
                        disabled={deleting}
                        onClick={(e) => {
                          e.stopPropagation()
                          removeTrip(t, i + 1)
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h2v-8h-2zm4 0v8h2v-8h-2z" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <h4 className="panel-pad list-title">Paradas</h4>
            </>
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
          <p className="muted small">Borrar todo el día o todo el historial (solo administradores, no se puede deshacer). Para borrar un solo recorrido usa el bote de basura junto a él.</p>
          <div className="row-actions">
            <button type="button" className="danger" onClick={removeDay} disabled={deleting}>
              Borrar este día
            </button>
            <button type="button" className="danger" onClick={removeAll} disabled={deleting}>
              Borrar todo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
