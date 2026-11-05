import { isCompany } from './permissions'
import { addLinks, getUsers, type User } from './traccar'

/**
 * Personal de quien está usando la app: los usuarios que él creó.
 * Para una empresa son sus usuarios; para el Maestro, los que no pertenecen a ninguna empresa.
 */
export async function myStaff(me: User): Promise<User[]> {
  const list = await getUsers()
  if (!me.administrator) return list.filter((u) => u.id !== me.id)
  const companies = list.filter(isCompany)
  const members = new Set((await Promise.all(companies.map((c) => getUsers(c.id)))).flat().map((u) => u.id))
  return list.filter((u) => !u.administrator && !isCompany(u) && !members.has(u.id))
}

/** En Traccar cada regla de aviso es de un usuario; se comparte con el personal para que también la reciba. */
export const shareRules = (userIds: number[], notificationIds: number[]) =>
  addLinks(userIds.flatMap((userId) => notificationIds.map((notificationId) => ({ userId, notificationId }))))
