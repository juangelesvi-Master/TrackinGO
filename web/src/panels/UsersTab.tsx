import { useEffect, useState, type FormEvent } from 'react'
import { MIN_PASSWORD } from '../auth/password'
import { generatePassword, isCompany, PERM_LABEL, permsOf, ROLES, roleOf, traccarFlags, type Perms, type RoleId } from '../permissions'
import { addLinks, createUser, deleteUser, getNotifications, getUserDevices, getUsers, removeLinks, updateUser, type Device, type User } from '../traccar'
import { Modal } from './Modal'
import { userErrorText as errorText } from './userErrors'
import AccountFields from './AccountFields'
import { checkAccount, initialEmail, initialLogin } from './account'
import { shareRules } from '../staff'


/** Lista de vehículos con casillas, con "marcar todos". */
export function DevicePicker({ devices, chosen, onChange }: { devices: Device[]; chosen: Set<number>; onChange: (s: Set<number>) => void }) {
  return (
    <>
      <div className="row picker-row">
        <span className="muted small">
          {chosen.size} de {devices.length} vehículos
        </span>
        <button type="button" className="link" onClick={() => onChange(new Set(devices.map((d) => d.id)))}>
          Marcar todos
        </button>
        <button type="button" className="link" onClick={() => onChange(new Set())}>
          Quitar todos
        </button>
      </div>
      <div className="check-list">
        {devices.map((d) => (
          <label key={d.id} className="check">
            <input
              type="checkbox"
              checked={chosen.has(d.id)}
              onChange={(e) => {
                const next = new Set(chosen)
                if (e.target.checked) next.add(d.id)
                else next.delete(d.id)
                onChange(next)
              }}
            />
            {d.name}
          </label>
        ))}
      </div>
    </>
  )
}

