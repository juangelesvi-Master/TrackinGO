import { useEffect, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { removeLayers, shapeRing, shapeToWkt, whenReady, wktToShape, type Shape } from '../mapUtil'
import { addLinks, createGeofence, deleteGeofence, getGeofences, type Device, type Geofence } from '../traccar'

type Mode = 'circle' | 'polygon'

function collection(shapes: { shape: Shape; id: number }[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: shapes.map(({ shape, id }) => ({
      type: 'Feature',
      properties: { id },
      geometry: { type: 'Polygon', coordinates: [shapeRing(shape)] },
    })),
  }
}

/** Capa con las geocercas guardadas y, encima, la que se está dibujando. */
function useGeofenceLayers(map: maplibregl.Map | null, geofences: Geofence[], draft: Shape | null, draftPoints: [number, number][]) {
  useEffect(() => {
    if (!map) return
    whenReady(map, () => {
      const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
      map.addSource('geofences', { type: 'geojson', data: empty })
      map.addSource('draft', { type: 'geojson', data: empty })
      map.addSource('draft-points', { type: 'geojson', data: empty })
      map.addLayer({ id: 'geofences-fill', type: 'fill', source: 'geofences', paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.15 } })
      map.addLayer({ id: 'geofences-line', type: 'line', source: 'geofences', paint: { 'line-color': '#7c3aed', 'line-width': 2 } })
      map.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.2 } })
      map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 1] } })
      map.addLayer({
        id: 'draft-points',
        type: 'circle',
        source: 'draft-points',
        paint: { 'circle-radius': 5, 'circle-color': '#f59e0b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      })
    })
    return () =>
      removeLayers(map, ['draft-points', 'draft-line', 'draft-fill', 'geofences-line', 'geofences-fill'], ['draft-points', 'draft', 'geofences'])
  }, [map])

  useEffect(() => {
    if (!map) return
    whenReady(map, () => {
      const shapes = geofences.flatMap((g) => {
        const shape = wktToShape(g.area)
        return shape ? [{ shape, id: g.id }] : []
      })
      ;(map.getSource('geofences') as maplibregl.GeoJSONSource | undefined)?.setData(collection(shapes))
    })
  }, [map, geofences])

  useEffect(() => {
    if (!map) return
    whenReady(map, () => {
      ;(map.getSource('draft') as maplibregl.GeoJSONSource | undefined)?.setData(collection(draft ? [{ shape: draft, id: 0 }] : []))
      ;(map.getSource('draft-points') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: draftPoints.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })),
      })
    })
  }, [map, draft, draftPoints])
}

