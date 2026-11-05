/* Servidor Traccar simulado dentro del navegador, solo para la versión demo (VITE_DEMO=1).
   Responde a /api/* y al WebSocket en vivo con datos de prueba guardados en este navegador. */

type Obj = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const STORE = 'teesaDemoV1'
const SESSION = 'teesaDemoSession'

export const DEMO_ACCOUNTS = [
  { role: 'Maestro', login: 'demo', password: 'demo1234' },
  { role: 'Empresa', login: 'ruiz', password: 'ruiz1234' },
  { role: 'Monitorista', login: 'monitor', password: 'monitor123' },
]

// Rutas de prueba en la Ciudad de México (lat, lon).
const BASE: [number, number][] = [
  [19.4326, -99.1332], [19.4204, -99.1817], [19.3909, -99.1567], [19.4517, -99.1415],
  [19.3592, -99.1866], [19.4847, -99.1172], [19.4062, -99.0937], [19.3467, -99.1617],
  [19.4405, -99.2036], [19.3796, -99.1285], [19.4655, -99.1756], [19.3984, -99.2178],
]

interface State {
  nextId: number
  devices: Obj[]
  positions: Obj[]
  users: Obj[]
  perms: Obj[]
  geofences: Obj[]
  notifications: Obj[]
  maintenance: Obj[]
  drivers: Obj[]
}

function seed(): State {
  const now = Date.now()
  const devices = BASE.map((_, i) => ({
    id: i + 1,
    name: `Unidad ${String(i + 1).padStart(3, '0')}`,
    uniqueId: `86${1000000000000 + i}`,
    status: i % 5 === 4 ? 'offline' : 'online',
    lastUpdate: new Date(now - (i % 5 === 4 ? 7200e3 : 20e3)).toISOString(),
    positionId: i + 1,
    attributes: { speedLimit: 43.2 },
  }))
  const positions = BASE.map(([lat, lon], i) => ({
    id: i + 1,
    deviceId: i + 1,
    latitude: lat,
    longitude: lon,
    speed: i % 5 === 4 ? 0 : 10 + ((i * 7) % 30),
    course: (i * 47) % 360,
    fixTime: devices[i].lastUpdate,
    address: null,
    attributes: { totalDistance: 40000000 + i * 1500000, ignition: i % 5 !== 4 },
  }))
  const brand = { name: 'Transportes Ruiz' }
  return {
    nextId: 100,
    devices,
    positions,
    users: [
      { id: 1, name: 'Cuenta Maestro', email: 'demo', login: 'demo', password: 'demo1234', administrator: true, attributes: {} },
      { id: 2, name: 'Transportes Ruiz', email: 'ruiz', login: 'ruiz', password: 'ruiz1234', administrator: false, userLimit: -1, deviceLimit: 20, attributes: { teesaBrand: brand } },
      {
        id: 3, name: 'Ana Monitorista', email: 'monitor', login: 'monitor', password: 'monitor123', administrator: false,
        readonly: true, deviceReadonly: true, limitCommands: true,
        attributes: { teesaBrand: brand, teesa: { history: true, geofences: false, engine: false, vehicles: false, users: false } },
      },
    ],
    perms: [
      ...[1, 2, 3, 4, 5].map((deviceId) => ({ userId: 2, deviceId })),
      { userId: 2, managedUserId: 3 },
      ...[1, 2, 3].map((deviceId) => ({ userId: 3, deviceId })),
      { userId: 3, notificationId: 2 },
    ],
    geofences: [
      { _o: 1, id: 1, name: 'Bodega central', area: 'CIRCLE (19.4326 -99.1332, 500)', attributes: {} },
      { _o: 2, id: 2, name: 'Patio Ruiz', area: 'CIRCLE (19.4204 -99.1817, 400)', attributes: {} },
    ],
    notifications: [
      { _o: 1, id: 1, type: 'geofenceExit', always: true, notificators: 'web', attributes: {} },
      { _o: 2, id: 2, type: 'alarm', always: true, notificators: 'web', attributes: {} },
    ],
    maintenance: [
      { _o: 2, id: 1, name: 'Cambio de aceite', type: 'totalDistance', start: 40800000, period: 10000000, attributes: { deviceId: 1 } },
      { _o: 2, id: 2, name: 'Verificación', type: 'fixTime', start: now + 40 * 86400e3, period: 180 * 86400e3, attributes: { deviceId: 2 } },
    ],
    drivers: [{ _o: 2, id: 1, name: 'Pedro Ramírez', uniqueId: 'LIC-001', attributes: { phone: '5512345678', deviceId: 1, licenseExpiry: '2027-03-01' } }],
  }
}


