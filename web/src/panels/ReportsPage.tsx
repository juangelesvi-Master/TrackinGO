import { useState } from 'react'
import type { Brand } from '../brand'
import { buildReport, downloadExcel, downloadPdf, isoDay, PERIODS, periodRange, REPORT_KINDS, type PeriodId, type ReportKind, type ReportTable } from '../reports'
import type { Device } from '../traccar'
import { Modal } from './Modal'
import { DevicePicker } from './UsersTab'
import PageTitle from './PageTitle'

const PREVIEW_ROWS = 300

export default function ReportsPage({ devices, brand, onBack }: { devices: Device[]; brand: Brand; onBack: () => void }) {
  const [kind, setKind] = useState<ReportKind>('summary')
  const [period, setPeriod] = useState<PeriodId>('yesterday')
  const [today] = useState(() => isoDay(new Date()))
  const [custom, setCustom] = useState({ from: today, to: today })
  // null = todos los vehículos
  const [chosen, setChosen] = useState<Set<number> | null>(null)
  const [picking, setPicking] = useState<Set<number> | null>(null)
  const [table, setTable] = useState<ReportTable | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')

  const selected = chosen ? devices.filter((d) => chosen.has(d.id)) : devices

  const generate = async () => {
    if (!selected.length) return setError('Elige al menos un vehículo.')
    if (period === 'custom' && custom.from > custom.to) return setError('La fecha inicial va antes que la final.')
    setBusy(true)
    setError('')
    try {
      const { from, to } = periodRange(period, new Date(), custom)
      setTable(await buildReport(kind, selected, from, to))
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : ''
      setError(msg.includes('security') || msg.includes('disabled') ? 'Tu usuario no tiene permiso para ver reportes.' : 'No se pudo generar el reporte. Prueba con menos días o menos vehículos.')
    } finally {
      setBusy(false)
    }
  }

  const download = async (type: 'excel' | 'pdf') => {
    if (!table) return
    setSaving(type)
    try {
      await (type === 'excel' ? downloadExcel(table, brand) : downloadPdf(table, brand))
    } catch {
      setError('No se pudo crear el archivo.')
    } finally {
      setSaving('')
    }
  }

  const change = (fn: () => void) => {
    fn()
    setTable(null)
  }

  return (
    <div className="admin reports">
      <PageTitle title="Reportes" onBack={onBack} />
      <div className="segmented inline wide">
        {REPORT_KINDS.map((k) => (
          <button key={k.id} className={kind === k.id ? 'active' : ''} onClick={() => change(() => setKind(k.id))}>
            {k.label}
          </button>
        ))}
      </div>
      <p className="muted">{REPORT_KINDS.find((k) => k.id === kind)!.description}</p>

      <div className="report-filters">
        <label>
          Periodo
          <select value={period} onChange={(e) => change(() => setPeriod(e.target.value as PeriodId))}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {period === 'custom' && (
          <>
            <label>
              Desde
              <input type="date" value={custom.from} max={today} onChange={(e) => change(() => setCustom({ ...custom, from: e.target.value }))} />
            </label>
            <label>
              Hasta
              <input type="date" value={custom.to} max={today} onChange={(e) => change(() => setCustom({ ...custom, to: e.target.value }))} />
            </label>
          </>
        )}
        <label>
          Vehículos
          <button type="button" className="secondary picker-button" onClick={() => setPicking(new Set(chosen ?? devices.map((d) => d.id)))}>
            {chosen ? `${selected.length} de ${devices.length}` : `Todos (${devices.length})`}
          </button>
        </label>
        <button onClick={generate} disabled={busy}>
          {busy ? 'Generando…' : 'Generar reporte'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      {table && (
        <>
          <div className="admin-toolbar">
            <span className="muted">
              {table.period} · {table.rows.length} {table.rows.length === 1 ? 'fila' : 'filas'}
            </span>
            <div className="row">
              <button className="secondary" onClick={() => download('excel')} disabled={!!saving}>
                {saving === 'excel' ? 'Creando…' : 'Descargar Excel'}
              </button>
              <button className="secondary" onClick={() => download('pdf')} disabled={!!saving}>
                {saving === 'pdf' ? 'Creando…' : 'Descargar PDF'}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c.label} className={c.number ? 'num' : ''}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.length === 0 && (
                  <tr>
                    <td colSpan={table.columns.length} className="muted">
                      No hay datos en este periodo.
                    </td>
                  </tr>
                )}
                {table.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j} className={table.columns[j].number ? 'num' : ''}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {table.total && table.rows.length > 0 && (
                <tfoot>
                  <tr>
                    {table.total.map((v, j) => (
                      <td key={j} className={table.columns[j].number ? 'num' : ''}>
                        {v}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {table.rows.length > PREVIEW_ROWS && <p className="muted small">Aquí se muestran las primeras {PREVIEW_ROWS} filas. El Excel y el PDF traen todas.</p>}
        </>
      )}

      {picking && (
        <Modal title="Vehículos del reporte" onClose={() => setPicking(null)}>
          <DevicePicker devices={devices} chosen={picking} onChange={setPicking} />
          <div className="modal-actions">
            <button className="secondary" onClick={() => setPicking(null)}>
              Cancelar
            </button>
            <button
              onClick={() => {
                change(() => setChosen(picking.size === devices.length ? null : picking))
                setPicking(null)
              }}
            >
              Listo
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
