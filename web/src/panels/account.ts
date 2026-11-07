import { getUsers, type User } from '../traccar'

/** Usuario y correo van separados: se entra con cualquiera de los dos y el correo sirve para recuperar la contraseña. */

const hasAt = (s: string) => s.includes('@')

/** Usuario guardado. Las cuentas viejas lo tenían en el campo de correo. */
export const initialLogin = (u?: User | null) => u?.login || (u && !hasAt(u.email) ? u.email : '') || ''

/** Correo guardado, solo si de verdad es un correo. */
export const initialEmail = (u?: User | null) => (u && hasAt(u.email) ? u.email : '')

export const cleanLogin = (s: string) => s.replace(/\s/g, '').toLowerCase()

/** Revisa que el usuario y el correo estén bien y que nadie más los use. Devuelve el error o null. */
export async function checkAccount(login: string, email: string, selfId?: number): Promise<string | null> {
  const l = login.trim().toLowerCase()
  const e = email.trim().toLowerCase()
  if (!l) return 'Escribe el nombre de usuario.'
  if (hasAt(l)) return 'El usuario no lleva @. El correo va en su propio campo.'
  if (l.length < 3) return 'El usuario debe tener al menos 3 letras.'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return 'Escribe un correo válido, por ejemplo nombre@empresa.com.'
  const others = (await getUsers().catch(() => [] as User[])).filter((u) => u.id !== selfId)
  const used = (v: string) => others.some((u) => u.email?.toLowerCase() === v || u.login?.toLowerCase() === v)
  if (used(l)) return `El usuario "${l}" ya lo usa otra cuenta.`
  if (used(e)) return `El correo ${e} ya lo usa otra cuenta.`
  return null
}
