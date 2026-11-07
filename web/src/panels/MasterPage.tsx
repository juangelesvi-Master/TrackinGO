import { useEffect, useState, type FormEvent } from 'react'
import { MIN_PASSWORD } from '../auth/password'
import { shrinkLogo, type Brand } from '../brand'
import { generatePassword, isCompany, ROLES, traccarFlags } from '../permissions'
import {
  addLinks,
  createUser,
  deleteDevice,
  deleteUser,
  getUserDevices,
  getUsers,
  loginAs,
  removeLinks,
  SUPPORT_KEY,
  timeAgo,
  updateDevice,
  updateUser,
  type Device,
  type User,
} from '../traccar'
import { DeviceForm } from './AdminPage'
import { Modal } from './Modal'
import { Credentials, DevicePicker } from './UsersTab'
import { userErrorText } from './userErrors'
import AccountFields from './AccountFields'
import { checkAccount, initialEmail, initialLogin } from './account'
import PageTitle from './PageTitle'

type Creds = { name: string; login: string; email?: string; password: string }

/** Lo que tiene cada empresa: sus vehículos y sus usuarios. */
interface CompanyInfo {
  devices: Set<number>
  /** Sus vehículos completos, también los que la empresa dio de alta ella misma. */
  list: Device[]
  users: User[]
}

const limitText = (n?: number) => (n && n > 0 ? String(n) : '')
const limitValue = (s: string) => (Number(s) > 0 ? Math.floor(Number(s)) : -1)

