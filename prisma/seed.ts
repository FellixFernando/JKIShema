import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const masterPassword = await bcrypt.hash('2810200616022005', 10)

  const admin = await prisma.user.upsert({
    where: { username: 'masterjkishema' },
    update: {
      password_hash: masterPassword,
    },
    create: {
      username: 'masterjkishema',
      password_hash: masterPassword,
      role: 'MASTER',
    },
  })

  console.log('✅ Default Master Admin created/updated:')
  console.log('Username: masterjkishema')
  console.log('Password: 2810200616022005')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
