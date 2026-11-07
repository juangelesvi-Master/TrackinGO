import { cleanLogin } from './account'

export default function AccountFields({
  login,
  email,
  onLogin,
  onEmail,
  loginPlaceholder,
  emailPlaceholder,
}: {
  login: string
  email: string
  onLogin: (v: string) => void
  onEmail: (v: string) => void
  loginPlaceholder: string
  emailPlaceholder: string
}) {
  return (
    <>
      <label>
        Usuario (para iniciar sesión)
        <input value={login} onChange={(e) => onLogin(cleanLogin(e.target.value))} required minLength={3} placeholder={loginPlaceholder} autoComplete="off" />
      </label>
      <label>
        Correo electrónico
        <input type="email" value={email} onChange={(e) => onEmail(e.target.value.trim())} required placeholder={emailPlaceholder} autoComplete="off" />
      </label>
      <p className="muted small">Puede entrar con el usuario o con el correo. Si olvida su contraseña, la recupera con este correo.</p>
    </>
  )
}
