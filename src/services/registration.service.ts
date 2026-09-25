import { db } from '@/lib/db'
import { ChurchStatus } from '@prisma/client'
import { sendWhatsAppMessage } from './whatsapp.service'
import crypto from 'crypto'

export interface SingleParticipantInput {
  full_name: string
  whatsapp_number: string
  church_status: ChurchStatus
  church_branch?: string
  is_child?: boolean
  is_wa_opt_in: boolean
}

export async function registerParticipant(input: SingleParticipantInput) {
  if (!input.is_wa_opt_in) {
    throw new Error('Persetujuan (consent) WhatsApp wajib dicentang.')
  }

  // Check quota
  const maxQuotaConfig = await db.systemConfig.findUnique({
    where: { key: 'max_online_quota' },
  })
  const maxQuota = maxQuotaConfig ? parseInt(maxQuotaConfig.value, 10) : 400

  const currentCount = await db.participant.count({
    where: {
      registration_type: 'ONLINE',
      status: { in: ['REGISTERED', 'CHECKED_IN'] },
    },
  })

  if (currentCount >= maxQuota) {
    throw new Error('Kuota pendaftaran online telah penuh.')
  }

  // Duplicate check (case-insensitive & whitespace trimmed)
  const existing = await db.participant.findFirst({
    where: {
      full_name: input.full_name.trim(),
      whatsapp_number: input.whatsapp_number.trim(),
      status: { in: ['REGISTERED', 'CHECKED_IN'] },
    },
  })

  if (existing) {
    throw new Error('Peserta dengan Nama dan Nomor WhatsApp tersebut sudah terdaftar.')
  }

  const qr_token = crypto.randomUUID()

  const participant = await db.participant.create({
    data: {
      full_name: input.full_name.trim(),
      whatsapp_number: input.whatsapp_number.trim(),
      church_status: input.church_status,
      church_branch: input.church_branch?.trim() || null,
      is_child: input.is_child || false,
      is_wa_opt_in: input.is_wa_opt_in,
      qr_token,
      status: 'REGISTERED',
      registration_type: 'ONLINE',
    },
  })

  // Send Mock WhatsApp message containing only QR Code
  await sendWhatsAppMessage(
    participant.whatsapp_number,
    `Halo ${participant.full_name}, berikut adalah QR Code unik untuk tiket masuk Christmas Celebration JKI Shema Anda:\nhttps://jkishema.com/ticket/${qr_token}`
  )

  return participant
}
