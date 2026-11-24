import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { authorizeCleanupTarget } from './e2e-cleanup'
// @ts-ignore
import { validateE2EEnvironment } from '../../scripts/e2e-env-guard'

// Guarantee .env.e2e.local is loaded explicitly for global hooks
const e2eEnvPath = path.resolve(__dirname, '../../.env.e2e.local')
if (fs.existsSync(e2eEnvPath)) {
  dotenv.config({ path: e2eEnvPath, override: true })
}

export interface CleanlinessCounts {
  participants: bigint
  deliveries: bigint
  attempts: bigint
  batches: bigint
  events: bigint
  reconciliations: bigint
  users: bigint
}

export async function verifyGlobalCleanliness(
  phase: 'PRE_SUITE' | 'POST_SUITE',
  prismaInstance?: PrismaClient
): Promise<void> {
  // 1. Fail-closed preflight environment validations
  validateE2EEnvironment(process.env)

  const prisma = prismaInstance || new PrismaClient()

  try {
    // 2. Authorize database target (strictly local jkishema_e2e on port 5432, user tiffany)
    await authorizeCleanupTarget(prisma)

    // 3. Read-only query counting records across all 7 tracked tables
    const result = await prisma.$queryRaw<CleanlinessCounts[]>`
      SELECT
        (SELECT COUNT(*) FROM "Participant") AS participants,
        (SELECT COUNT(*) FROM "WhatsAppDelivery") AS deliveries,
        (SELECT COUNT(*) FROM "WhatsAppDeliveryAttempt") AS attempts,
        (SELECT COUNT(*) FROM "WhatsAppWebhookBatch") AS batches,
        (SELECT COUNT(*) FROM "WhatsAppWebhookEvent") AS events,
        (SELECT COUNT(*) FROM "WhatsAppReconciliationLog") AS reconciliations,
        (SELECT COUNT(*) FROM "User") AS users;
    `

    const row = result[0]
    if (!row) {
      throw new Error(`[CLEANLINESS ERROR] Empty count query result in ${phase}.`)
    }

    const nonZeroTables: string[] = []
    if (Number(row.participants) > 0) nonZeroTables.push(`Participant (${row.participants})`)
    if (Number(row.deliveries) > 0) nonZeroTables.push(`WhatsAppDelivery (${row.deliveries})`)
    if (Number(row.attempts) > 0) nonZeroTables.push(`WhatsAppDeliveryAttempt (${row.attempts})`)
    if (Number(row.batches) > 0) nonZeroTables.push(`WhatsAppWebhookBatch (${row.batches})`)
    if (Number(row.events) > 0) nonZeroTables.push(`WhatsAppWebhookEvent (${row.events})`)
    if (Number(row.reconciliations) > 0) nonZeroTables.push(`WhatsAppReconciliationLog (${row.reconciliations})`)
    if (Number(row.users) > 0) nonZeroTables.push(`User (${row.users})`)

    if (nonZeroTables.length > 0) {
      const label =
        phase === 'PRE_SUITE'
          ? '[PRE-SUITE CLEANLINESS FAILURE]'
          : '[POST-SUITE SURVIVOR FAILURE]'
      throw new Error(
        `${label} Local E2E database "jkishema_e2e" is not clean! Detected non-zero records in: ${nonZeroTables.join(
          ', '
        )}. Automatic truncation is forbidden.`
      )
    }
  } finally {
    // Always disconnect Prisma client if we instantiated it locally
    if (!prismaInstance) {
      await prisma.$disconnect()
    }
  }
}
