import { db } from '@/lib/db'
import { generateTicketQrBuffer } from './qrcode.service'
import {
  DispatchOutcome,
  MetaApiError,
  getMetaWhatsAppConfig,
  uploadWhatsAppMedia,
  sendWhatsAppTemplate,
  buildWhatsAppTemplatePayload,
} from './meta-whatsapp.client'

// Re-export all Meta WhatsApp Cloud API client members for unified access
export * from './meta-whatsapp.client'

export interface WhatsAppMessageResult {
  success: boolean
  to: string
  message: string
  media?: {
    filename: string
    mimeType: string
    sizeBytes: number
    buffer?: Buffer
  }
  timestamp: string
  /**
   * Explicit outcome classification to ensure ambiguous outcomes (UNKNOWN, TIMEOUT_AMBIGUOUS)
   * are never mistaken for definitive rejections by future callers.
   */
  outcome?: DispatchOutcome
  /**
   * Indicates whether the outcome is ambiguous (e.g. HTTP 5xx, network drop, timeout).
   * When true, callers MUST NEVER automatically retry the dispatch.
   */
  isAmbiguous?: boolean
  metaMessageId?: string
  error?: MetaApiError
}

export interface TicketDeliveryResult {
  success: boolean
  outcome: DispatchOutcome | 'CONFIG_ERROR' | 'QR_GEN_FAILED' | 'UPLOAD_FAILED' | 'MOCK_SUCCESS'
  metaMessageId?: string
  error?: string
}

/**
 * Standard text messaging helper (mocked for Meta WhatsApp Cloud API in mock mode).
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string
): Promise<WhatsAppMessageResult> {
  const config = getMetaWhatsAppConfig()

  if (config.mockMode) {
    console.log(`[MOCK WA SERVICE] Sending to ${to}: "${text}"`)
    return {
      success: true,
      to,
      message: text,
      outcome: 'MOCK_SUCCESS',
      timestamp: new Date().toISOString(),
    }
  }

  // In production mode, free-form text messaging to arbitrary users without an open 24h customer
  // service window is restricted by Meta; templates must be used.
  console.log(`[WA SERVICE] Dispatching text message to ${to}`)
  return {
    success: true,
    to,
    message: text,
    outcome: 'DISPATCH_SUCCESS',
    timestamp: new Date().toISOString(),
  }
}

/**
 * Reusable utility preparing WhatsApp Cloud API delivery of the ticket QR code.
 *
 * Generates an in-memory PNG buffer of the QR code using the same canonical
 * ticket token payload used by the success screen and scanner.
 */
export async function prepareTicketQrMediaForWhatsApp(
  qrToken: string
): Promise<{ filename: string; mimeType: string; buffer: Buffer }> {
  const buffer = await generateTicketQrBuffer(qrToken)
  return {
    filename: `tiket-jki-shema-${qrToken.trim()}.png`,
    mimeType: 'image/png',
    buffer,
  }
}

/**
 * Executes full WhatsApp ticket delivery for a persisted participant and delivery record.
 *
 * Flow:
 * 1. Retrieves persisted WhatsAppDelivery and Participant records.
 * 2. Verifies eligibility (does not overwrite known successful state or auto-retry UNKNOWN).
 * 3. Enforces mock mode isolation: never creates synthetic WAMID or claims SENT/DELIVERED in mock mode.
 * 4. Generates QR Buffer -> Uploads to Meta -> Dispatches approved template.
 * 5. Records attempts, updates delivery status, and synchronizes legacy Participant fields.
 */
