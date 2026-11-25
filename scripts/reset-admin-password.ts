import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { assertStrongPassword, requireEnv } from '../src/lib/admin-credentials'

const prisma = new PrismaClient()

async function main() {
  const username = requireEnv('ADMIN_USERNAME')
  const password = assertStrongPassword(requireEnv('NEW_ADMIN_PASSWORD'))

  const password_hash = await bcrypt.hash(password, 10)

  try {
    await prisma.user.update({ where: { username }, data: { password_hash } })
    console.log(`Password updated for: ${username}`)
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2025') {
      console.error(`No user found with username "${username}".`)
      process.exitCode = 1
      return
    }
    throw e
  }
}

main()
  .catch((e: unknown) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
