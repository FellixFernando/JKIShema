import { db } from '@/lib/db'

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
