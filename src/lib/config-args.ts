export const CONFIG_KEYS = [
  'total_venue_capacity',
  'max_online_quota',
  'is_registration_open',
  'auto_promote_waitlist',
] as const

export type ConfigKey = (typeof CONFIG_KEYS)[number]

const INT_KEYS: readonly ConfigKey[] = ['total_venue_capacity', 'max_online_quota']

export interface SetConfigArgs {
  help: boolean
  list: boolean
  key?: ConfigKey
  value?: string
}

export function isConfigKey(value: string): value is ConfigKey {
  return (CONFIG_KEYS as readonly string[]).includes(value)
}

export function validateConfigValue(key: string, value: string): { key: ConfigKey; value: string } {
  if (!isConfigKey(key)) {
    throw new Error(`Unknown key: ${key}. Known keys: ${CONFIG_KEYS.join(', ')}`)
  }
  if (INT_KEYS.includes(key)) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${key} must be a positive integer`)
    }
  } else if (value !== 'true' && value !== 'false') {
    throw new Error(`${key} must be true or false`)
  }
  return { key, value }
}

export function parseSetConfigArgs(argv: string[]): SetConfigArgs {
  if (argv.length === 0) return { help: true, list: false }
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    return { help: true, list: false }
  }
  if (argv.length === 1 && argv[0] === '--list') return { help: false, list: true }
  if (argv.length === 2) {
    const { key, value } = validateConfigValue(argv[0], argv[1])
    return { help: false, list: false, key, value }
  }
  throw new Error('Expected --list or <key> <value>')
}