let db: State
function load() {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) return JSON.parse(raw) as State
  } catch {
    // datos dañados o sin almacenamiento: se empieza de nuevo
  }
  return seed()
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(db))
  } catch {
    // sin almacenamiento, el demo funciona igual pero no recuerda cambios
  }
}
function sessionUser(): Obj | undefined {
  let id: string | null = null
  try {
    id = localStorage.getItem(SESSION)
  } catch {
    id = null
  }
  return db.users.find((u) => String(u.id) === id)
}
function setSession(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(SESSION)
    else localStorage.setItem(SESSION, String(id))
  } catch {
    // ignorar
  }
}

const managed = (uid: number) => db.perms.filter((p) => p.userId === uid && p.managedUserId).map((p) => p.managedUserId)
const managerOf = (uid: number) => db.perms.find((p) => p.managedUserId === uid)?.userId
const visibleDevices = (u: Obj) =>
  u.administrator ? db.devices : db.devices.filter((d) => db.perms.some((p) => p.deviceId === d.id && (p.userId === u.id || managed(u.id).includes(p.userId))))
const own = (u: Obj, list: Obj[]) => (u.administrator ? list : list.filter((x) => x._o === u.id || x._o === managerOf(u.id)))
const clean = <T extends Obj>(x: T) => {
  const { _o, password, ...rest } = x // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest
}

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' },
  })

function crud(me: Obj, key: 'geofences' | 'notifications' | 'maintenance' | 'drivers', method: string, id: number | null, body: Obj) {
  const list = db[key] as Obj[]
  if (id == null && method === 'GET') {
    if (key === 'notifications' && !me.administrator)
      return reply(200, list.filter((n) => n._o === me.id || db.perms.some((p) => p.userId === me.id && p.notificationId === n.id)).map(clean))
    return reply(200, own(me, list).map(clean))
  }
  if (id == null && method === 'POST') {
    const x = { ...body, id: db.nextId++, _o: me.id }
    list.push(x)
    save()
    return reply(200, clean(x))
  }
  const i = list.findIndex((x) => x.id === id)
  if (i < 0) return reply(404)
  if (method === 'PUT') {
    list[i] = { ...body, _o: list[i]._o }
    save()
    return reply(200, clean(list[i]))
  }
  if (method === 'DELETE') {
    list.splice(i, 1)
    save()
    return reply(204)
  }
  return reply(405)
}

