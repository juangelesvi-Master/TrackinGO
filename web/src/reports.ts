import { getReport, knotsToKmh, type Device, type Stop, type SummaryRow, type TraccarEvent, type Trip } from './traccar'

export type ReportKind = 'summary' | 'trips' | 'stops' | 'overspeed'

export const REPORT_KINDS: { id: ReportKind; label: string; description: string }[] = [
  { id: 'summary', label: 'Resumen', description: 'Kilómetros, velocidades, horas de motor, paradas y excesos de cada vehículo.' },
  { id: 'trips', label: 'Viajes', description: 'Cada recorrido: de dónde salió, a dónde llegó, cuánto tardó y cuántos kilómetros hizo.' },
  { id: 'stops', label: 'Paradas', description: 'Dónde se detuvo cada vehículo y cuánto tiempo.' },
  { id: 'overspeed', label: 'Excesos', description: 'Cada vez que un vehículo pasó su límite de velocidad.' },
]

export type Cell = string | number

export interface ReportColumn {
  label: string
  number?: boolean // se alinea a la derecha y en Excel queda como número
  width?: number // ancho en Excel (caracteres)
}

export interface ReportTable {
  kind: ReportKind
  title: string
  period: string
  columns: ReportColumn[]
  rows: Cell[][]
  total?: Cell[]
}

// --- Periodos ---
export type PeriodId = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom'

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: 'Últimos 7 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes pasado' },
  { id: 'custom', label: 'Elegir fechas' },
]

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
/** "2026-10-12" en hora local. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function periodRange(id: PeriodId, now: Date, custom?: { from: string; to: string }): { from: Date; to: Date } {
  const today = startOfDay(now)
  switch (id) {
    case 'today':
      return { from: today, to: now }
    case 'yesterday':
      return { from: addDays(today, -1), to: today }
    case 'week':
      return { from: addDays(today, -6), to: now }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
    case 'lastMonth':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) }
    case 'custom': {
      const [fy, fm, fd] = (custom?.from ?? isoDay(today)).split('-').map(Number)
      const [ty, tm, td] = (custom?.to ?? isoDay(today)).split('-').map(Number)
      return { from: new Date(fy, fm - 1, fd), to: new Date(ty, tm - 1, td + 1) }
    }
  }
}

const dayText = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
export function periodText(from: Date, to: Date) {
  // "to" es exclusivo cuando cae a medianoche.
  const last = to.getHours() === 0 && to.getMinutes() === 0 && to > from ? addDays(to, -1) : to
  return isoDay(from) === isoDay(last) ? dayText(from) : `${dayText(from)} al ${dayText(last)}`
}

// --- Formatos ---
const km = (m: number) => Math.round((m / 1000) * 10) / 10
const hours = (ms: number) => Math.round((ms / 3600000) * 10) / 10
const dateTime = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export function durationText(ms: number) {
  const mins = Math.round(ms / 60000)
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min`
}
const place = (address?: string | null, lat?: number, lon?: number) => address || (lat != null && lon != null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : '—')

/** Pide los datos a Traccar y arma la tabla del reporte. */
export async function buildReport(kind: ReportKind, devices: Device[], from: Date, to: Date): Promise<ReportTable> {
  const ids = devices.map((d) => d.id)
  const name = (id: number, fallback?: string) => devices.find((d) => d.id === id)?.name ?? fallback ?? `Vehículo ${id}`
  const byName = <T extends { deviceId: number }>(a: T, b: T) => name(a.deviceId).localeCompare(name(b.deviceId))
  const base = { kind, title: kind === 'overspeed' ? 'Excesos de velocidad' : REPORT_KINDS.find((k) => k.id === kind)!.label, period: periodText(from, to) }

  if (kind === 'summary') {
    const [summary, stops, overspeed] = await Promise.all([
      getReport<SummaryRow>('summary', ids, from, to),
      getReport<Stop>('stops', ids, from, to),
      getReport<TraccarEvent>('events', ids, from, to, { type: 'deviceOverspeed' }),
    ])
    const count = (list: { deviceId: number }[], id: number) => list.filter((x) => x.deviceId === id).length
    const rows = devices
      .map((d) => {
        const s = summary.find((x) => x.deviceId === d.id)
        return [d.name, km(s?.distance ?? 0), knotsToKmh(s?.maxSpeed ?? 0), knotsToKmh(s?.averageSpeed ?? 0), hours(s?.engineHours ?? 0), count(stops, d.id), count(overspeed, d.id)] as Cell[]
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    const sum = (i: number) => Math.round(rows.reduce((t, r) => t + Number(r[i]), 0) * 10) / 10
    return {
      ...base,
      columns: [
        { label: 'Vehículo', width: 24 },
        { label: 'Km', number: true, width: 10 },
        { label: 'Vel. máx (km/h)', number: true, width: 15 },
        { label: 'Vel. prom (km/h)', number: true, width: 16 },
        { label: 'Horas de motor', number: true, width: 15 },
        { label: 'Paradas', number: true, width: 10 },
        { label: 'Excesos', number: true, width: 10 },
      ],
      rows,
      total: [`Total (${rows.length} vehículos)`, sum(1), Math.max(0, ...rows.map((r) => Number(r[2]))), '', sum(4), sum(5), sum(6)],
    }
  }

  if (kind === 'trips') {
    const trips = (await getReport<Trip>('trips', ids, from, to)).sort((a, b) => byName(a, b) || a.startTime.localeCompare(b.startTime))
    const rows: Cell[][] = trips.map((t) => [
      name(t.deviceId, t.deviceName),
      dateTime(t.startTime),
      dateTime(t.endTime),
      durationText(t.duration),
      km(t.distance),
      knotsToKmh(t.maxSpeed),
      place(t.startAddress, t.startLat, t.startLon),
      place(t.endAddress, t.endLat, t.endLon),
    ])
    return {
      ...base,
      columns: [
        { label: 'Vehículo', width: 22 },
        { label: 'Salida', width: 18 },
        { label: 'Llegada', width: 18 },
        { label: 'Duración', width: 12 },
        { label: 'Km', number: true, width: 8 },
        { label: 'Vel. máx (km/h)', number: true, width: 15 },
        { label: 'Desde', width: 36 },
        { label: 'Hasta', width: 36 },
      ],
      rows,
      total: [`${rows.length} viajes`, '', '', durationText(trips.reduce((t, x) => t + x.duration, 0)), Math.round(trips.reduce((t, x) => t + x.distance, 0) / 100) / 10, '', '', ''],
    }
  }

  if (kind === 'stops') {
    const stops = (await getReport<Stop>('stops', ids, from, to)).sort((a, b) => byName(a, b) || a.startTime.localeCompare(b.startTime))
    return {
      ...base,
      columns: [
        { label: 'Vehículo', width: 22 },
        { label: 'Llegó', width: 18 },
        { label: 'Salió', width: 18 },
        { label: 'Tiempo detenido', width: 16 },
        { label: 'Lugar', width: 48 },
      ],
      rows: stops.map((s) => [name(s.deviceId, s.deviceName), dateTime(s.startTime), dateTime(s.endTime), durationText(s.duration), place(s.address, s.latitude, s.longitude)]),
      total: [`${stops.length} paradas`, '', '', durationText(stops.reduce((t, x) => t + x.duration, 0)), ''],
    }
  }

  const events = (await getReport<TraccarEvent>('events', ids, from, to, { type: 'deviceOverspeed' })).sort((a, b) => byName(a, b) || a.eventTime.localeCompare(b.eventTime))
  const kmh = (v: unknown) => (typeof v === 'number' ? knotsToKmh(v) : '')
  return {
    ...base,
    columns: [
      { label: 'Vehículo', width: 22 },
      { label: 'Fecha y hora', width: 18 },
      { label: 'Velocidad (km/h)', number: true, width: 16 },
      { label: 'Límite (km/h)', number: true, width: 14 },
    ],
    rows: events.map((e) => [name(e.deviceId), dateTime(e.eventTime), kmh(e.attributes.speed), kmh(e.attributes.speedLimit)]),
    total: [`${events.length} excesos`, '', '', ''],
  }
}

/** Datos de la marca que salen en el encabezado de los archivos. */
export interface ReportBrand {
  name: string
  logo?: string // data URL
}

const fileName = (t: ReportTable, ext: string) => `${t.title} ${t.period}`.replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, '-') + `.${ext}`

export async function downloadExcel(t: ReportTable, brand: ReportBrand) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const head = (label: string) => ({ value: label, fontWeight: 'bold' as const, backgroundColor: '#E8EEF9' })
  const data = [
    [{ value: `${brand.name} · Reporte de ${t.title.toLowerCase()}`, fontWeight: 'bold' as const, fontSize: 14 }],
    [{ value: t.period }],
    [],
    t.columns.map((c) => head(c.label)),
    ...t.rows.map((r) => r.map((v) => ({ value: v }))),
    ...(t.total ? [t.total.map((v) => ({ value: v, fontWeight: 'bold' as const }))] : []),
  ]
  await writeExcelFile(data, { sheet: t.title.slice(0, 31), columns: t.columns.map((c) => ({ width: c.width ?? 14 })) }).toFile(fileName(t, 'xlsx'))
}

