import { useState, type MouseEvent, type ReactNode, type InputHTMLAttributes } from 'react'
import { navigate } from '../router'

const YEAR = new Date().getFullYear()

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="brand brand-light">
          <span className="brand-dot" />
          TracKING GO
        </div>
        <div className="auth-hero-text">
          <h2>Tu flota, en tiempo real.</h2>
          <p>Ubicación en vivo, historial de rutas, geocercas y alertas de todos tus vehículos en un solo lugar.</p>
        </div>
        <span className="auth-hero-foot">© {YEAR} TracKING GO</span>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <div className="brand auth-brand-mobile">
            <span className="brand-dot" />
            TracKING GO
          </div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
        </div>
      </section>
    </div>
  )
}

/** Enlace interno que cambia de pantalla sin recargar la página. */
export function Link({ to, children }: { to: string; children: ReactNode }) {
  const go = (e: MouseEvent) => {
    e.preventDefault()
    navigate(to)
  }
  return (
    <a href={to} onClick={go}>
      {children}
    </a>
  )
}

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  )
}

/** Campo de contraseña con botón para mostrarla u ocultarla. */
export function PasswordField({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false)
  return (
    <label>
      {label}
      <span className="password">
        <input {...props} type={visible ? 'text' : 'password'} />
        <button type="button" className="link" onClick={() => setVisible(!visible)}>
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </span>
    </label>
  )
}
