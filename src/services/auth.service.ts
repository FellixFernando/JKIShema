import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function verifyCredentials(username: string, password_plain: string) {
  const user = await db.user.findUnique({
    where: { username }
  })

  if (!user) {
    return null
  }

  const isPasswordValid = await bcrypt.compare(password_plain, user.password_hash)

  if (!isPasswordValid) {
    return null
  }

  // Omit password hash from returned object for safety
  const { password_hash, ...userWithoutPassword } = user
  return userWithoutPassword
}
