import { updateUser, type User } from './traccar'

// Avisos push en el celular: Traccar los manda por Firebase Cloud Messaging (notificador "firebase")
// a los códigos guardados en user.attributes.notificationTokens. La configuración pública de Firebase
// la sirve el servidor en /firebase.json; si no existe, esta función simplemente no aparece.

interface FirebaseWebConfig {
  apiKey: string
  projectId: string
  messagingSenderId: string
  appId: string
  vapidKey: string
  [key: string]: string
}

const TOKEN_KEY = 'teesaPushToken'

let configPromise: Promise<FirebaseWebConfig | null> | null = null
function loadConfig() {
  configPromise ??= fetch('/firebase.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => (c && c.apiKey && c.vapidKey ? (c as FirebaseWebConfig) : null))
    .catch(() => null)
  return configPromise
}

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** 'unavailable': el servidor o el navegador no lo permiten. */
export type PushState = 'unavailable' | 'off' | 'on' | 'blocked'

export async function pushState(): Promise<PushState> {
  if (!supported() || !(await loadConfig())) return 'unavailable'
  if (Notification.permission === 'denied') return 'blocked'
  let token: string | null = null
  try {
    token = localStorage.getItem(TOKEN_KEY)
  } catch {
    token = null
  }
  return Notification.permission === 'granted' && token ? 'on' : 'off'
}

const tokensOf = (user: User) => new Set(String(user.attributes?.notificationTokens ?? '').split(',').filter(Boolean))

async function messaging(config: FirebaseWebConfig) {
  const [{ initializeApp, getApps }, m] = await Promise.all([import('@firebase/app'), import('@firebase/messaging')])
  const { vapidKey, ...options } = config
  const app = getApps()[0] ?? initializeApp(options)
  return { m, messaging: m.getMessaging(app), vapidKey }
}

/** Pide permiso, registra este dispositivo en Firebase y guarda su código en el usuario de Traccar. */
export async function enablePush(user: User): Promise<User> {
  const config = await loadConfig()
  if (!config) throw new Error('unavailable')
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied')
  const registration = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
  const { m, messaging: msg, vapidKey } = await messaging(config)
  const token = await m.getToken(msg, { vapidKey, serviceWorkerRegistration: registration })
  const tokens = tokensOf(user)
  tokens.add(token)
  const saved = await updateUser({ ...user, attributes: { ...(user.attributes ?? {}), notificationTokens: [...tokens].join(',') } })
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Solo se pierde recordar que este dispositivo ya está activado.
  }
  return saved
}

/** Deja de mandar avisos a este dispositivo. */
export async function disablePush(user: User): Promise<User> {
  let token: string | null = null
  try {
    token = localStorage.getItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    token = null
  }
  const config = await loadConfig()
  if (config) {
    const { m, messaging: msg } = await messaging(config)
    await m.deleteToken(msg).catch(() => false)
  }
  const tokens = tokensOf(user)
  if (!token || !tokens.delete(token)) return user
  return updateUser({ ...user, attributes: { ...(user.attributes ?? {}), notificationTokens: [...tokens].join(',') } })
}

/** ¿Hay que explicar cómo instalar en iPhone? (Safari no tiene botón de instalar.) */
export const isIosBrowser = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone
