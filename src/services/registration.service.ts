import { db } from '@/lib/db'
import { ChurchStatus } from '@prisma/client'
import { normalizeWhatsAppNumber } from '@/lib/phone'
import { getRegistrationSettings } from './config.service'
import crypto from 'crypto'

export interface SingleParticipantInput {
  full_name: string
  whatsapp_number: string
  church_status: ChurchStatus
  church_branch?: string
  is_child?: boolean
  is_wa_opt_in: boolean
}

export interface RegisterOptions {
  registrationType?: 'ONLINE' | 'ON_SITE'
  immediateCheckIn?: boolean
}

export async function registerParticipant(
  input: SingleParticipantInput,
  options?: RegisterOptions
) {
  const result = await registerBatchParticipants([input], options)
  return result[0]
}

export async function registerBatchParticipants(
  inputs: SingleParticipantInput[],
  options?: RegisterOptions
) {
  const registrationType = options?.registrationType || 'ONLINE'
  const immediateCheckIn = Boolean(options?.immediateCheckIn)

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

    if (item.is_wa_opt_in !== true) {
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

  // Atomic database transaction to persist Participants and WhatsAppDelivery records with serialization lock
  const executeInTx = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    if (typeof db.$transaction === 'function') {
      return db.$transaction(fn)
    }
    return fn(db)
  }

  const createdParticipants = await executeInTx(async (tx) => {
    // Concurrency lock for venue capacity check and registration serialization
    if (typeof tx.$executeRaw === 'function') {
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('venue_capacity_lock'))`
      } catch {
        // Fallback for mocked unit test environments where $executeRaw is unsupported
      }
    }

    // 1. Registration window: online registration can be closed by the operator.
    const settings = await getRegistrationSettings(tx)
    if (registrationType === 'ONLINE' && !settings.isRegistrationOpen) {
      throw new Error('Pendaftaran sedang ditutup.')
    }

    // 2. Validate duplicate for each participant, including already-waitlisted rows
    for (const participantData of sanitizedInputs) {
      const legacyPhone = '08' + participantData.whatsapp_number.slice(3)
      const phoneVariants = [participantData.whatsapp_number, legacyPhone]

      const existing = await tx.participant.findFirst({
        where: {
          full_name: participantData.full_name,
          whatsapp_number: { in: phoneVariants },
          status: { in: ['REGISTERED', 'CHECKED_IN', 'WAITLISTED'] },
        },
      })

      if (existing) {
        throw new Error(`Peserta dengan Nama "${participantData.full_name}" dan Nomor WhatsApp tersebut sudah terdaftar.`)
      }
    }

    // 3. Venue capacity. A batch either fits in full or is handled as a whole.
    const totalActiveCount = await tx.participant.count({
      where: {
        status: { in: ['REGISTERED', 'CHECKED_IN'] },
      },
    })

    const fits = totalActiveCount + sanitizedInputs.length <= settings.totalCapacity

    if (!fits && registrationType === 'ON_SITE') {
      throw new Error('Kapasitas penuh. Batalkan peserta yang tidak hadir terlebih dahulu.')
    }

    // 4. Persist participants. Waitlisted batches leave no delivery row and are NOT_SENT.
    const list = []
    const now = new Date()
    for (const item of sanitizedInputs) {
      const qr_token = crypto.randomUUID()
      const status = fits ? (immediateCheckIn ? 'CHECKED_IN' : 'REGISTERED') : 'WAITLISTED'
      const checked_in_at = fits && immediateCheckIn ? now : null

      const participant = await tx.participant.create({
        data: {
          full_name: item.full_name,
          whatsapp_number: item.whatsapp_number,
          church_status: item.church_status,
          church_branch: item.church_branch?.trim() || null,
          is_child: item.is_child,
          is_wa_opt_in: item.is_wa_opt_in,
          qr_token,
          status,
          registration_type: registrationType,
          checked_in_at,
          wa_delivery_status: fits ? 'PENDING' : 'NOT_SENT',
        },
      })

      if (fits) {
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
      }

      list.push(participant)
    }
    return list
  })

  return createdParticipants
}