function reports(kind: string, url: URL) {
  const ids = url.searchParams.getAll('deviceId').map(Number)
  const from = new Date(url.searchParams.get('from') ?? Date.now()).getTime()
  const to = new Date(url.searchParams.get('to') ?? Date.now()).getTime()
  const days = Math.max(1, Math.round((to - from) / 86400e3))
  const t0 = from + 8 * 3600e3
  const name = (id: number) => db.devices.find((d) => d.id === id)?.name
  const pos = (id: number) => db.positions.find((p) => p.deviceId === id) ?? { latitude: 19.43, longitude: -99.13 }
  if (kind === 'route') {
    const id = ids[0]
    const p = pos(id)
    return Array.from({ length: 120 }, (_, i) => {
      const stopped = (i > 40 && i < 55) || (i > 90 && i < 100)
      return {
        id: 1000 + i, deviceId: id,
        latitude: p.latitude - 0.04 + i * 0.0006 + Math.sin(i / 10) * 0.002,
        longitude: p.longitude - 0.03 + i * 0.0004,
        speed: stopped ? 0 : 20 + (i % 7) * 3, course: 35,
        fixTime: new Date(t0 + i * 120e3).toISOString(),
        attributes: { totalDistance: 50000 + i * 130 },
      }
    })
  }
  if (kind === 'stops')
    return ids.flatMap((id) =>
      [41, 91].map((k, j) => {
        const p = pos(id)
        return {
          deviceId: id, deviceName: name(id), positionId: 1000 + k,
          latitude: p.latitude - 0.04 + k * 0.0006, longitude: p.longitude - 0.03 + k * 0.0004,
          address: j === 0 ? 'Av. Insurgentes Sur 1000, CDMX' : null,
          startTime: new Date(t0 + k * 120e3).toISOString(), endTime: new Date(t0 + (k + 12) * 120e3).toISOString(), duration: 12 * 120e3,
        }
      }),
    )
  if (kind === 'summary')
    return ids.map((id) => ({
      deviceId: id, deviceName: name(id), distance: (42000 + id * 7300) * days, maxSpeed: 40 + id * 2.5,
      averageSpeed: 18 + id, engineHours: ((3 + (id % 5)) * 3600e3 + id * 60e3) * days,
    }))
  if (kind === 'trips')
    return ids.flatMap((id) => [
      { deviceId: id, deviceName: name(id), startTime: new Date(t0).toISOString(), endTime: new Date(t0 + 82 * 60e3).toISOString(), duration: 82 * 60e3, distance: 23000 + id * 1000, maxSpeed: 45 + id, averageSpeed: 20, startAddress: 'Bodega central, Azcapotzalco', endAddress: 'Av. Insurgentes Sur 1000, CDMX' },
      { deviceId: id, deviceName: name(id), startTime: new Date(t0 + 110 * 60e3).toISOString(), endTime: new Date(t0 + 180 * 60e3).toISOString(), duration: 70 * 60e3, distance: 19000 + id * 800, maxSpeed: 52, averageSpeed: 17, startAddress: 'Av. Insurgentes Sur 1000, CDMX', endAddress: null, endLat: 19.4321, endLon: -99.1333 },
    ])
  if (kind === 'events') {
    if (url.searchParams.get('type') === 'deviceOverspeed')
      return ids.filter((id) => id % 3 === 0).flatMap((id) => [1, 2].map((k) => ({ id: 7000 + id * 10 + k, type: 'deviceOverspeed', eventTime: new Date(t0 + k * 3600e3).toISOString(), deviceId: id, positionId: 0, geofenceId: 0, attributes: { speed: 52 + k * 4, speedLimit: 43.2 } })))
    const now = Date.now()
    return [
      { id: 501, type: 'deviceOverspeed', eventTime: new Date(now - 3600e3).toISOString(), deviceId: 3, positionId: 0, geofenceId: 0, attributes: { speed: 60 } },
      { id: 502, type: 'geofenceExit', eventTime: new Date(now - 1800e3).toISOString(), deviceId: 1, positionId: 0, geofenceId: 1, attributes: {} },
      { id: 503, type: 'ignitionOn', eventTime: new Date(now - 900e3).toISOString(), deviceId: 2, positionId: 0, geofenceId: 0, attributes: {} },
    ].filter((e) => ids.includes(e.deviceId))
  }
  return []
}

