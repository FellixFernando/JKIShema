import { randomInt } from 'crypto'

export type AdminRole = 'ADMIN' | 'MASTER'

export interface CreateAdminArgs {
  username: string
  role: AdminRole
  password: string | undefined
  help: boolean
}

export function requireEnv(name: string, env: Record<string, string | undefined> = process.env): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function assertStrongPassword(password: string, label = 'Password'): string {
  const value = password.trim()
  if (value.length < 12) {
    throw new Error(`${label} must be at least 12 characters`)
  }
  return value
}

const PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function generateAdminPassword(length = 16): string {
  let password = ''
  for (let i = 0; i < length; i++) {
    password += PASSWORD_CHARSET[randomInt(PASSWORD_CHARSET.length)]
  }
  return password
}

export function parseCreateAdminArgs(argv: string[]): CreateAdminArgs {
  let username = ''
  let role = 'ADMIN'
  let password: string | undefined
  let help = false

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    switch (flag) {
      case '--help':
        help = true
        break
      case '--username':
        username = argv[++i] ?? ''
        break
      case '--role':
        role = (argv[++i] ?? '').toUpperCase()
        break
      case '--password':
        password = argv[++i]
        break
      default:
        throw new Error(`Unknown argument: ${flag}`)
    }
  }

  if (help) return { username: '', role: 'ADMIN', password, help: true }

  if (!username) throw new Error('Missing required argument --username')
  if (role !== 'ADMIN' && role !== 'MASTER') {
    throw new Error(`Invalid --role: ${role}. Must be ADMIN or MASTER`)
  }

  return { username, role, password, help: false }
}
