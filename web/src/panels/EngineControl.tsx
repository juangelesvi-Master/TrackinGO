import { useEffect, useState } from 'react'
import { getCommandTypes, knotsToKmh, sendCommand, type Device, type Position } from '../traccar'

type Action = 'engineStop' | 'engineResume'

const TEXT: Record<Action, { button: string; title: string; confirm: string; sent: string; queued: string }> = {
  engineStop: {
    button: 'Apagar motor',
    title: '¿Apagar el motor?',
    confirm: 'Sí, apagar motor',
    sent: 'Orden de apagado enviada al rastreador.',
    queued: 'El rastreador no está conectado. La orden de apagado se enviará en cuanto se conecte.',
  },
  engineResume: {
    button: 'Reactivar motor',
    title: '¿Reactivar el motor?',
    confirm: 'Sí, reactivar',
    sent: 'Orden de reactivación enviada al rastreador.',
    queued: 'El rastreador no está conectado. La orden de reactivación se enviará en cuanto se conecte.',
  },
}

/** Botones de corte y reactivación de motor, con confirmación. */
export default function EngineControl({ device, position }: { device: Device; position?: Position }) {
  const [types, setTypes] = useState<string[] | null>(null)
  const [confirming, setConfirming] = useState<Action | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    getCommandTypes(device.id)
      .then((t) => alive && setTypes(t))
      .catch(() => alive && setTypes([]))
    return () => {
      alive = false
    }
  }, [device.id])

  if (types == null) return null
  const supported = types.includes('engineStop') || types.includes('engineResume')
  if (!supported) return <p className="muted small">Este rastreador no admite corte de motor desde la app.</p>

  const speed = position ? knotsToKmh(position.speed) : 0
  const moving = speed > 5

  const send = async (action: Action) => {
    setBusy(true)
    try {
      const status = await sendCommand(device.id, action)
      setResult({ ok: true, text: status === 'queued' ? TEXT[action].queued : TEXT[action].sent })
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : ''
      setResult({
        ok: false,
        text: msg.includes('readonly') || msg.includes('limit') || msg.includes('security') ? 'Tu usuario no tiene permiso para enviar órdenes.' : 'No se pudo enviar la orden. Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
      setConfirming(null)
      setTyped('')
    }
  }

  return (
    <div className="engine">
      <div className="engine-buttons">
        {types.includes('engineStop') && (
          <button className="danger" onClick={() => setConfirming('engineStop')}>
            {TEXT.engineStop.button}
          </button>
        )}
        {types.includes('engineResume') && (
          <button className="secondary" onClick={() => setConfirming('engineResume')}>
            {TEXT.engineResume.button}
          </button>
        )}
      </div>
      {result && <div className={result.ok ? 'notice success' : 'error'}>{result.text}</div>}

      {confirming && (
        <div className="modal-backdrop" onClick={() => !busy && setConfirming(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{TEXT[confirming].title}</h3>
            <p>
              Vehículo: <strong>{device.name}</strong>
            </p>
            {confirming === 'engineStop' && (
              <>
                <div className={moving ? 'error' : 'notice'}>
                  {moving
                    ? `Atención: el vehículo va a ${speed} km/h. Apagar el motor en movimiento puede causar un accidente.`
                    : 'Solo apaga el motor cuando sea seguro hacerlo. El vehículo no podrá arrancar hasta que lo reactives.'}
                </div>
                <label>
                  Para confirmar, escribe el nombre del vehículo
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={device.name} autoFocus />
                </label>
              </>
            )}
            <div className="modal-actions">
              <button className="secondary" onClick={() => setConfirming(null)} disabled={busy}>
                Cancelar
              </button>
              <button
                className={confirming === 'engineStop' ? 'danger' : ''}
                disabled={busy || (confirming === 'engineStop' && typed.trim().toLowerCase() !== device.name.trim().toLowerCase())}
                onClick={() => send(confirming)}
              >
                {busy ? 'Enviando…' : TEXT[confirming].confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
