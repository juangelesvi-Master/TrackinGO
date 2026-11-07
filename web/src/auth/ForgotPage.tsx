import { useState, type FormEvent } from 'react'
import { requestPasswordReset, type Server } from '../traccar'
import { AuthLayout, Field, Link } from './AuthLayout'

export default function ForgotPage({ server }: { server: Server | null }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const back = (
    <p className="auth-switch">
      <Link to="/login">Volver a iniciar sesión</Link>
    </p>
  )

  if (server && !server.emailEnabled) {
    return (
      <AuthLayout title="Recuperar contraseña">
        <div className="notice">Este servidor todavía no puede enviar correos. Pide al administrador que restablezca tu contraseña.</div>
        {back}
      </AuthLayout>
    )
  }

  if (sent) {
    return (
      <AuthLayout title="Revisa tu correo">
        <div className="notice success">
          Si existe una cuenta con <strong>{email}</strong>, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.
        </div>
        {back}
      </AuthLayout>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await requestPasswordReset(email.trim())
      setSent(true)
    } catch {
      setError('No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Recuperar contraseña" subtitle="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.">
      <form className="auth-form" onSubmit={submit}>
        <Field label="Correo electrónico" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>
      <p className="muted small">Si tu cuenta no tiene correo registrado, pide a soporte técnico que restablezca tu contraseña.</p>
      {back}
    </AuthLayout>
  )
}
