import { db } from '@/lib/db'

export interface RegistrationSettings {
  totalCapacity: number
  maxOnlineQuota: number
  isRegistrationOpen: boolean
  autoPromoteWaitlist: boolean
}

export interface RegistrationConfigClient {
  systemConfig: {
    findMany(args: {
      where: { key: { in: string[] } }
    }): Promise<Array<{ key: string; value: string }>>
  }
}

const REGISTRATION_CONFIG_KEYS = [
  'total_venue_capacity',
  'max_online_quota',
  'is_registration_open',
  'auto_promote_waitlist',
]

export async function getRegistrationSettings(
  client: RegistrationConfigClient = db
): Promise<RegistrationSettings> {
  const store = (client as any)?.systemConfig
  // shortcut: mocks without findMany fall back to defaults; remove once every test mock supplies findMany.
  const rows: Array<{ key: string; value: string }> =
    store && typeof store.findMany === 'function'
      ? await store.findMany({ where: { key: { in: REGISTRATION_CONFIG_KEYS } } })
      : []

  const values = new Map(rows.map((row) => [row.key, row.value]))

  const positiveInt = (raw: string | undefined, fallback: number) => {
    const parsed = parseInt(raw ?? '', 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
  }
  const strictBool = (raw: string | undefined, fallback: boolean) =>
    raw === 'true' ? true : raw === 'false' ? false : fallback

  return {
    totalCapacity: positiveInt(values.get('total_venue_capacity'), 450),
    maxOnlineQuota: positiveInt(values.get('max_online_quota'), 450),
    isRegistrationOpen: strictBool(values.get('is_registration_open'), true),
    autoPromoteWaitlist: strictBool(values.get('auto_promote_waitlist'), true),
  }
}

export async function getSystemConfig(key: string, defaultValue: string = ''): Promise<string> {
  const config = await db.systemConfig.findUnique({
    where: { key },
  })
  return config ? config.value : defaultValue
}

export async function setSystemConfig(key: string, value: string) {
  return await db.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}
