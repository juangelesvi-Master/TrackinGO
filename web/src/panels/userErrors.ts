export const userErrorText = (err: unknown, fallback: string) => {
  const msg = err instanceof Error ? err.message.toLowerCase() : ''
  if (msg.includes('duplicate') || msg.includes('unique')) return 'Ya existe un usuario con ese nombre de usuario o correo.'
  if (msg.includes('security') || msg.includes('permission') || msg.includes('admin')) return 'Tu usuario no tiene permiso para hacer esto.'
  return fallback
}
