import type { User } from './traccar'

// Permisos de Teesa. Se guardan en user.attributes.teesa y además se traducen a las
// restricciones propias de Traccar, para que el servidor también las haga cumplir.
export interface Perms {
  history: boolean // ver historial de rutas (y reportes)
  geofences: boolean // crear y borrar geocercas y reglas de alerta
  engine: boolean // apagar y reactivar motor
  vehicles: boolean // dar de alta y editar vehículos, choferes y mantenimiento
  users: boolean // crear usuarios y dar permisos (administrador)
}

export const PERM_LABEL: Record<keyof Perms, string> = {
  history: 'Ver historial de rutas',
  geofences: 'Crear geocercas y reglas de alerta',
  engine: 'Apagar y reactivar motor',
  vehicles: 'Administrar vehículos, choferes y mantenimiento',
  users: 'Administrar usuarios (acceso total)',
}

export type RoleId = 'admin' | 'supervisor' | 'operator' | 'viewer' | 'custom'

export const ROLES: { id: RoleId; name: string; description: string; perms?: Perms }[] = [
  {
    id: 'admin',
    name: 'Administrador',
    description: 'Ve todos los vehículos y puede hacer todo, incluso crear usuarios.',
    perms: { history: true, geofences: true, engine: true, vehicles: true, users: true },
  },
  {
    id: 'supervisor',
    name: 'Supervisor',
    description: 'Ve sus vehículos, historial, geocercas y alertas, y puede cortar el motor.',
    perms: { history: true, geofences: true, engine: true, vehicles: false, users: false },
  },
  {
    id: 'operator',
    name: 'Monitorista',
    description: 'Ve el mapa en vivo, el historial y las alertas. No puede cambiar nada ni cortar el motor.',
    perms: { history: true, geofences: false, engine: false, vehicles: false, users: false },
  },
  {
    id: 'viewer',
    name: 'Solo ver',
    description: 'Solo ve dónde están sus vehículos en este momento.',
    perms: { history: false, geofences: false, engine: false, vehicles: false, users: false },
  },
  { id: 'custom', name: 'Personalizado', description: 'Tú eliges cada permiso.' },
]

const same = (a: Perms, b: Perms) => (Object.keys(a) as (keyof Perms)[]).every((k) => a[k] === b[k])

export function roleOf(perms: Perms): RoleId {
  return ROLES.find((r) => r.perms && same(r.perms, perms))?.id ?? 'custom'
}

/**
 * Cuenta de empresa: el administrador de una empresa cliente. En Traccar es un "manager"
 * (userLimit distinto de 0): ve solo sus vehículos y los usuarios que él crea.
 * La cuenta Maestro es el administrador del servidor (administrator) y ve todo.
 */
export const isCompany = (u: User) => !u.administrator && (u.userLimit ?? 0) !== 0

/** Permisos de un usuario: los guardados por Teesa o, si no hay, los que se deducen de Traccar. */
export function permsOf(user: User): Perms {
  if (user.administrator || isCompany(user)) return ROLES[0].perms!
  const saved = user.attributes?.teesa as Partial<Perms> | undefined
  const fromServer: Perms = {
    history: !user.disableReports,
    geofences: !user.readonly,
    engine: !user.limitCommands && !user.readonly,
    vehicles: !user.readonly && !user.deviceReadonly,
    users: false,
  }
  return saved ? { ...fromServer, ...saved, users: false } : fromServer
}

/** Restricciones de Traccar que corresponden a cada combinación de permisos. */
export function traccarFlags(p: Perms) {
  return {
    administrator: p.users,
    readonly: !p.users && !p.geofences && !p.vehicles,
    deviceReadonly: !p.users && !p.vehicles,
    limitCommands: !p.users && !p.engine,
    disableReports: !p.users && !p.history,
  }
}

/** Contraseña fácil de dictar: sin letras que se confunden (l, 1, O, 0). */
export function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}
