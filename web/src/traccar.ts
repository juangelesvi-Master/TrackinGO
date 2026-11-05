// Cliente mínimo de la API REST/WebSocket de Traccar.
// Documentación: https://www.traccar.org/api-reference/

export interface User {
  id: number
  name: string
  email: string
  administrator?: boolean
  readonly?: boolean
  deviceReadonly?: boolean
  limitCommands?: boolean
  userLimit?: number
  deviceLimit?: number
  disabled?: boolean
  disableReports?: boolean
  expirationTime?: string | null
  login?: string | null
  password?: string
  attributes?: Record<string, unknown>
}

export interface Device {
  id: number
  name: string
  uniqueId: string
  status: 'online' | 'offline' | 'unknown'
  lastUpdate: string | null
  positionId: number
  category?: string | null
  disabled?: boolean
  phone?: string | null
  model?: string | null
  attributes?: Record<string, unknown>
}

export interface Position {
  id: number
  deviceId: number
  latitude: number
  longitude: number
  speed: number // nudos
  course: number
  fixTime: string
  address?: string | null
  attributes: Record<string, unknown>
}

export interface Stop {
  deviceId: number
  deviceName?: string
  positionId: number
  latitude: number
  longitude: number
  address?: string | null
  startTime: string
  endTime: string
  duration: number // milisegundos
}

/** Resumen por vehículo de /reports/summary. */
export interface SummaryRow {
  deviceId: number
  deviceName: string
  distance: number // metros
  averageSpeed: number // nudos
  maxSpeed: number // nudos
  engineHours: number // milisegundos
  startOdometer?: number
  endOdometer?: number
}

/** Viaje de /reports/trips. */
export interface Trip {
  deviceId: number
  deviceName: string
  startTime: string
  endTime: string
  duration: number // milisegundos
  distance: number // metros
  maxSpeed: number // nudos
  averageSpeed: number // nudos
  startAddress?: string | null
  endAddress?: string | null
  startLat?: number
  startLon?: number
  endLat?: number
  endLon?: number
}

export interface Geofence {
  id: number
  name: string
  description?: string | null
  area: string // WKT de Traccar: "CIRCLE (lat lon, radio)" o "POLYGON ((lat lon, ...))"
  attributes?: Record<string, unknown>
}

export interface TraccarEvent {
  id: number
  type: string
  eventTime: string
  deviceId: number
  positionId: number
  geofenceId: number
  attributes: Record<string, unknown>
}

export interface Notification {
  id: number
  type: string
  always: boolean
  notificators: string
  attributes?: Record<string, unknown>
}

/** Servicio de mantenimiento. En Teesa cada registro es un servicio de UN vehículo (attributes.deviceId). */
export interface Maintenance {
  id: number
  name: string
  type: 'totalDistance' | 'fixTime' // por kilómetros (metros) o por fecha (milisegundos)
  start: number // cuándo toca el próximo servicio
  period: number // cada cuánto se repite
  attributes: Record<string, unknown>
}

export interface Driver {
  id: number
  name: string
  uniqueId: string // número de licencia o de la tarjeta/llave del chofer
  attributes: Record<string, unknown>
}

export interface SocketMessage {
  devices?: Device[]
  positions?: Position[]
  events?: TraccarEvent[]
}

export interface Server {
  registration: boolean
  emailEnabled: boolean
}

export class AuthError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })
  if (res.status === 401) throw new AuthError('No autorizado')
  if (!res.ok) throw new Error((await res.text()) || `Error ${res.status}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export function getSession(): Promise<User> {
  return request<User>('/session')
}

export function login(email: string, password: string): Promise<User> {
  return request<User>('/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  })
}

/** El administrador entra como otro usuario (para dar soporte). La sesión pasa a ser la de ese usuario. */
export const loginAs = (userId: number) => request<User>(`/session/${userId}`)

/** Aviso de "modo soporte": el nombre de quien entró como otra cuenta. Dura lo que dure la pestaña. */
export const SUPPORT_KEY = 'teesaSupport'

export function logout(): Promise<void> {
  return request<void>('/session', { method: 'DELETE' })
}

/** Configuración pública del servidor (por ejemplo, si puede enviar correos). */
export function getServer(): Promise<Server> {
  return request<Server>('/server')
}

/** Pide a Traccar que envíe el correo con el enlace para cambiar la contraseña. */
export function requestPasswordReset(email: string): Promise<void> {
  return request<void>('/password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email }),
  })
}

/** Guarda la contraseña nueva usando el código que llegó en el correo. */
export function resetPassword(token: string, password: string): Promise<void> {
  return request<void>('/password/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, password }),
  })
}

export function getDevices(): Promise<Device[]> {
  return request<Device[]>('/devices')
}

export function getPositions(): Promise<Position[]> {
  return request<Position[]>('/positions')
}

const range = (deviceId: number, from: Date, to: Date) =>
  new URLSearchParams({ deviceId: String(deviceId), from: from.toISOString(), to: to.toISOString() })

/** Todas las posiciones que reportó un vehículo entre dos fechas. */
export function getRoute(deviceId: number, from: Date, to: Date): Promise<Position[]> {
  return request<Position[]>(`/reports/route?${range(deviceId, from, to)}`)
}

/** Paradas que detectó Traccar entre dos fechas. */
export function getStops(deviceId: number, from: Date, to: Date): Promise<Stop[]> {
  return request<Stop[]>(`/reports/stops?${range(deviceId, from, to)}`)
}

/** Reporte de Traccar para varios vehículos a la vez (summary, trips, stops, events). */
export function getReport<T>(kind: 'summary' | 'trips' | 'stops' | 'events', deviceIds: number[], from: Date, to: Date, extra: Record<string, string> = {}): Promise<T[]> {
  const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), ...extra })
  deviceIds.forEach((id) => q.append('deviceId', String(id)))
  return request<T[]>(`/reports/${kind}?${q}`)
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// --- Vehículos ---
export const createDevice = (d: Partial<Device>) => request<Device>('/devices', json('POST', d))
export const updateDevice = (d: Device) => request<Device>(`/devices/${d.id}`, json('PUT', d))
export const deleteDevice = (id: number) => request<void>(`/devices/${id}`, { method: 'DELETE' })
/** Vehículos que ve un usuario (solo administradores). */
export const getUserDevices = (userId: number) => request<Device[]>(`/devices?userId=${userId}`)

/** Ajusta el odómetro de Traccar (en metros) para que coincida con el del vehículo. */
export const setOdometer = (deviceId: number, meters: number) =>
  request<void>(`/devices/${deviceId}/accumulators`, json('PUT', { deviceId, totalDistance: meters }))

// --- Mantenimiento ---
export const getMaintenances = () => request<Maintenance[]>('/maintenance')
export const createMaintenance = (m: Partial<Maintenance>) => request<Maintenance>('/maintenance', json('POST', m))
export const updateMaintenance = (m: Maintenance) => request<Maintenance>(`/maintenance/${m.id}`, json('PUT', m))
export const deleteMaintenance = (id: number) => request<void>(`/maintenance/${id}`, { method: 'DELETE' })

// --- Choferes ---
export const getDrivers = () => request<Driver[]>('/drivers')
export const createDriver = (d: Partial<Driver>) => request<Driver>('/drivers', json('POST', d))
export const updateDriver = (d: Driver) => request<Driver>(`/drivers/${d.id}`, json('PUT', d))
export const deleteDriver = (id: number) => request<void>(`/drivers/${id}`, { method: 'DELETE' })

/** Vehículo asignado a un chofer (se guarda en sus atributos y como permiso en Traccar). */
export const assignedDevice = (d: Driver) => (typeof d.attributes?.deviceId === 'number' ? d.attributes.deviceId : null)

// --- Usuarios ---
/** Sin userId: todos los usuarios que puedes ver. Con userId: los que administra ese usuario (empresa). */
export const getUsers = (userId?: number) => request<User[]>(userId ? `/users?userId=${userId}` : '/users')
export const createUser = (u: Partial<User>) => request<User>('/users', json('POST', u))
export const updateUser = (u: User) => request<User>(`/users/${u.id}`, json('PUT', u))
export const deleteUser = (id: number) => request<void>(`/users/${id}`, { method: 'DELETE' })

// --- Permisos (qué usuario ve qué vehículo, qué geocerca aplica a qué vehículo) ---
type Link = Record<string, number>
export const addLinks = (links: Link[]) => (links.length ? request<void>('/permissions/bulk', json('POST', links)) : Promise.resolve())
export const removeLinks = (links: Link[]) => (links.length ? request<void>('/permissions/bulk', json('DELETE', links)) : Promise.resolve())

// --- Geocercas ---
export const getGeofences = (deviceId?: number) => request<Geofence[]>(deviceId ? `/geofences?deviceId=${deviceId}` : '/geofences')
export const createGeofence = (g: Partial<Geofence>) => request<Geofence>('/geofences', json('POST', g))
export const deleteGeofence = (id: number) => request<void>(`/geofences/${id}`, { method: 'DELETE' })

// --- Alertas ---
export const getNotifications = () => request<Notification[]>('/notifications')
export const createNotification = (n: Partial<Notification>) => request<Notification>('/notifications', json('POST', n))
export const deleteNotification = (id: number) => request<void>(`/notifications/${id}`, { method: 'DELETE' })
export const getNotificators = () => request<{ type: string }[]>('/notifications/notificators')

export function getEvents(deviceIds: number[], from: Date, to: Date): Promise<TraccarEvent[]> {
  const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  deviceIds.forEach((id) => q.append('deviceId', String(id)))
  return request<TraccarEvent[]>(`/reports/events?${q}`)
}

// --- Comandos (corte de motor) ---
/** Tipos de comando que admite el rastreador de ese vehículo. */
export const getCommandTypes = (deviceId: number) =>
  request<{ type: string }[]>(`/commands/types?deviceId=${deviceId}`).then((list) => list.map((t) => t.type))

/** Envía un comando. Devuelve "sent" si salió al rastreador o "queued" si se mandará cuando se conecte. */
export async function sendCommand(deviceId: number, type: 'engineStop' | 'engineResume'): Promise<'sent' | 'queued'> {
  const res = await fetch('/api/commands/send', {
    credentials: 'include',
    ...json('POST', { deviceId, type, attributes: {} }),
  })
  if (res.status === 401) throw new AuthError('No autorizado')
  if (!res.ok) throw new Error((await res.text()) || `Error ${res.status}`)
  return res.status === 202 ? 'queued' : 'sent'
}

/** Abre el WebSocket de Traccar y se reconecta solo si se corta. Devuelve una función para cerrarlo. */
export function connectSocket(onMessage: (msg: SocketMessage) => void, onStatus: (connected: boolean) => void) {
  let socket: WebSocket | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let closed = false

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${proto}://${location.host}/api/socket`)
    socket.onopen = () => onStatus(true)
    socket.onmessage = (e) => onMessage(JSON.parse(e.data))
    socket.onclose = () => {
      onStatus(false)
      if (!closed) retry = setTimeout(open, 5000)
    }
  }
  open()

  return () => {
    closed = true
    clearTimeout(retry)
    socket?.close()
  }
}

export const knotsToKmh = (knots: number) => Math.round(knots * 1.852)

export function timeAgo(iso: string | null) {
  if (!iso) return 'nunca'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} d`
}

export const kmhToKnots = (kmh: number) => kmh / 1.852

export function formatDuration(ms: number) {
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h ${mins % 60} min`
}

export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
