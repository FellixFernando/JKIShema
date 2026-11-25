import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import {
  assertStrongPassword,
  generateAdminPassword,
  parseCreateAdminArgs,
} from '../src/lib/admin-credentials'

const prisma = new PrismaClient()

const USAGE = `Usage: npm run create-admin -- --username <name> [--role ADMIN|MASTER] [--password <pass>]

Creates an admin user. The password is taken from --password, then ADMIN_PASSWORD,
or generated when neither is set. The password must be at least 12 characters.`

async function main() {
  const { username, role, password: argPassword, help } = parseCreateAdminArgs(process.argv.slice(2))

  if (help) {
    console.log(USAGE)
    return
  }

  let password = argPassword ?? process.env.ADMIN_PASSWORD
  let generated = false
  if (!password) {
    password = generateAdminPassword()
    generated = true
  }
  password = assertStrongPassword(password)

  const password_hash = await bcrypt.hash(password, 10)

  try {
    const user = await prisma.user.create({ data: { username, password_hash, role } })
    console.log(`Admin created. Username: ${user.username}, role: ${user.role}`)
    if (generated) {
      console.log(`Generated password (shown once): ${password}`)
    }
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
      console.error(`User "${username}" already exists. Use npm run reset-admin-password to change the password.`)
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