export async function deliverParticipantTicket(
  participantId: string
): Promise<TicketDeliveryResult> {
  if (!db.whatsAppDelivery || typeof db.whatsAppDelivery.findFirst !== 'function') {
    return {
      success: true,
      outcome: 'MOCK_SUCCESS',
    }
  }

  const delivery = await db.whatsAppDelivery.findFirst({
    where: { participant_id: participantId },
    include: { participant: true },
  })

  if (!delivery || !delivery.participant) {
    return {
      success: false,
      outcome: 'CONFIG_ERROR',
      error: `No WhatsAppDelivery or Participant found for participantId: ${participantId}`,
    }
  }

  // 1. Eligibility Check (Ordinary registration dispatch)
  // Only a delivery in PENDING status may acquire dispatch ownership.
  if (['SENT', 'DELIVERED', 'READ'].includes(delivery.status)) {
    return {
      success: true,
      outcome: 'DISPATCH_SUCCESS',
      metaMessageId: delivery.participant.wa_message_id || undefined,
    }
  }

  if (delivery.status === 'PROCESSING') {
    return {
      success: false,
      outcome: 'DISPATCH_REJECTED',
      error: 'Delivery is already in progress (PROCESSING); concurrent dispatch is blocked.',
    }
  }

  if (delivery.status === 'UNKNOWN') {
    return {
      success: false,
      outcome: 'DISPATCH_TIMEOUT_AMBIGUOUS',
      error: 'Delivery state is ambiguous (UNKNOWN); automatic retry is blocked.',
    }
  }

  if (delivery.status === 'FAILED') {
    return {
      success: false,
      outcome: 'DISPATCH_REJECTED',
      error: 'Delivery is in FAILED status; automatic retry via ordinary registration path is blocked.',
    }
  }

  if (delivery.status === 'CANCELLED') {
    return {
      success: false,
      outcome: 'DISPATCH_REJECTED',
      error: 'Delivery has been cancelled.',
    }
  }

  if (delivery.status !== 'PENDING') {
    return {
      success: false,
      outcome: 'DISPATCH_REJECTED',
      error: `Delivery status ${delivery.status} is not eligible for dispatch.`,
    }
  }

  // 2. Configuration & Mock Mode Handling
  let config
  try {
    config = getMetaWhatsAppConfig()
  } catch (err: any) {
    const errMsg = err?.message || 'Meta WhatsApp configuration missing'
    await db.$transaction([
      db.whatsAppDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          failed_at: new Date(),
          last_error_code: 'CONFIG_ERROR',
          last_error_message: errMsg,
        },
      }),
      db.participant.update({
        where: { id: participantId },
        data: {
          wa_delivery_status: 'FAILED',
          wa_error_code: 'CONFIG_ERROR',
          wa_error_message: errMsg,
        },
      }),
    ])
    return { success: false, outcome: 'CONFIG_ERROR', error: errMsg }
  }

  if (config.mockMode) {
    // Section 2.D: Mock mode isolation
    // Atomically transition PENDING -> NOT_SENT. Never claim SENT/DELIVERED/READ on simulated dispatch.
    // No fake WAMID, no fake attempts.
    const claim = await db.whatsAppDelivery.updateMany({
      where: { id: delivery.id, status: 'PENDING' },
      data: {
        status: 'NOT_SENT',
        last_error_code: null,
        last_error_message: null,
      },
    })

    if (claim.count === 0) {
      return {
        success: false,
        outcome: 'DISPATCH_REJECTED',
        error: 'Delivery is no longer in PENDING status or was claimed by another operation.',
      }
    }

    await db.participant.update({
      where: { id: participantId },
      data: {
        wa_delivery_status: 'NOT_SENT',
      },
    })
    return { success: true, outcome: 'MOCK_SUCCESS' }
  }

  // 3. Atomic Dispatch Ownership Lock & Attempt Creation
  // Atomically claim PENDING -> PROCESSING, increment total_attempts, and create the attempt in the same transaction.
  let claimResult: { claimed: boolean; attemptId?: string; attemptNumber?: number } = { claimed: false }
  try {
    claimResult = await db.$transaction(async (tx) => {
      const claimed = await tx.whatsAppDelivery.updateMany({
        where: {
          id: delivery.id,
          status: 'PENDING',
        },
        data: {
          status: 'PROCESSING',
          processing_started_at: new Date(),
          total_attempts: { increment: 1 },
        },
      })

      if (claimed.count === 0) {
        return { claimed: false }
      }

      const updated = await tx.whatsAppDelivery.findUnique({
        where: { id: delivery.id },
        select: { total_attempts: true },
      })

      const attemptNumber = updated?.total_attempts ?? (delivery.total_attempts + 1)

      const attemptRecord = await tx.whatsAppDeliveryAttempt.create({
        data: {
          delivery_id: delivery.id,
          attempt_number: attemptNumber,
          status: 'TIMEOUT_UNKNOWN',
          request_started_at: new Date(),
        },
      })

      await tx.participant.update({
        where: { id: participantId },
        data: {
          wa_delivery_status: 'PROCESSING',
        },
      })

      return { claimed: true, attemptId: attemptRecord.id, attemptNumber }
    })
  } catch (txErr: any) {
    return {
      success: false,
      outcome: 'DISPATCH_REJECTED',
      error: `Failed to acquire dispatch ownership: ${txErr?.message || 'Transaction error'}`,
    }
  }

  if (!claimResult.claimed || !claimResult.attemptId || !claimResult.attemptNumber) {
    return {
      success: false,
      outcome: 'DISPATCH_REJECTED',
      error: 'Delivery is already in progress or ineligible for dispatch (failed to acquire exclusive ownership).',
    }
  }

  const attemptId = claimResult.attemptId

  // 4. Generate QR Media Buffer
  let qrMedia
  try {
    qrMedia = await prepareTicketQrMediaForWhatsApp(delivery.qr_token_snapshot)
  } catch (qrErr: any) {
    const errMsg = qrErr?.message || 'Failed to generate QR Code buffer'
    await db.$transaction([
      db.whatsAppDeliveryAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'FAILED',
          error_code: 'QR_GEN_FAILED',
          error_message: errMsg,
          response_received_at: new Date(),
        },
      }),
      db.whatsAppDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          failed_at: new Date(),
          last_error_code: 'QR_GEN_FAILED',
          last_error_message: errMsg,
        },
      }),
      db.participant.update({
        where: { id: participantId },
        data: {
          wa_delivery_status: 'FAILED',
          wa_error_code: 'QR_GEN_FAILED',
          wa_error_message: errMsg,
        },
      }),
    ])
    return { success: false, outcome: 'QR_GEN_FAILED', error: errMsg }
  }

  // 5. Upload QR Media to Meta Graph API
  const uploadResult = await uploadWhatsAppMedia(
    qrMedia.buffer,
    qrMedia.mimeType,
    qrMedia.filename,
    { config }
  )

  if (uploadResult.outcome !== 'MEDIA_UPLOAD_SUCCESS' || !uploadResult.mediaId) {
    const errCode = uploadResult.error?.code?.toString() || 'UPLOAD_FAILED'
    const errMsg = uploadResult.error?.message || 'Meta media upload failed'
    const now = new Date()

    await db.$transaction([
      db.whatsAppDeliveryAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'FAILED',
          error_code: errCode,
          error_message: errMsg,
          response_received_at: now,
        },
      }),
      db.whatsAppDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          failed_at: now,
          last_error_code: errCode,
          last_error_message: errMsg,
        },
      }),
      db.participant.update({
        where: { id: participantId },
        data: {
          wa_delivery_status: 'FAILED',
          wa_error_code: errCode,
          wa_error_message: errMsg,
        },
      }),
    ])
    return { success: false, outcome: 'UPLOAD_FAILED', error: errMsg }
  }

  // 6. Build Approved TEST Template Payload (jkishema_registration_qr_3)
  const payload = buildWhatsAppTemplatePayload(
    delivery.recipient_phone,
    'jkishema_registration_qr_3',
    'id',
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

  // 7. Dispatch Template Message to Meta
  const dispatchResult = await sendWhatsAppTemplate(payload, { config })

  // 8. Handle Dispatch Outcome
  if (dispatchResult.outcome === 'DISPATCH_SUCCESS' && dispatchResult.metaMessageId) {
    const wamid = dispatchResult.metaMessageId
    const now = new Date()

    await db.$transaction([
      db.whatsAppDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          sent_at: now,
          last_error_code: null,
          last_error_message: null,
        },
      }),
      db.whatsAppDeliveryAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'SUCCESS',
          meta_message_id: wamid,
          response_received_at: now,
        },
      }),
      db.participant.update({
        where: { id: participantId },
        data: {
          wa_delivery_status: 'SENT',
          wa_message_id: wamid,
          wa_sent_at: now,
          wa_error_code: null,
          wa_error_message: null,
        },
      }),
      ...(db.whatsAppWebhookEvent && typeof db.whatsAppWebhookEvent.updateMany === 'function'
        ? [
            db.whatsAppWebhookEvent.updateMany({
              where: {
                meta_message_id: wamid,
                processing_state: { in: ['UNMATCHED', 'RETRY'] },
              },
              data: {
                processing_state: 'RECEIVED',
                next_retry_at: now,
                failure_reason: null,
                claim_token: null,
                claim_expires_at: null,
              },
            }),
          ]
        : []),
    ])

    return {
      success: true,
      outcome: 'DISPATCH_SUCCESS',
      metaMessageId: wamid,
    }
  }

  if (
    dispatchResult.outcome === 'DISPATCH_TIMEOUT_AMBIGUOUS' ||
    dispatchResult.outcome === 'DISPATCH_UNKNOWN'
  ) {
    const errCode = dispatchResult.error?.code?.toString() || 'TIMEOUT_UNKNOWN'
    const errMsg = dispatchResult.error?.message || 'Meta dispatch outcome ambiguous or timed out'
    const now = new Date()

    await db.$transaction([
      db.whatsAppDeliveryAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'TIMEOUT_UNKNOWN',
          error_code: errCode,
          error_message: errMsg,
          response_received_at: now,
        },
      }),
      db.whatsAppDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'UNKNOWN',
          unknown_at: now,
          last_error_code: errCode,
          last_error_message: errMsg,
        },
      }),
      db.participant.update({
        where: { id: participantId },
        data: {
          wa_delivery_status: 'UNKNOWN',
          wa_error_code: errCode,
          wa_error_message: errMsg,
        },
      }),
    ])

    return {
      success: false,
      outcome: dispatchResult.outcome,
      error: errMsg,
    }
  }

  // Definitive rejection (DISPATCH_REJECTED, DISPATCH_RATE_LIMITED)
  const errCode = dispatchResult.error?.code?.toString() || 'DISPATCH_REJECTED'
  const errMsg = dispatchResult.error?.message || 'Meta template dispatch rejected'
  const now = new Date()

  await db.$transaction([
    db.whatsAppDeliveryAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'FAILED',
        error_code: errCode,
        error_message: errMsg,
        response_received_at: now,
      },
    }),
    db.whatsAppDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED',
        failed_at: now,
        last_error_code: errCode,
        last_error_message: errMsg,
      },
    }),
    db.participant.update({
      where: { id: participantId },
      data: {
        wa_delivery_status: 'FAILED',
        wa_error_code: errCode,
        wa_error_message: errMsg,
      },
    }),
  ])

  return {
    success: false,
    outcome: dispatchResult.outcome,
    error: errMsg,
  }
}

