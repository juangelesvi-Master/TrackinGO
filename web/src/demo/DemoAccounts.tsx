import { DEMO_ACCOUNTS, resetDemo } from './fakeServer'

/** Cuentas de prueba que se muestran en el inicio de sesión de la versión demo. */
export default function DemoAccounts({ onPick }: { onPick: (login: string, password: string) => void }) {
  return (
    <div className="demo-box">
      <strong>Versión demo con datos de prueba.</strong> Toca una cuenta para entrar:
      <div className="demo-accounts">
        {DEMO_ACCOUNTS.map((a) => (
          <button key={a.login} type="button" className="secondary" onClick={() => onPick(a.login, a.password)}>
            {a.role}
            <span className="muted small">
              {a.login} / {a.password}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="link small" onClick={resetDemo}>
        Borrar mis cambios y empezar de nuevo
      </button>
    </div>
  )
}