/** Datos de acceso para copiar y mandar por WhatsApp o correo. */
export function Credentials({ name, login, email, password, onClose }: { name: string; login: string; email?: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = `Hola ${name}, estos son tus datos para entrar a Traking GO:\nPortal: ${location.origin}\nUsuario: ${login}${email ? `\nCorreo: ${email}` : ''}\nContraseña: ${password}${email ? '\nPuedes entrar con el usuario o con el correo. Si olvidas tu contraseña, recupérala con tu correo.' : ''}`
  return (
    <Modal title="Datos de acceso" onClose={onClose}>
      <p>Comparte estos datos con {name}. Por seguridad, la contraseña no se vuelve a mostrar.</p>
      <pre className="credentials">{text}</pre>
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cerrar
        </button>
        <button
          onClick={() =>
            navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copiado ✓' : 'Copiar datos'}
        </button>
      </div>
    </Modal>
  )
}

function UserForm({ me, user, devices, onDone, onCancel }: { me: User; user: User | null; devices: Device[]; onDone: (creds?: { name: string; login: string; email?: string; password: string }) => void; onCancel: () => void }) {
  const initialPerms = user ? permsOf(user) : ROLES[2].perms!
  const [name, setName] = useState(user?.name ?? '')
  const [login, setLogin] = useState(initialLogin(user))
  const [email, setEmail] = useState(initialEmail(user))
  const [password, setPassword] = useState(user ? '' : generatePassword())
  const [role, setRole] = useState<RoleId>(roleOf(initialPerms))
  const [perms, setPerms] = useState<Perms>(initialPerms)
  const [active, setActive] = useState(!user?.disabled)
  const [expires, setExpires] = useState(user?.expirationTime ? user.expirationTime.slice(0, 10) : '')
  const [initialDevices, setInitialDevices] = useState<Set<number> | null>(user ? null : new Set())
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    getUserDevices(user.id)
      .then((list) => {
        const ids = new Set(list.map((d) => d.id))
        setInitialDevices(ids)
        setChosen(new Set(ids))
      })
      .catch(() => setError('No se pudieron cargar los vehículos de este usuario.'))
  }, [user])

  const pickRole = (id: RoleId) => {
    setRole(id)
    const preset = ROLES.find((r) => r.id === id)?.perms
    if (preset) setPerms(preset)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password && password.length < MIN_PASSWORD) return setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`)
    if (!initialDevices) return
    setBusy(true)
    setError('')
    const problem = await checkAccount(login, email, user?.id)
    if (problem) {
      setBusy(false)
      return setError(problem)
    }
    const finalPerms = role === 'custom' ? { ...perms, users: false } : perms
    const data: Partial<User> = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      login: login.trim(),
      disabled: !active,
      expirationTime: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      // Los usuarios de una empresa llevan su logo y nombre.
      attributes: { ...(user?.attributes ?? {}), teesa: finalPerms, ...(me.attributes?.teesaBrand ? { teesaBrand: me.attributes.teesaBrand } : {}) },
      ...traccarFlags(finalPerms),
      ...(password ? { password } : {}),
    }
    try {
      const saved = user ? await updateUser({ ...user, ...data } as User) : await createUser(data)
      // Un usuario nuevo recibe las mismas reglas de aviso que ya tiene quien lo crea.
      if (!user) {
        const rules = await getNotifications().catch(() => [])
        await shareRules(
          [saved.id],
          rules.filter((n) => n.always).map((n) => n.id),
        ).catch(() => {})
      }
      if (!finalPerms.users) {
        await addLinks([...chosen].filter((id) => !initialDevices.has(id)).map((deviceId) => ({ userId: saved.id, deviceId })))
        await removeLinks([...initialDevices].filter((id) => !chosen.has(id)).map((deviceId) => ({ userId: saved.id, deviceId })))
      }
      onDone(password ? { name: name.trim(), login: login.trim(), email: email.trim().toLowerCase(), password } : undefined)
    } catch (err) {
      setError(errorText(err, 'No se pudo guardar el usuario.'))
      setBusy(false)
    }
  }

  const roleInfo = ROLES.find((r) => r.id === role)!

  return (
    <Modal title={user ? `Editar a ${user.name}` : 'Nuevo usuario'} onClose={onCancel}>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <AccountFields login={login} email={email} onLogin={setLogin} onEmail={setEmail} loginPlaceholder="Ej. jperez" emailPlaceholder="Ej. jperez@empresa.com" />
        <label>
          {user ? 'Nueva contraseña (déjala vacía para no cambiarla)' : 'Contraseña'}
          <span className="password">
            <input value={password} onChange={(e) => setPassword(e.target.value)} required={!user} autoComplete="new-password" />
            <button type="button" className="link" onClick={() => setPassword(generatePassword())}>
              Generar
            </button>
          </span>
        </label>

        <label>
          Rol
          <select value={role} onChange={(e) => pickRole(e.target.value as RoleId)}>
            {ROLES.filter((r) => r.id !== 'admin').map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small role-hint">{roleInfo.description}</p>
        <div className="perm-list">
          {(Object.keys(PERM_LABEL) as (keyof Perms)[])
            .filter((k) => k !== 'users' || role === 'admin')
            .map((k) => (
              <label key={k} className="check">
                <input type="checkbox" checked={perms[k]} disabled={role !== 'custom'} onChange={(e) => setPerms({ ...perms, [k]: e.target.checked })} />
                {PERM_LABEL[k]}
              </label>
            ))}
          <label className="check">
            <input type="checkbox" checked disabled />
            Ver el mapa en vivo y las alertas
          </label>
        </div>

        {role !== 'admin' && (
          <>
            <span className="field-title">Vehículos que puede ver</span>
            {initialDevices ? <DevicePicker devices={devices} chosen={chosen} onChange={setChosen} /> : <p className="muted">Cargando…</p>}
          </>
        )}

        <div className="row two">
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Acceso activo
          </label>
          <label>
            Acceso hasta (opcional)
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
        </div>

        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" disabled={busy || !initialDevices}>
            {busy ? 'Guardando…' : user ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function UsersTab({ me, devices }: { me: User; devices: Device[] }) {
  const [users, setUsers] = useState<User[]>([])
  // Solo para el Maestro: a qué empresa pertenece cada usuario.
  const [companyOf, setCompanyOf] = useState<Map<number, string> | null>(null)
  const [editing, setEditing] = useState<User | null | 'new'>(null)
  const [creds, setCreds] = useState<{ name: string; login: string; email?: string; password: string } | null>(null)
  const [error, setError] = useState('')
  const [today] = useState(() => new Date().toISOString())

  const reload = () =>
    getUsers()
      // Las empresas y el Maestro se manejan en el panel Maestro.
      .then(async (list) => {
        setUsers(list.filter((u) => !u.administrator && !isCompany(u)))
        if (!me.administrator) return
        const companies = list.filter(isCompany)
        const members = await Promise.all(companies.map((c) => getUsers(c.id)))
        setCompanyOf(new Map(companies.flatMap((c, i) => members[i].map((u) => [u.id, c.name] as [number, string]))))
      })
      .catch(() => setError('No se pudieron cargar los usuarios.'))
  useEffect(() => {
    reload()
    // Solo al abrir la pestaña; `me` no cambia mientras está abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remove = async (u: User) => {
    if (!confirm(`¿Borrar al usuario "${u.name}"? Ya no podrá entrar al portal.`)) return
    await deleteUser(u.id).catch((err) => setError(errorText(err, 'No se pudo borrar.')))
    reload()
  }

  return (
    <>
      <div className="admin-toolbar">
        <span className="muted">{users.length} usuarios</span>
        <button onClick={() => setEditing('new')}>+ Nuevo usuario</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Correo</th>
              {companyOf && <th>Empresa</th>}
              <th>Rol</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const role = ROLES.find((r) => r.id === roleOf(permsOf(u)))!
              const expired = u.expirationTime && u.expirationTime < today
              return (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="mono">{initialLogin(u) || '—'}</td>
                  <td className="mono">{initialEmail(u) || <span className="muted">Sin correo</span>}</td>
                  {companyOf && <td>{companyOf.get(u.id) ?? <span className="muted">Tuyo</span>}</td>}
                  <td>
                    <span className="badge muted-badge">{role.name}</span>
                  </td>
                  <td>
                    {u.disabled ? (
                      <span className="status status-unknown">Desactivado</span>
                    ) : expired ? (
                      <span className="status status-overdue">Vencido</span>
                    ) : (
                      <span className="status status-ok">Activo</span>
                    )}
                  </td>
                  <td className="actions">
                    <button className="link" onClick={() => setEditing(u)}>
                      Editar
                    </button>
                    {u.id !== me.id && (
                      <button className="link danger-text" onClick={() => remove(u)}>
                        Borrar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <UserForm
          me={me}
          user={editing === 'new' ? null : editing}
          devices={devices}
          onDone={(c) => {
            setEditing(null)
            if (c) setCreds(c)
            reload()
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {creds && <Credentials {...creds} onClose={() => setCreds(null)} />}
    </>
  )
}