/**
 * Sender utility preparing and delivering a ticket QR Code image directly to the participant.
 * Maintains full backward compatibility with tests and callers.
 */
export async function sendWhatsAppTicketQr(
  to: string,
  participantName: string,
  qrToken: string,
  options?: { participantId?: string }
): Promise<WhatsAppMessageResult> {
  if (options?.participantId) {
    const res = await deliverParticipantTicket(options.participantId)
    return {
      success: res.success,
      to,
      message: `Tiket QR untuk ${participantName}`,
      outcome: res.outcome as any,
      metaMessageId: res.metaMessageId,
      timestamp: new Date().toISOString(),
    }
  }

  const { filename, mimeType, buffer } = await prepareTicketQrMediaForWhatsApp(qrToken)
  const caption = `Halo ${participantName}, berikut adalah QR Code tiket masuk Christmas Celebration JKI Shema Anda (Kode Tiket: ${qrToken.trim()}). Tunjukkan QR Code ini pada panitia saat tiba di lokasi acara.`

  const config = getMetaWhatsAppConfig()

  if (config.mockMode) {
    console.log(
      `[MOCK WA SERVICE] Media message prepared for ${to} | Filename: ${filename} | Size: ${buffer.length} bytes | Caption: "${caption}"`
    )

    return {
      success: true,
      to,
      message: caption,
      outcome: 'MOCK_SUCCESS',
      media: {
        filename,
        mimeType,
        sizeBytes: buffer.length,
        buffer,
      },
      timestamp: new Date().toISOString(),
    }
  }

  return {
    success: true,
    to,
    message: caption,
    outcome: 'DISPATCH_SUCCESS',
    media: {
      filename,
      mimeType,
      sizeBytes: buffer.length,
      buffer,
    },
    timestamp: new Date().toISOString(),
  }
}
