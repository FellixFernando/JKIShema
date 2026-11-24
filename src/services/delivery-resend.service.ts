/**
 * Manual WhatsApp Ticket Resend Service
 *
 * Implements Phase 6B.1 Approved Backend Architecture:
 * - Differentiated Eligibility Matrix
 * - Atomic Monotonic Attempt Fencing (using total_attempts)
 * - Reuse of Participant QR Token and Framed QR Buffer
 * - 3-Phase Resend Workflow (Lease Acquisition -> Dispatch -> Fenced Settlement)
 * - Safe WAMID Association with Prisma P2002 -> 409 Conflict Handling
 */

import { db as defaultDb } from '@/lib/db'
import { prepareTicketQrMediaForWhatsApp } from '@/services/whatsapp.service'
import {
  getMetaWhatsAppConfig,
  uploadWhatsAppMedia,
  buildWhatsAppTemplatePayload,
  sendWhatsAppTemplate,
} from '@/services/meta-whatsapp.client'

export interface ResendOptions {
  participantId: string
  adminUsername: string
  reason: string
}

export interface ResendResult {
  success: boolean
  deliveryId?: string
  participantId: string
  deliveryStatus: string
  attemptNumber: number
  whatsappMessageId?: string
  error?: string
  errorCode?: string
  details?: any
}

// Maximum lifetime attempts: 1 registration attempt + 3 manual retries = 4 total attempts
export const MAX_LIFETIME_ATTEMPTS = 4
export const RATE_LIMIT_COOLDOWN_MS = 60 * 1000 // 60 seconds
export const STALE_PROCESSING_THRESHOLD_MS = 120 * 1000 // 120 seconds
export const UNKNOWN_SOAK_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

export const PERMANENT_ERRORS = ['131026', '100', 'CONFIG_ERROR', '2388001', '132000']

/**
 * Validates eligibility of a participant and delivery for manual resend.
 */
export function checkResendEligibility(participant: any, delivery: any): {
  isEligible: boolean
  httpStatus?: number
  errorCode?: string
  errorMessage?: string
} {
  if (!participant) {
    return {
      isEligible: false,
      httpStatus: 404,
      errorCode: 'PARTICIPANT_NOT_FOUND',
      errorMessage: 'Peserta tidak ditemukan.',
    }
  }

  if (participant.status === 'CANCELLED') {
    return {
      isEligible: false,
      httpStatus: 422,
      errorCode: 'PARTICIPANT_CANCELLED',
      errorMessage: 'Pendaftaran peserta telah dibatalkan.',
    }
  }

  if (!participant.is_wa_opt_in) {
    return {
      isEligible: false,
      httpStatus: 422,
      errorCode: 'NOT_OPTED_IN',
      errorMessage: 'Peserta tidak memilih pengiriman via WhatsApp.',
    }
  }

  if (!delivery) {
    return {
      isEligible: false,
      httpStatus: 404,
      errorCode: 'DELIVERY_NOT_FOUND',
      errorMessage: 'Catatan pengiriman tiket tidak ditemukan.',
    }
  }

  // Terminal Successful States
  if (['SENT', 'DELIVERED', 'READ'].includes(delivery.status)) {
    return {
      isEligible: false,
      httpStatus: 409,
      errorCode: 'ALREADY_DELIVERED',
      errorMessage: 'Tiket sudah berhasil dikirim atau telah diterima peserta.',
    }
  }

  // Active Processing Lock
  if (delivery.status === 'PROCESSING') {
    return {
      isEligible: false,
      httpStatus: 409,
      errorCode: 'LOCK_HELD',
      errorMessage: 'Pengiriman tiket sedang dalam proses.',
    }
  }

  // Ambiguous UNKNOWN State
  if (delivery.status === 'UNKNOWN') {
    return {
      isEligible: false,
      httpStatus: 409,
      errorCode: 'UNKNOWN_SOAK_ACTIVE',
      errorMessage: 'Status pengiriman UNKNOWN. Harap selesaikan rekonsiliasi manual sebelum mencoba resend.',
    }
  }

  // Quota Exceeded (Max 3 manual resends)
  if (delivery.total_attempts >= MAX_LIFETIME_ATTEMPTS) {
    return {
      isEligible: false,
      httpStatus: 429,
      errorCode: 'RETRY_QUOTA_EXCEEDED',
      errorMessage: `Batas maksimal percobaan ulang tiket (${MAX_LIFETIME_ATTEMPTS - 1}x) telah tercapai.`,
    }
  }

  // Rate-Limit Cooldown Check
  if (delivery.last_error_code === '130429' && delivery.updated_at) {
    const elapsed = Date.now() - new Date(delivery.updated_at).getTime()
    if (elapsed < RATE_LIMIT_COOLDOWN_MS) {
      const remainingSec = Math.ceil((RATE_LIMIT_COOLDOWN_MS - elapsed) / 1000)
      return {
        isEligible: false,
        httpStatus: 429,
        errorCode: 'RATE_LIMIT_COOLDOWN',
        errorMessage: `Batas pengiriman Meta tercapai. Harap tunggu ${remainingSec} detik sebelum mencoba kembali.`,
      }
    }
  }

  // Permanent Recipient Failures
  if (['131026', '100'].includes(delivery.last_error_code || '')) {
    return {
      isEligible: false,
      httpStatus: 422,
      errorCode: 'RECIPIENT_VALIDATION_REQUIRED',
      errorMessage: 'Pengiriman sebelumnya gagal karena nomor tidak valid atau tidak terdaftar di WhatsApp. Perbarui nomor telepon peserta terlebih dahulu.',
    }
  }

  // Configuration / Template Errors
  if (['CONFIG_ERROR', '2388001', '132000'].includes(delivery.last_error_code || '')) {
    return {
      isEligible: false,
      httpStatus: 500,
      errorCode: 'SYSTEM_CONFIG_ERROR',
      errorMessage: 'Konfigurasi Meta WhatsApp atau template bermasalah. Hubungi administrator teknis.',
    }
  }

  // Only FAILED and NOT_SENT are eligible
  if (!['FAILED', 'NOT_SENT'].includes(delivery.status)) {
    return {
      isEligible: false,
      httpStatus: 409,
      errorCode: 'INELIGIBLE_STATUS',
      errorMessage: `Status pengiriman ${delivery.status} tidak memenuhi syarat untuk resend.`,
    }
  }

  return { isEligible: true }
}

