import { useState, type FormEvent } from 'react'
import { navigate } from '../router'
import { resetPassword } from '../traccar'
import { AuthLayout, Link, PasswordField } from './AuthLayout'
import { MIN_PASSWORD, passwordProblem } from './password'

// Pantalla a la que lleva el enlace del correo de recuperación (/reset-password?passwordReset=CODIGO).
export default function ResetPage({ token, onDone }: { token: string | null; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!token) {
    return (
      <AuthLayout title="Enlace no válido">
        <div className="notice">Este enlace está incompleto. Pide uno nuevo desde la pantalla de recuperar contraseña.</div>
        <p className="auth-switch">
          <Link to="/recuperar">Pedir otro enlace</Link>
        </p>
      </AuthLayout>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = passwordProblem(password, confirm)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      await resetPassword(token, password)
      onDone()
      navigate('/login', true)
    } catch {
      setError('El enlace ya venció o no es válido. Pide uno nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Crea una contraseña nueva">
      <form className="auth-form" onSubmit={submit}>
        <PasswordField
          label={`Contraseña nueva (mínimo ${MIN_PASSWORD} caracteres)`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          autoFocus
        />
        <PasswordField label="Repite la contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/recuperar">Pedir otro enlace</Link>
      </p>
    </AuthLayout>
  )
}
