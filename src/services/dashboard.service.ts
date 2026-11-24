import { db } from '@/lib/db'
import { RegistrationStatus, WhatsAppDeliveryStatus } from '@prisma/client'

export const VALID_WA_DELIVERY_STATUSES: WhatsAppDeliveryStatus[] = [
  'NOT_SENT',
  'PENDING',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'UNKNOWN',
  'CANCELLED',
]

export interface WhatsAppDeliveryStats {
  not_sent: number
  pending: number
  processing: number
  sent: number
  delivered: number
  read: number
  failed: number
  unknown: number
  cancelled: number
  total: number
}

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

  // WhatsApp Delivery aggregation via groupBy to avoid N+1 queries
  const deliveryGroups = db.whatsAppDelivery && typeof db.whatsAppDelivery.groupBy === 'function'
    ? await db.whatsAppDelivery.groupBy({
        by: ['status'],
        _count: { _all: true },
      })
    : []

  const whatsappDeliveryStats: WhatsAppDeliveryStats = {
    not_sent: 0,
    pending: 0,
    processing: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    unknown: 0,
    cancelled: 0,
    total: 0,
  }

  for (const group of deliveryGroups) {
    const statusKey = group.status.toLowerCase() as keyof Omit<WhatsAppDeliveryStats, 'total'>
    const count = group._count._all || 0
    if (statusKey in whatsappDeliveryStats) {
      whatsappDeliveryStats[statusKey] = count
      whatsappDeliveryStats.total += count
    }
  }

  return {
    totalCapacity: 440,
    maxOnlineQuota,
    totalRegistered,
    onlineCount,
    onSiteCount,
    checkedInCount,
    cancelledCount,
    remainingOnlineQuota: Math.max(0, maxOnlineQuota - onlineCount),
    whatsappDeliveryStats,
  }
}

export interface GetParticipantsParams {
  search?: string
  status?: RegistrationStatus | 'ALL'
  waStatus?: WhatsAppDeliveryStatus | 'ALL' | 'NO_DELIVERY'
  registrationType?: 'ALL' | 'ONLINE' | 'ON_SITE'
}

export async function getParticipants({ search, status, waStatus, registrationType }: GetParticipantsParams) {
  const where: any = {}

  if (status && status !== 'ALL') {
    where.status = status
  }

  if (registrationType && registrationType !== 'ALL') {
    where.registration_type = registrationType
  }

  if (search && search.trim() !== '') {
    const term = search.trim()
    where.OR = [
      { full_name: { contains: term, mode: 'insensitive' } },
      { whatsapp_number: { contains: term } },
    ]
  }

  if (waStatus && waStatus !== 'ALL') {
    if (waStatus === 'NO_DELIVERY') {
      where.delivery = null
    } else {
      where.delivery = {
        status: waStatus,
      }
    }
  }

  const participants = await db.participant.findMany({
    where,
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      full_name: true,
      whatsapp_number: true,
      church_status: true,
      church_branch: true,
      is_child: true,
      status: true,
      registration_type: true,
      checked_in_at: true,
      created_at: true,
      delivery: {
        select: {
          id: true,
          status: true,
          total_attempts: true,
          last_error_code: true,
          updated_at: true,
        },
      },
    },
  })

  return participants.map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    whatsapp_number: p.whatsapp_number,
    church_status: p.church_status,
    church_branch: p.church_branch,
    is_child: p.is_child,
    status: p.status,
    registration_type: p.registration_type,
    checked_in_at: p.checked_in_at,
    created_at: p.created_at,
    delivery: p.delivery
      ? {
          id: p.delivery.id,
          status: p.delivery.status,
          total_attempts: p.delivery.total_attempts,
          last_error_code: p.delivery.last_error_code,
          updated_at: p.delivery.updated_at,
        }
      : null,
  }))
}

export async function cancelParticipant(participantId: string) {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
  })

  if (!participant) {
    throw new Error('Peserta tidak ditemukan.')
  }

  if (participant.status === 'CANCELLED') {
    throw new Error('Peserta ini sudah dibatalkan sebelumnya.')
  }

  if (participant.status === 'CHECKED_IN') {
    throw new Error('Peserta yang sudah Check-In tidak dapat dibatalkan.')
  }

  return await db.participant.update({
    where: { id: participantId },
    data: {
      status: 'CANCELLED',
    },
  })
}

