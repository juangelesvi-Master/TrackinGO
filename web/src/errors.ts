// Manejo de errores de la app: se registran en la consola del navegador SIN datos sensibles
// (contraseñas, tokens, correos o cookies) y sin detalles internos del servidor.

const SECRET_PATTERNS: [RegExp, string][] = [
  [/(password|contraseña|token|key|session|cookie|authorization)=([^&\s]+)/gi, '$1=***'],
  [/"(password|token|key|session)"\s*:\s*"[^"]*"/gi, '"$1":"***"'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '***@***'],
  [/Bearer\s+[\w.-]+/gi, 'Bearer ***'],
]

/** Texto de un error, recortado y sin datos sensibles. */
export function safeErrorText(err: unknown): string {
  let text = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  // Traccar agrega el nombre de la clase y la pila después de " - ": no hace falta.
  text = text.split(' - ')[0]
  for (const [re, rep] of SECRET_PATTERNS) text = text.replace(re, rep)
  return text.slice(0, 300)
}

/** Registra un error en la consola con el lugar donde pasó. */
export function logError(where: string, err: unknown) {
  console.error(`[TracKING GO] ${where}: ${safeErrorText(err)}`)
}

/** Si una parte de la app no se pudo descargar (pasa justo después de actualizar el servidor). */
export const isChunkError = (err: unknown) =>
  err instanceof Error && /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError/i.test(err.message)

const RELOAD_KEY = 'tgChunkReload'

/** Recarga la página una sola vez para traer la versión nueva. Devuelve false si ya se intentó. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Sin almacenamiento: se recarga igual.
  }
  location.reload()
  return true
}

/** Errores que nadie atrapó: se registran sin datos sensibles. */
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (e) => logError('error', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkError(e.reason) && reloadForNewVersion()) return
    logError('promesa sin atrapar', e.reason)
  })
}