async function handle(method: string, url: URL, bodyText: string): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, '')
  const body: Obj = (() => {
    try {
      return bodyText ? JSON.parse(bodyText) : {}
    } catch {
      return {}
    }
  })()

  if (path === '/server') return reply(200, { registration: false, emailEnabled: false })
  if (path === '/session' && method === 'POST') {
    const p = new URLSearchParams(bodyText)
    const login = (p.get('email') ?? '').trim().toLowerCase()
    const u = db.users.find((x) => (x.email?.toLowerCase() === login || x.login?.toLowerCase() === login) && x.password === p.get('password') && !x.disabled)
    if (!u) return reply(401)
    setSession(u.id)
    return reply(200, clean(u))
  }
  if (path === '/session' && method === 'DELETE') {
    setSession(null)
    return reply(204)
  }
  if (path === '/password/reset') return reply(204)
  const me = sessionUser()
  if (!me) return reply(401)
  if (path === '/session') return reply(200, clean(me))

  let m = path.match(/^\/session\/(\d+)$/)
  if (m) {
    const t = db.users.find((u) => u.id === Number(m![1]))
    if (!me.administrator || !t) return reply(400, 'SecurityException')
    setSession(t.id)
    return reply(200, clean(t))
  }

  if (path === '/devices' && method === 'GET') {
    const uid = url.searchParams.get('userId')
    return reply(200, uid ? db.devices.filter((d) => db.perms.some((p) => p.userId === Number(uid) && p.deviceId === d.id)) : visibleDevices(me))
  }
  if (path === '/devices' && method === 'POST') {
    if (db.devices.some((d) => d.uniqueId === body.uniqueId)) return reply(400, 'Duplicate entry')
    const d = { ...body, id: db.nextId++, status: 'unknown', lastUpdate: null, positionId: 0 }
    db.devices.push(d)
    if (!me.administrator) db.perms.push({ userId: me.id, deviceId: d.id })
    save()
    return reply(200, d)
  }
  m = path.match(/^\/devices\/(\d+)$/)
  if (m) {
    const i = db.devices.findIndex((d) => d.id === Number(m![1]))
    if (method === 'PUT') db.devices[i] = body
    if (method === 'DELETE') db.devices.splice(i, 1)
    save()
    return method === 'PUT' ? reply(200, body) : reply(204)
  }
  m = path.match(/^\/devices\/(\d+)\/accumulators$/)
  if (m) {
    const p = db.positions.find((x) => x.deviceId === Number(m![1]))
    if (p) p.attributes.totalDistance = body.totalDistance
    save()
    return reply(204)
  }
  if (path === '/positions') {
    const v = visibleDevices(me).map((d) => d.id)
    return reply(200, db.positions.filter((p) => v.includes(p.deviceId)))
  }

  if (path === '/users' && method === 'GET') {
    const uid = url.searchParams.get('userId')
    const list = uid ? db.users.filter((u) => managed(Number(uid)).includes(u.id)) : me.administrator ? db.users : db.users.filter((u) => managed(me.id).includes(u.id))
    return reply(200, list.map(clean))
  }
  if (path === '/users' && method === 'POST') {
    if (db.users.some((u) => u.email === body.email)) return reply(400, 'Duplicate entry')
    const u = { attributes: {}, ...body, id: db.nextId++ }
    db.users.push(u)
    if (!me.administrator) db.perms.push({ userId: me.id, managedUserId: u.id })
    save()
    return reply(200, clean(u))
  }
  m = path.match(/^\/users\/(\d+)$/)
  if (m) {
    const i = db.users.findIndex((u) => u.id === Number(m![1]))
    if (i < 0) return reply(404)
    if (method === 'PUT') {
      db.users[i] = { ...body, password: body.password || db.users[i].password }
      save()
      return reply(200, clean(db.users[i]))
    }
    if (method === 'DELETE') {
      const id = db.users[i].id
      db.users.splice(i, 1)
      db.perms = db.perms.filter((p) => p.userId !== id && p.managedUserId !== id)
      save()
      return reply(204)
    }
  }
  if (path === '/permissions/bulk') {
    for (const l of body as unknown as Obj[]) {
      if (method === 'POST') db.perms.push(l)
      else {
        const i = db.perms.findIndex((p) => JSON.stringify(p) === JSON.stringify(l))
        if (i >= 0) db.perms.splice(i, 1)
      }
    }
    save()
    return reply(204)
  }

  for (const key of ['geofences', 'notifications', 'maintenance', 'drivers'] as const) {
    const mm = path.match(new RegExp(`^/${key}(?:/(\\d+))?$`))
    if (mm) return crud(me, key, method, mm[1] ? Number(mm[1]) : null, body)
  }
  if (path === '/notifications/notificators') return reply(200, [{ type: 'web' }, { type: 'mail' }])

  if (path === '/commands/types') return reply(200, [{ type: 'engineStop' }, { type: 'engineResume' }])
  if (path === '/commands/send') {
    if (me.limitCommands || me.readonly) return reply(400, 'SecurityException: limitCommands')
    const d = db.devices.find((x) => x.id === body.deviceId)
    return reply(d?.status === 'online' ? 200 : 202, body)
  }
  m = path.match(/^\/reports\/(\w+)$/)
  if (m) {
    if (me.disableReports) return reply(400, 'SecurityException: reports disabled')
    return reply(200, reports(m[1], url))
  }
  return reply(404)
}

