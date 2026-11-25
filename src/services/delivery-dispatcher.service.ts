import { db } from '@/lib/db'
import { deliverParticipantTicket } from '@/services/whatsapp.service'

export interface DeliveryDispatchResult {
  enabled: boolean
  cap: number
  attempted: number
  sent: number
  failed: number
  remaining: number
  stoppedOnConfigError: boolean
}

const DEFAULT_CAP = 249
const DAY_MS = 24 * 60 * 60 * 1000

function resolveCap(): number {
  const parsed = parseInt(process.env.WHATSAPP_DAILY_SEND_CAP ?? String(DEFAULT_CAP), 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CAP
}

/**
 * Dispatches pending ticket deliveries within the rolling 24h send budget.
 * Fail-closed: sends nothing unless WHATSAPP_SENDING_ENABLED === 'true'.
 */
export async function dispatchPendingTickets({
  now = new Date(),
}: { now?: Date } = {}): Promise<DeliveryDispatchResult> {
  const enabled = process.env.WHATSAPP_SENDING_ENABLED === 'true'
  const cap = resolveCap()

  if (!enabled) {
    return { enabled: false, cap, attempted: 0, sent: 0, failed: 0, remaining: 0, stoppedOnConfigError: false }
  }

  // Every attempt counts against the budget, regardless of its outcome.
  const used = await db.whatsAppDeliveryAttempt.count({
    where: { created_at: { gte: new Date(now.getTime() - DAY_MS) } },
  })

  const budget = Math.max(0, cap - used)
  const result: DeliveryDispatchResult = {
    enabled: true,
    cap,
    attempted: 0,
    sent: 0,
    failed: 0,
    remaining: budget,
    stoppedOnConfigError: false,
  }

  if (budget === 0) return result

  const rows = await db.whatsAppDelivery.findMany({
    where: {
      status: 'PENDING',
      participant: { status: { in: ['REGISTERED', 'CHECKED_IN'] } },
    },
    orderBy: { created_at: 'asc' },
    take: budget,
    select: { id: true, participant_id: true },
  })

  for (const row of rows) {
    if (!row.participant_id) continue
    result.attempted += 1
    const outcome = await deliverParticipantTicket(row.participant_id)
    if (outcome.success) {
      result.sent += 1
    } else {
      result.failed += 1
      if (outcome.outcome === 'CONFIG_ERROR') {
        result.stoppedOnConfigError = true
        break
      }
    }
  }

  result.remaining = budget - result.attempted
  return result
}