function CompanyForm({
  company,
  info,
  devices,
  owners,
  onDone,
  onCancel,
}: {
  company: User | null
  info?: CompanyInfo
  devices: Device[]
  owners: Map<number, string>
  onDone: (creds?: Creds) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(company?.name ?? '')
  const [login, setLogin] = useState(initialLogin(company))
  const [email, setEmail] = useState(initialEmail(company))
  const [password, setPassword] = useState(company ? '' : generatePassword())
  const [deviceLimit, setDeviceLimit] = useState(limitText(company?.deviceLimit))
  const [userLimit, setUserLimit] = useState(limitText(company?.userLimit))
  const [chosen, setChosen] = useState<Set<number>>(new Set(info?.devices ?? []))
  const savedBrand = company?.attributes?.teesaBrand as Partial<Brand> | undefined
  const [logo, setLogo] = useState(savedBrand?.logo ?? '')
  const [active, setActive] = useState(!company?.disabled)
  const [expires, setExpires] = useState(company?.expirationTime ? company.expirationTime.slice(0, 10) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Se juntan los vehículos de Maestro con los que la empresa dio de alta ella misma.
  // En la lista se indica si un vehículo ya es de otra empresa.
  const all = [...devices, ...(info?.list ?? []).filter((d) => !devices.some((m) => m.id === d.id))]
  const pickable = all.map((d) => {
    const owner = owners.get(d.id)
    return owner && owner !== company?.name ? { ...d, name: `${d.name} · ${owner}` } : d
  })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password && password.length < MIN_PASSWORD) return setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`)
    setBusy(true)
    setError('')
    const problem = await checkAccount(login, email, company?.id)
    if (problem) {
      setBusy(false)
      return setError(problem)
    }
    const full = ROLES[0].perms!
    const data: Partial<User> = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      login: login.trim(),
      disabled: !active,
      expirationTime: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      attributes: { ...(company?.attributes ?? {}), teesa: full, teesaBrand: { name: name.trim(), ...(logo ? { logo } : {}) } },
      ...traccarFlags(full),
      // Administrador de su empresa, no del servidor: ve solo lo suyo.
      administrator: false,
      userLimit: limitValue(userLimit),
      deviceLimit: limitValue(deviceLimit),
      ...(password ? { password } : {}),
    }
    try {
      const saved = company ? await updateUser({ ...company, ...data } as User) : await createUser(data)
      const before = info?.devices ?? new Set<number>()
      await addLinks([...chosen].filter((id) => !before.has(id)).map((deviceId) => ({ userId: saved.id, deviceId })))
      await removeLinks([...before].filter((id) => !chosen.has(id)).map((deviceId) => ({ userId: saved.id, deviceId })))
      // Sus usuarios ven el mismo logo y nombre.
      const brand = (data.attributes as { teesaBrand: Brand }).teesaBrand
      for (const u of info?.users ?? []) await updateUser({ ...u, attributes: { ...(u.attributes ?? {}), teesaBrand: brand } })
      onDone(password ? { name: name.trim(), login: login.trim(), email: email.trim().toLowerCase(), password } : undefined)
    } catch (err) {
      setError(userErrorText(err, 'No se pudo guardar la empresa.'))
      setBusy(false)
    }
  }

  return (
    <Modal title={company ? `Editar ${company.name}` : 'Nueva empresa'} onClose={onCancel}>
      <form className="auth-form" onSubmit={submit}>
        <p className="muted small">
          La empresa entra con su propio usuario y es administradora de lo suyo: sus vehículos, choferes, mantenimiento, geocercas, alertas y sus propios
          usuarios. No ve nada de otras empresas.
        </p>
        <label>
          Nombre de la empresa
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <div className="logo-field">
          <span className="field-title">Logo (se ve en su portal y en sus reportes)</span>
          <div className="row">
            {logo ? <img className="logo-preview" src={logo} alt="Logo" /> : <span className="muted small">Sin logo</span>}
            <label className="secondary file-button">
              {logo ? 'Cambiar' : 'Subir logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) shrinkLogo(f).then(setLogo, () => setError('No se pudo leer esa imagen.'))
                  e.target.value = ''
                }}
              />
            </label>
            {logo && (
              <button type="button" className="link danger-text" onClick={() => setLogo('')}>
                Quitar
              </button>
            )}
          </div>
        </div>
        <AccountFields login={login} email={email} onLogin={setLogin} onEmail={setEmail} loginPlaceholder="Ej. transportesruiz" emailPlaceholder="Ej. admin@empresa.com" />
        <label>
          {company ? 'Nueva contraseña (déjala vacía para no cambiarla)' : 'Contraseña'}
          <span className="password">
            <input value={password} onChange={(e) => setPassword(e.target.value)} required={!company} autoComplete="new-password" />
            <button type="button" className="link" onClick={() => setPassword(generatePassword())}>
              Generar
            </button>
          </span>
        </label>
        <div className="grid-two">
          <label>
            Máximo de vehículos
            <input type="number" min={1} value={deviceLimit} onChange={(e) => setDeviceLimit(e.target.value)} placeholder="Sin límite" />
          </label>
          <label>
            Máximo de usuarios
            <input type="number" min={1} value={userLimit} onChange={(e) => setUserLimit(e.target.value)} placeholder="Sin límite" />
          </label>
        </div>

        <span className="field-title">Vehículos que le asignas (la empresa también puede dar de alta los suyos)</span>
        <DevicePicker devices={pickable} chosen={chosen} onChange={setChosen} />

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
          <button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : company ? 'Guardar cambios' : 'Crear empresa'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Los vehículos de una empresa: Maestro los puede editar, desactivar o borrar. */
function CompanyDevices({ company, devices, onChanged, onClose }: { company: User; devices: Device[]; onChanged: () => void; onClose: () => void }) {
  const [editing, setEditing] = useState<Device | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const list = [...devices].sort((a, b) => a.name.localeCompare(b.name))

  const run = async (d: Device, action: () => Promise<unknown>, fallback: string) => {
    setBusy(d.id)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(userErrorText(err, fallback))
    }
    setBusy(null)
    onChanged()
  }

  const toggle = (d: Device) => {
    const off = !d.disabled
    if (off && !confirm(`¿Desactivar "${d.name}"? Dejará de recibir ubicaciones hasta que lo vuelvas a activar. No se borra su historial.`)) return
    run(d, () => updateDevice({ ...d, disabled: off }), 'No se pudo cambiar el vehículo.')
  }

  const remove = (d: Device) => {
    if (!confirm(`¿Borrar "${d.name}"? Se borra para todos, con todo su historial. Si solo quieres pausarlo, mejor desactívalo.`)) return
    run(d, () => deleteDevice(d.id), 'No se pudo borrar.')
  }

  return (
    <>
      <Modal title={`Vehículos de ${company.name}`} onClose={onClose} wide>
        {error && <div className="error">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>IMEI</th>
                <th>Último reporte</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    Esta empresa aún no tiene vehículos.
                  </td>
                </tr>
              )}
              {list.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className={`dot ${d.status}`} /> {d.name}
                    {d.disabled && <span className="status status-unknown"> Desactivado</span>}
                  </td>
                  <td className="mono">{d.uniqueId}</td>
                  <td>{timeAgo(d.lastUpdate)}</td>
                  <td className="actions">
                    <button className="link" disabled={busy === d.id} onClick={() => setEditing(d)}>
                      Editar
                    </button>
                    <button className="link" disabled={busy === d.id} onClick={() => toggle(d)}>
                      {d.disabled ? 'Activar' : 'Desactivar'}
                    </button>
                    <button className="link danger-text" disabled={busy === d.id} onClick={() => remove(d)}>
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </Modal>
      {editing && (
        <DeviceForm
          device={editing}
          odometerKm={null}
          onDone={() => {
            setEditing(null)
            onChanged()
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  )
}

/** Panel Maestro: solo la cuenta Maestro (administrador del servidor) lo ve. Aquí se manejan las empresas. */
export default function MasterPage({ me, devices, onChanged, onBack }: { me: User; devices: Device[]; onChanged: () => void; onBack: () => void }) {
  const [companies, setCompanies] = useState<User[]>([])
  const [info, setInfo] = useState<Record<number, CompanyInfo>>({})
  const [editing, setEditing] = useState<User | null | 'new'>(null)
  const [viewing, setViewing] = useState<User | null>(null)
  const [creds, setCreds] = useState<Creds | null>(null)
  const [error, setError] = useState('')
  const [today] = useState(() => new Date().toISOString())

  const reload = () =>
    getUsers()
      .then(async (all) => {
        const list = all.filter(isCompany).sort((a, b) => a.name.localeCompare(b.name))
        const details = await Promise.all(list.map((c) => Promise.all([getUserDevices(c.id), getUsers(c.id)])))
        setCompanies(list)
        setInfo(Object.fromEntries(list.map((c, i) => [c.id, { devices: new Set(details[i][0].map((d) => d.id)), list: details[i][0], users: details[i][1] }])))
      })
      .catch(() => setError('No se pudieron cargar las empresas.'))
  useEffect(() => {
    reload()
  }, [])

  const owners = new Map<number, string>()
  companies.forEach((c) => info[c.id]?.devices.forEach((id) => owners.set(id, c.name)))

  const remove = async (c: User) => {
    const users = info[c.id]?.users ?? []
    const extra = users.length ? ` y sus ${users.length} usuarios` : ''
    if (!confirm(`¿Borrar la empresa "${c.name}"${extra}? Ya no podrán entrar al portal. Sus vehículos se quedan en tu cuenta Maestro.`)) return
    setError('')
    try {
      for (const u of users) await deleteUser(u.id)
      await deleteUser(c.id)
    } catch (err) {
      setError(userErrorText(err, 'No se pudo borrar.'))
    }
    reload()
    onChanged()
  }

  const enter = async (c: User) => {
    if (
      !confirm(
        `Vas a entrar al portal de "${c.name}" para darle soporte. Para volver a tu cuenta Maestro tendrás que salir e iniciar sesión otra vez. ¿Continuar?`,
      )
    )
      return
    try {
      await loginAs(c.id)
      try {
        sessionStorage.setItem(SUPPORT_KEY, me.name)
      } catch {
        // Sin almacenamiento solo se pierde el aviso de modo soporte.
      }
      location.assign('/')
    } catch {
      setError('No se pudo entrar a esa empresa.')
    }
  }

  return (
    <div className="admin">
      <PageTitle title="Panel Maestro" onBack={onBack} />
      <p className="muted">Cada empresa tiene su propio administrador y ve solo sus vehículos, usuarios, geocercas y alertas.</p>
      <div className="admin-toolbar">
        <span className="muted">{companies.length} empresas</span>
        <button onClick={() => setEditing('new')}>+ Nueva empresa</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Usuario</th>
              <th>Correo</th>
              <th>Vehículos</th>
              <th>Usuarios</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Aún no hay empresas. Crea la primera con “+ Nueva empresa”.
                </td>
              </tr>
            )}
            {companies.map((c) => {
              const expired = c.expirationTime && c.expirationTime < today
              const i = info[c.id]
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="mono">{initialLogin(c) || '—'}</td>
                  <td className="mono">{initialEmail(c) || <span className="muted">Sin correo</span>}</td>
                  <td>
                    {i?.devices.size ?? '…'}
                    {c.deviceLimit && c.deviceLimit > 0 ? <span className="muted"> de {c.deviceLimit}</span> : null}
                  </td>
                  <td>
                    {i?.users.length ?? '…'}
                    {c.userLimit && c.userLimit > 0 ? <span className="muted"> de {c.userLimit}</span> : null}
                  </td>
                  <td>
                    {c.disabled ? (
                      <span className="status status-unknown">Desactivada</span>
                    ) : expired ? (
                      <span className="status status-overdue">Vencida</span>
                    ) : (
                      <span className="status status-ok">Activa</span>
                    )}
                  </td>
                  <td className="actions">
                    <button className="link" onClick={() => enter(c)} disabled={!!c.disabled} title="Entrar a su portal para darle soporte">
                      Entrar
                    </button>
                    <button className="link" onClick={() => setViewing(c)}>
                      Vehículos
                    </button>
                    <button className="link" onClick={() => setEditing(c)}>
                      Editar
                    </button>
                    <button className="link danger-text" onClick={() => remove(c)}>
                      Borrar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <CompanyForm
          company={editing === 'new' ? null : editing}
          info={editing === 'new' ? undefined : info[editing.id]}
          devices={devices}
          owners={owners}
          onDone={(cr) => {
            setEditing(null)
            if (cr) setCreds(cr)
            reload()
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {viewing && (
        <CompanyDevices
          company={viewing}
          devices={info[viewing.id]?.list ?? []}
          onChanged={() => {
            reload()
            onChanged()
          }}
          onClose={() => setViewing(null)}
        />
      )}
      {creds && <Credentials {...creds} onClose={() => setCreds(null)} />}
    </div>
  )
}
