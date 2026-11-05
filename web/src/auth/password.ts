export const MIN_PASSWORD = 8

/** Revisa la contraseña nueva y devuelve el problema, o '' si está bien. */
export function passwordProblem(password: string, confirm: string) {
  if (password.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`
  if (password !== confirm) return 'Las contraseñas no coinciden.'
  return ''
}
