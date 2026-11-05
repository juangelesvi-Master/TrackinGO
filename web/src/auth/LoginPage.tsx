import { lazy, Suspense, useState, type FormEvent } from 'react'
import { AuthError, login, type User } from '../traccar'
import { AuthLayout, Field, Link, PasswordField } from './AuthLayout'

const DemoAccounts = import.meta.env.VITE_DEMO === '1' ? lazy(() => import('../demo/DemoAccounts')) : null

export default function LoginPage({ onLogin, notice }: { onLogin: (user: User) => void; notice?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const enter = async (user: string, pass: string) => {
    setBusy(true)
    setError('')
    try {
      onLogin(await login(user.trim(), pass))
    } catch (err) {
      setError(err instanceof AuthError ? 'Usuario o contraseña incorrectos.' : 'No se pudo conectar con el servidor. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    enter(email, password)
  }

  return (
    <AuthLayout title="Inicia sesión" subtitle="Entra para ver tu flota.">
      <form className="auth-form" onSubmit={submit}>
        {notice && <div className="notice">{notice}</div>}
        {DemoAccounts && (
          <Suspense>
            <DemoAccounts onPick={enter} />
          </Suspense>
        )}
        <Field label="Usuario o correo" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        <PasswordField label="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        <div className="auth-row-end">
          <Link to="/recuperar">¿Olvidaste tu contraseña?</Link>
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="auth-switch muted small">¿No tienes cuenta? Pídela al administrador de tu empresa.</p>
    </AuthLayout>
  )
}