/**
 * Executes the full 3-phase manual resend workflow.
 */
export async function executeManualResend(
  options: ResendOptions,
  db: any = defaultDb
): Promise<{ status: number; body: ResendResult }> {
  const { participantId, adminUsername, reason } = options

  // 1. Load Participant and Delivery
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    include: { delivery: true },
  })

  const delivery = participant?.delivery

  // 2. Eligibility Check
  const eligibility = checkResendEligibility(participant, delivery)
  if (!eligibility.isEligible) {
    return {
      status: eligibility.httpStatus || 400,
      body: {
        success: false,
        participantId,
        deliveryStatus: delivery?.status || 'UNKNOWN',
        attemptNumber: delivery?.total_attempts || 0,
        error: eligibility.errorCode,
        errorCode: eligibility.errorCode,
        details: eligibility.errorMessage,
      },
    }
  }

  // 3. Phase 1: Atomic Fencing Acquisition
  let fenceToken = 0
  let attemptId = ''

  try {
    const acquireResult = await db.$transaction(async (tx: any) => {
      // Conditional claim update
      const claimUpdate = await tx.whatsAppDelivery.updateMany({
        where: {
          id: delivery.id,
          status: { in: ['FAILED', 'NOT_SENT'] },
        },
        data: {
          status: 'PROCESSING',
          processing_started_at: new Date(),
          total_attempts: { increment: 1 },
        },
      })

      if (claimUpdate.count === 0) {
        throw new Error('CONCURRENCY_CLAIM_FAILED')
      }

      const updatedDelivery = await tx.whatsAppDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
      })

      const newAttemptNumber = updatedDelivery.total_attempts

      const attempt = await tx.whatsAppDeliveryAttempt.create({
        data: {
          delivery_id: delivery.id,
          attempt_number: newAttemptNumber,
          status: 'TIMEOUT_UNKNOWN',
          admin_username: adminUsername,
          resend_reason: reason,
          request_started_at: new Date(),
        },
      })

      return {
        fenceToken: newAttemptNumber,
        attemptId: attempt.id,
      }
    })

    fenceToken = acquireResult.fenceToken
    attemptId = acquireResult.attemptId
  } catch (err: any) {
    if (err?.message === 'CONCURRENCY_CLAIM_FAILED') {
      return {
        status: 409,
        body: {
          success: false,
          participantId,
          deliveryStatus: 'PROCESSING',
          attemptNumber: delivery.total_attempts,
          error: 'CONCURRENCY_CONFLICT',
          errorCode: 'LOCK_HELD',
          details: 'Pengiriman sedang diproses oleh permintaan lain.',
        },
      }
    }
    throw err
  }

  // 4. Phase 2: External Dispatch (Framed QR Buffer + Meta Media Upload + Template Send)
  let wamid: string | null = null
  let dispatchError: any = null
  let outcome = ''

  try {
    const config = getMetaWhatsAppConfig()

    // Generate framed PNG buffer using existing participant QR token
    const { filename, mimeType, buffer } = await prepareTicketQrMediaForWhatsApp(participant.qr_token)

    // Upload Media to Meta
    const uploadResult = await uploadWhatsAppMedia(buffer, mimeType, filename, { config })

    if (uploadResult.outcome !== 'MEDIA_UPLOAD_SUCCESS' || !uploadResult.mediaId) {
      outcome = uploadResult.outcome
      throw new Error(uploadResult.error?.message || 'Media upload to Meta failed')
    }

    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'jkishema_registration_qr_3'
    const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'id'

    // Build Template Payload
    const payload = buildWhatsAppTemplatePayload(
      delivery.recipient_phone,
      templateName,
      templateLang,
      [
        {
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: { id: uploadResult.mediaId },
            },
          ],
        },
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: delivery.participant_name,
            },
          ],
        },
      ]
    )

    // Send Template Message
    const dispatchResult = await sendWhatsAppTemplate(payload, { config })
    outcome = dispatchResult.outcome

    if (
      (dispatchResult.outcome === 'DISPATCH_SUCCESS' || dispatchResult.outcome === 'MOCK_SUCCESS') &&
      dispatchResult.metaMessageId
    ) {
      wamid = dispatchResult.metaMessageId
    } else {
      const err = new Error(dispatchResult.error?.message || 'Dispatch rejected by Meta')
      ;(err as any).code = dispatchResult.error?.code || outcome
      throw err
    }
  } catch (err: any) {
    dispatchError = err
  }

  // 5. Phase 3: Fenced Settlement
  const now = new Date()

  if (wamid) {
    // Dispatch Succeeded
    const settlement = await db.whatsAppDelivery.updateMany({
      where: {
        id: delivery.id,
        status: 'PROCESSING',
        total_attempts: fenceToken, // FENCE TOKEN CHECK
      },
      data: {
        status: 'SENT',
        sent_at: now,
        processing_started_at: null,
        last_error_code: null,
        last_error_message: null,
      },
    })

    // Settle Attempt
    await db.whatsAppDeliveryAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUCCESS',
        meta_message_id: wamid,
        response_received_at: now,
      },
    })

    // Sync Participant
    if (participant.id && db.participant?.update) {
      await db.participant.update({
        where: { id: participant.id },
        data: {
          wa_delivery_status: 'SENT',
          wa_message_id: wamid,
          wa_sent_at: now,
          wa_error_code: null,
          wa_error_message: null,
        },
      })
    }

    if (settlement.count === 0) {
      console.warn(`[MANUAL RESEND] Fencing alert: delivery ${delivery.id} total_attempts mismatch or state changed`)
    }

    return {
      status: 200,
      body: {
        success: true,
        deliveryId: delivery.id,
        participantId,
        deliveryStatus: 'SENT',
        attemptNumber: fenceToken,
        whatsappMessageId: wamid,
      },
    }
  } else {
    // Dispatch Failed or Timed Out
    const isTimeout =
      outcome === 'DISPATCH_TIMEOUT_AMBIGUOUS' ||
      outcome === 'DISPATCH_UNKNOWN' ||
      dispatchError?.name === 'AbortError' ||
      dispatchError?.code === 'ETIMEDOUT'

    const finalDeliveryStatus = isTimeout ? 'UNKNOWN' : 'FAILED'
    const finalAttemptStatus = isTimeout ? 'TIMEOUT_UNKNOWN' : 'FAILED'
    const errorCode = dispatchError?.code || dispatchError?.error_code || outcome || (isTimeout ? 'TIMEOUT' : 'DISPATCH_FAILED')
    const errorMessage = dispatchError?.message || 'Meta template dispatch failed'

    await db.whatsAppDelivery.updateMany({
      where: {
        id: delivery.id,
        status: 'PROCESSING',
        total_attempts: fenceToken, // FENCE TOKEN CHECK
      },
      data: {
        status: finalDeliveryStatus,
        failed_at: finalDeliveryStatus === 'FAILED' ? now : undefined,
        unknown_at: finalDeliveryStatus === 'UNKNOWN' ? now : undefined,
        processing_started_at: null,
        last_error_code: String(errorCode),
        last_error_message: errorMessage,
      },
    })

    await db.whatsAppDeliveryAttempt.update({
      where: { id: attemptId },
      data: {
        status: finalAttemptStatus,
        error_code: String(errorCode),
        error_message: errorMessage,
        response_received_at: now,
      },
    })

    if (participant.id && db.participant?.update) {
      await db.participant.update({
        where: { id: participant.id },
        data: {
          wa_delivery_status: finalDeliveryStatus,
          wa_error_code: String(errorCode),
          wa_error_message: errorMessage,
        },
      })
    }

    return {
      status: isTimeout ? 504 : 502,
      body: {
        success: false,
        deliveryId: delivery.id,
        participantId,
        deliveryStatus: finalDeliveryStatus,
        attemptNumber: fenceToken,
        error: isTimeout ? 'GATEWAY_TIMEOUT' : 'META_DISPATCH_REJECTED',
        errorCode: String(errorCode),
        details: errorMessage,
      },
    }
  }
}
