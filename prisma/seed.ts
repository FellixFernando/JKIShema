import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { assertStrongPassword, requireEnv } from '../src/lib/admin-credentials'

const prisma = new PrismaClient()

async function main() {
  const username = requireEnv('MASTER_ADMIN_USERNAME')
  const password = assertStrongPassword(requireEnv('MASTER_ADMIN_PASSWORD'), 'MASTER_ADMIN_PASSWORD')

  const password_hash = await bcrypt.hash(password, 10)

  const user = await prisma.user.upsert({
    where: { username },
    update: { password_hash },
    create: { username, password_hash, role: 'MASTER' },
  })

  console.log(`Master admin ready. Username: ${user.username}, role: ${user.role}`)
}

main()
  .catch((e: unknown) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
