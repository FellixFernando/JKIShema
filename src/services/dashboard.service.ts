import { db } from '@/lib/db'
import { RegistrationStatus } from '@prisma/client'

export async function getDashboardStats() {
  const maxQuotaConfig = await db.systemConfig.findUnique({
    where: { key: 'max_online_quota' },
  })
  const maxOnlineQuota = maxQuotaConfig ? parseInt(maxQuotaConfig.value, 10) : 400

  const totalRegistered = await db.participant.count({
    where: { status: { in: ['REGISTERED', 'CHECKED_IN'] } },
  })

  const onlineCount = await db.participant.count({
    where: { registration_type: 'ONLINE', status: { in: ['REGISTERED', 'CHECKED_IN'] } },
  })

  const onSiteCount = await db.participant.count({
    where: { registration_type: 'ON_SITE', status: { in: ['REGISTERED', 'CHECKED_IN'] } },
  })

  const checkedInCount = await db.participant.count({
    where: { status: 'CHECKED_IN' },
  })

  const cancelledCount = await db.participant.count({
    where: { status: 'CANCELLED' },
  })

  return {
    totalCapacity: 440,
    maxOnlineQuota,
    totalRegistered,
    onlineCount,
    onSiteCount,
    checkedInCount,
    cancelledCount,
    remainingOnlineQuota: Math.max(0, maxOnlineQuota - onlineCount),
  }
}

export interface GetParticipantsParams {
  search?: string
  status?: RegistrationStatus | 'ALL'
}

export async function getParticipants({ search, status }: GetParticipantsParams) {
  const where: any = {}

  if (status && status !== 'ALL') {
    where.status = status
  }

  if (search && search.trim() !== '') {
    const term = search.trim()
    where.OR = [
      { full_name: { contains: term, mode: 'insensitive' } },
      { whatsapp_number: { contains: term } },
    ]
  }

  return await db.participant.findMany({
    where,
    orderBy: { created_at: 'desc' },
  })
}