export async function downloadPdf(t: ReportTable, brand: ReportBrand) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: t.columns.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' })
  const width = doc.internal.pageSize.getWidth()
  let x = 40
  if (brand.logo) {
    try {
      const props = doc.getImageProperties(brand.logo)
      const h = 36
      const w = Math.min(120, (props.width / props.height) * h)
      doc.addImage(brand.logo, props.fileType, 40, 30, w, h)
      x = 40 + w + 12
    } catch {
      // Si el logo no se puede leer, el PDF sale sin él.
    }
  }
  doc.setFont('helvetica', 'bold').setFontSize(16).text(brand.name, x, 48)
  doc.setFont('helvetica', 'normal').setFontSize(11).text(`Reporte de ${t.title.toLowerCase()} · ${t.period}`, x, 64)
  doc.setFontSize(8).setTextColor(120).text(`Generado el ${new Date().toLocaleString('es-MX')}`, width - 40, 48, { align: 'right' })
  autoTable(doc, {
    startY: 84,
    head: [t.columns.map((c) => c.label)],
    body: t.rows.map((r) => r.map(String)),
    foot: t.total ? [t.total.map(String)] : undefined,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 98, 254] },
    footStyles: { fillColor: [232, 238, 249], textColor: 20 },
    // Los números van a la derecha, también en el encabezado y en el total.
    didParseCell: (data) => {
      if (t.columns[data.column.index]?.number) data.cell.styles.halign = 'right'
    },
    didDrawPage: () => {
      const page = doc.getNumberOfPages()
      doc.setFontSize(8).setTextColor(120).text(`Página ${page}`, width - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' })
    },
  })
  doc.save(fileName(t, 'pdf'))
}
