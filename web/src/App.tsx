import { useEffect, useState } from 'react'
import Fleet from './Fleet'
import ForgotPage from './auth/ForgotPage'
import LoginPage from './auth/LoginPage'
import ResetPage from './auth/ResetPage'
import { navigate, useLocation } from './router'
import { getServer, getSession, logout, SUPPORT_KEY, type Server, type User } from './traccar'

export default function App() {
  const { path, params } = useLocation()
  const [user, setUser] = useState<User | null>(null)
  const [server, setServer] = useState<Server | null>(null)
  const [checking, setChecking] = useState(true)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    getServer().then(setServer).catch(() => {})
    getSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false))
  }, [])

  // Con sesión iniciada, las pantallas de cuenta llevan al mapa; sin sesión, el mapa lleva al login.
  const authPaths = ['/login', '/recuperar', '/reset-password']
  useEffect(() => {
    if (checking) return
    if (user && authPaths.includes(path)) navigate('/', true)
    if (!user && !authPaths.includes(path)) navigate('/login', true)
  })

  const onLogin = (u: User) => {
    setNotice('')
    setUser(u)
    navigate('/', true)
  }

  if (checking) return <div className="splash">Cargando…</div>

  if (!user) {
    switch (path) {
      case '/recuperar':
        return <ForgotPage server={server} />
      case '/reset-password':
        return <ResetPage token={params.get('passwordReset')} onDone={() => setNotice('Listo, tu contraseña se cambió. Ya puedes iniciar sesión.')} />
      default:
        return <LoginPage onLogin={onLogin} notice={notice} />
    }
  }

  return (
    <Fleet
      user={user}
      onUser={setUser}
      onLogout={async () => {
        await logout().catch(() => {})
        try {
          sessionStorage.removeItem(SUPPORT_KEY)
        } catch {
          // nada que limpiar
        }
        setUser(null)
        navigate('/login', true)
      }}
    />
  )
}