// --- WebSocket simulado: mueve los vehículos en línea y de vez en cuando manda un aviso ---
class FakeSocket extends EventTarget {
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  readyState = 0
  private timers: ReturnType<typeof setInterval>[] = []

  constructor() {
    super()
    setTimeout(() => {
      const me = sessionUser()
      if (!me) return this.close()
      this.readyState = 1
      this.onopen?.(new Event('open'))
      this.timers.push(
        setInterval(() => {
          const visible = new Set(visibleDevices(me).map((d) => d.id))
          const moved = db.positions
            .filter((p) => visible.has(p.deviceId) && db.devices.find((d) => d.id === p.deviceId)?.status === 'online')
            .map((p) => {
              const rad = ((p.course + (Math.random() - 0.5) * 30) * Math.PI) / 180
              p.course = Math.round(((rad * 180) / Math.PI + 360) % 360)
              p.speed = Math.max(5, Math.min(45, p.speed + (Math.random() - 0.5) * 6))
              const step = p.speed * 0.00002
              p.latitude += Math.cos(rad) * step
              p.longitude += Math.sin(rad) * step
              p.fixTime = new Date().toISOString()
              return { ...p }
            })
          if (moved.length) this.emit({ positions: moved })
        }, 3000),
      )
      this.timers.push(
        setInterval(() => {
          const ids = visibleDevices(me).map((d) => d.id)
          if (!ids.length) return
          const deviceId = ids[Math.floor(Math.random() * ids.length)]
          const types = [
            { type: 'deviceOverspeed', attributes: { speed: 55 } },
            { type: 'geofenceExit', attributes: {}, geofenceId: 1 },
            { type: 'ignitionOn', attributes: {} },
          ]
          const e = types[Math.floor(Math.random() * types.length)]
          this.emit({ events: [{ id: Date.now(), eventTime: new Date().toISOString(), deviceId, positionId: 0, geofenceId: 0, ...e }] })
        }, 45000),
      )
    }, 300)
  }
  private emit(msg: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(msg) }))
  }
  send() {}
  close() {
    this.timers.forEach(clearInterval)
    if (this.readyState === 3) return
    this.readyState = 3
    this.onclose?.(new CloseEvent('close'))
  }
}

export function install() {
  db = load()
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init)
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : ''
    await new Promise((r) => setTimeout(r, 120)) // como si viniera de internet
    return handle(method, url, body)
  }
  const RealSocket = window.WebSocket
  window.WebSocket = function (url: string | URL, protocols?: string | string[]) {
    return String(url).endsWith('/api/socket') ? new FakeSocket() : new RealSocket(url, protocols)
  } as unknown as typeof WebSocket
}

/** Borra los cambios hechos en el demo y vuelve a los datos de prueba. */
export function resetDemo() {
  try {
    localStorage.removeItem(STORE)
    localStorage.removeItem(SESSION)
  } catch {
    // ignorar
  }
  location.assign('/login')
}
