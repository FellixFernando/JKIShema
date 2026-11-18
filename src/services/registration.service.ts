import { db } from '@/lib/db'
import { ChurchStatus } from '@prisma/client'
import { normalizeWhatsAppNumber } from '@/lib/phone'
import { deliverParticipantTicket } from './whatsapp.service'
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
  const result = await registerBatchParticipants([input])
  return result[0]
}

export async function registerBatchParticipants(inputs: SingleParticipantInput[]) {
  if (!inputs || inputs.length === 0) {
    throw new Error('Data peserta tidak boleh kosong.')
  }

  const rawPrimaryWA = inputs[0].whatsapp_number ? inputs[0].whatsapp_number.trim() : ''
  if (!rawPrimaryWA && !inputs[0].is_child) {
    throw new Error('Nomor WhatsApp pendaftar utama wajib diisi.')
  }
  const primaryWA = rawPrimaryWA ? normalizeWhatsAppNumber(rawPrimaryWA) : ''

  // Assign primary WA to children, validate opt-in, and normalize numbers to E.164 (628...)
  const sanitizedInputs = inputs.map((item, idx) => {
    const isChild = Boolean(item.is_child)
    const rawTargetWA = isChild
      ? (item.whatsapp_number ? item.whatsapp_number.trim() : primaryWA)
      : (item.whatsapp_number ? item.whatsapp_number.trim() : '')

    if (!rawTargetWA) {
      throw new Error(`Nomor WhatsApp untuk peserta ke-${idx + 1} (${item.full_name}) wajib diisi.`)
    }

    if (!item.is_wa_opt_in) {
      throw new Error(`Persetujuan WhatsApp wajib dicentang untuk peserta ${item.full_name}.`)
    }

    const normalizedWA = normalizeWhatsAppNumber(rawTargetWA)

    return {
      ...item,
      full_name: item.full_name.trim(),
      whatsapp_number: normalizedWA,
      is_child: isChild,
    }
  })

  // Validate duplicate within the incoming batch itself
  const seenBatchKeys = new Set<string>()
  for (const p of sanitizedInputs) {
    const key = `${p.full_name.toLowerCase()}::${p.whatsapp_number}`
    if (seenBatchKeys.has(key)) {
      throw new Error(`Peserta dengan Nama "${p.full_name}" dan Nomor WhatsApp tersebut terdaftar ganda di formulir.`)
    }
    seenBatchKeys.add(key)
  }

  // Check quota for the entire batch
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

  if (currentCount + sanitizedInputs.length > maxQuota) {
    if (sanitizedInputs.length === 1) {
      throw new Error('Kuota pendaftaran online telah penuh.')
    }
    throw new Error('Kuota pendaftaran online tidak mencukupi untuk jumlah peserta ini.')
  }

  // Validate duplicate for each participant in batch, considering legacy 08... formats
  for (const participantData of sanitizedInputs) {
    const legacyPhone = '08' + participantData.whatsapp_number.slice(3)
    const phoneVariants = [participantData.whatsapp_number, legacyPhone]

    const existing = await db.participant.findFirst({
      where: {
        full_name: participantData.full_name,
        whatsapp_number: { in: phoneVariants },
        status: { in: ['REGISTERED', 'CHECKED_IN'] },
      },
    })

    if (existing) {
      throw new Error(`Peserta dengan Nama "${participantData.full_name}" dan Nomor WhatsApp tersebut sudah terdaftar.`)
    }
  }

  // Atomic database transaction to persist Participants and WhatsAppDelivery records
  const executeInTx = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    if (typeof db.$transaction === 'function') {
      return db.$transaction(fn)
    }
    return fn(db)
  }

  const createdParticipants = await executeInTx(async (tx) => {
    const list = []
    for (const item of sanitizedInputs) {
      const qr_token = crypto.randomUUID()
      const participant = await tx.participant.create({
        data: {
          full_name: item.full_name,
          whatsapp_number: item.whatsapp_number,
          church_status: item.church_status,
          church_branch: item.church_branch?.trim() || null,
          is_child: item.is_child,
          is_wa_opt_in: item.is_wa_opt_in,
          qr_token,
          status: 'REGISTERED',
          registration_type: 'ONLINE',
          wa_delivery_status: 'PENDING',
        },
      })

      await tx.whatsAppDelivery.create({
        data: {
          participant_id: participant.id,
          participant_name: participant.full_name,
          qr_token_snapshot: qr_token,
          recipient_phone: participant.whatsapp_number,
          status: 'PENDING',
          total_attempts: 0,
        },
      })

      list.push(participant)
    }
    return list
  })

  // Execute WhatsApp delivery pipeline synchronously after the registration transaction completes.
  // Failure in WhatsApp delivery MUST NOT roll back or cancel successful participant registration.
  for (const participant of createdParticipants) {
    try {
      await deliverParticipantTicket(participant.id)
    } catch (dispatchErr) {
      console.error(
        `[REGISTRATION] WhatsApp delivery pipeline exception for participant ${participant.id}:`,
        dispatchErr
      )
    }
  }

  return createdParticipants
}
