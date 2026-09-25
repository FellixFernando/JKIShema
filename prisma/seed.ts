import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const masterPassword = await bcrypt.hash('master123', 10)

  const admin = await prisma.user.upsert({
    where: { username: 'master' },
    update: {},
    create: {
      username: 'master',
      password_hash: masterPassword,
      role: 'MASTER',
    },
  })

  console.log('✅ Default Master Admin created:')
  console.log('Username: master')
  console.log('Password: master123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