export default function GeofencesPanel({ map, devices, canEdit }: { map: maplibregl.Map | null; devices: Device[]; canEdit: boolean }) {
  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [drawing, setDrawing] = useState<Mode | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [radius, setRadius] = useState(300)
  const [points, setPoints] = useState<[number, number][]>([])
  const [name, setName] = useState('')
  const [allDevices, setAllDevices] = useState(true)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = () =>
    getGeofences()
      .then(setGeofences)
      .catch(() => setError('No se pudieron cargar las geocercas.'))

  useEffect(() => {
    reload()
  }, [])

  const draft: Shape | null =
    drawing === 'circle' && center ? { kind: 'circle', center, radius } : drawing === 'polygon' && points.length >= 3 ? { kind: 'polygon', points } : null

  useGeofenceLayers(map, geofences, draft, drawing === 'polygon' ? points : center ? [center] : [])

  // Mientras se dibuja, cada clic en el mapa pone el centro o agrega un vértice.
  useEffect(() => {
    if (!map || !drawing) return
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const c: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      if (drawing === 'circle') setCenter(c)
      else setPoints((p) => [...p, c])
    }
    map.on('click', onClick)
    map.getCanvas().style.cursor = 'crosshair'
    return () => {
      map.off('click', onClick)
      map.getCanvas().style.cursor = ''
    }
  }, [map, drawing])

  const reset = () => {
    setDrawing(null)
    setCenter(null)
    setPoints([])
    setName('')
    setAllDevices(true)
    setChosen(new Set())
    setError('')
  }

  const save = async () => {
    if (!draft) return
    if (!name.trim()) return setError('Ponle un nombre a la geocerca.')
    const ids = allDevices ? devices.map((d) => d.id) : [...chosen]
    if (ids.length === 0) return setError('Elige al menos un vehículo.')
    setBusy(true)
    setError('')
    try {
      const g = await createGeofence({ name: name.trim(), area: shapeToWkt(draft) })
      await addLinks(ids.map((deviceId) => ({ deviceId, geofenceId: g.id })))
      reset()
      reload()
    } catch {
      setError('No se pudo guardar la geocerca.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (g: Geofence) => {
    if (!confirm(`¿Borrar la geocerca "${g.name}"?`)) return
    await deleteGeofence(g.id).catch(() => setError('No se pudo borrar.'))
    reload()
  }

  const focus = (g: Geofence) => {
    const shape = wktToShape(g.area)
    if (!map || !shape) return
    const ring = shapeRing(shape)
    const lngs = ring.map((c) => c[0])
    const lats = ring.map((c) => c[1])
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 80, maxZoom: 17 },
    )
  }

  if (drawing) {
    return (
      <div className="panel">
        <div className="panel-form">
          <h3>Nueva geocerca {drawing === 'circle' ? 'circular' : 'de polígono'}</h3>
          <div className="notice">
            {drawing === 'circle'
              ? 'Haz clic en el mapa para poner el centro y ajusta el tamaño.'
              : 'Haz clic en el mapa para marcar cada esquina de la zona (mínimo 3).'}
          </div>
          {drawing === 'circle' && (
            <label>
              Radio: {radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}
              <input type="range" min={50} max={5000} step={50} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
            </label>
          )}
          {drawing === 'polygon' && (
            <div className="row">
              <span className="muted small">{points.length} puntos</span>
              <button type="button" className="ghost" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>
                Deshacer punto
              </button>
            </div>
          )}
          <label>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Bodega central" />
          </label>
          <label className="check">
            <input type="checkbox" checked={allDevices} onChange={(e) => setAllDevices(e.target.checked)} />
            Aplicar a todos los vehículos
          </label>
          {!allDevices && (
            <div className="check-list">
              {devices.map((d) => (
                <label key={d.id} className="check">
                  <input
                    type="checkbox"
                    checked={chosen.has(d.id)}
                    onChange={(e) => {
                      const next = new Set(chosen)
                      if (e.target.checked) next.add(d.id)
                      else next.delete(d.id)
                      setChosen(next)
                    }}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          )}
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button className="secondary" onClick={reset} disabled={busy}>
              Cancelar
            </button>
            <button onClick={save} disabled={busy || !draft}>
              {busy ? 'Guardando…' : 'Guardar geocerca'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-form">
        <p className="muted small">Zonas como bodegas, clientes o rutas permitidas. Activa los avisos en la pestaña Alertas.</p>
        {canEdit && (
          <div className="row">
            <button onClick={() => setDrawing('circle')}>+ Círculo</button>
            <button onClick={() => setDrawing('polygon')}>+ Polígono</button>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
      <ul className="device-list">
        {geofences.map((g) => (
          <li key={g.id} onClick={() => focus(g)}>
            <span className="dot geofence" />
            <div className="device-info">
              <div className="device-name">{g.name}</div>
              <div className="muted small">{wktToShape(g.area)?.kind === 'circle' ? 'Círculo' : 'Polígono'}</div>
            </div>
            {canEdit && (
              <button
                className="link danger-text"
                onClick={(e) => {
                  e.stopPropagation()
                  remove(g)
                }}
              >
                Borrar
              </button>
            )}
          </li>
        ))}
        {geofences.length === 0 && <li className="muted empty">Todavía no hay geocercas.</li>}
      </ul>
    </div>
  )
}
