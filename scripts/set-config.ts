import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { CONFIG_KEYS, parseSetConfigArgs, type ConfigKey } from '../src/lib/config-args'
import { getRegistrationSettings } from '../src/services/config.service'

const prisma = new PrismaClient()

const USAGE = `Usage: npm run set-config -- --list
       npm run set-config -- <key> <value>

Keys:
  total_venue_capacity  <positive integer>  Refuses to go below the current active count
  max_online_quota      <positive integer>  Legacy; kept in sync with capacity
  is_registration_open  <true|false>        Public registration switch
  auto_promote_waitlist <true|false>        Set false on 18 Dec so walk-ins take freed seats

Example: npm run set-config -- auto_promote_waitlist false`

async function list() {
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: [...CONFIG_KEYS] } } })
  const stored = new Map(rows.map((row) => [row.key, row.value]))
  const effective = await getRegistrationSettings(prisma)
  const values: Record<ConfigKey, string> = {
    total_venue_capacity: String(effective.totalCapacity),
    max_online_quota: String(effective.maxOnlineQuota),
    is_registration_open: String(effective.isRegistrationOpen),
    auto_promote_waitlist: String(effective.autoPromoteWaitlist),
  }
  for (const key of CONFIG_KEYS) {
    const raw = stored.get(key)
    const source = raw === undefined ? 'default' : `stored=${raw}`
    console.log(`${key.padEnd(22)} effective=${values[key].padEnd(6)} ${source}`)
  }
}

async function setConfig(key: ConfigKey, value: string) {
  if (key === 'total_venue_capacity') {
    const active = await prisma.participant.count({
      where: { status: { in: ['REGISTERED', 'CHECKED_IN'] } },
    })
    if (Number(value) < active) {
      throw new Error(
        `Refused: ${active} participants already hold a seat, so capacity cannot drop to ${value}.`
      )
    }
  }
  await prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } })
  console.log(`${key} = ${value}`)
}

async function main() {
  const args = parseSetConfigArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    return
  }
  if (args.list) {
    await list()
    return
  }
  if (!args.key || args.value === undefined) {
    console.log(USAGE)
    return
  }
  await setConfig(args.key, args.value)
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
