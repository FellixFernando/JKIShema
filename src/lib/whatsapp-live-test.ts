import QRCode from 'qrcode'
import { normalizeWhatsAppNumber } from './phone'
import {
  uploadWhatsAppMedia,
  sendWhatsAppTemplate,
  buildWhatsAppTemplatePayload,
  getMetaWhatsAppConfig,
  WhatsAppTemplatePayload,
  MediaUploadResult,
  DispatchResult,
  MetaWhatsAppConfig,
} from '@/services/meta-whatsapp.client'

/**
 * Verified Meta WhatsApp Cloud API credentials & template configuration
 * for JKI Shema Sunter Christmas Registration System.
 */
export const VERIFIED_META_TEST_CONFIG = {
  wabaId: '1994584907889578',
  phoneNumberId: '1302620062943874',
  templateName: 'jkishema_registration_qr_3',
  templateId: '1011519341994778',
  templateLang: 'id',
  templateCategory: 'UTILITY',
  bodyParameterValue: 'TEST PARTICIPANT',
  dummyQrPayload: 'TEST ONLY - NOT A VALID EVENT TICKET',
} as const

/**
 * Masks a normalized phone number for safe logging, exposing only leading trunk/country
 * code and trailing 4 digits (e.g. "62812****7890").
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || typeof phone !== 'string') return '****'
  const trimmed = phone.trim()
  if (trimmed.length < 8) return '****'
  const prefix = trimmed.slice(0, 5)
  const suffix = trimmed.slice(-4)
  return `${prefix}****${suffix}`
}

/**
 * Generates an isolated in-memory PNG Buffer of the dummy test QR Code.
 * Clearly encoded with "TEST ONLY - NOT A VALID EVENT TICKET".
 *
 * Uses node-qrcode directly with standard 600px width and 'M' error correction.
 */
export async function generateDummyTestQrBuffer(): Promise<Buffer> {
  return QRCode.toBuffer(VERIFIED_META_TEST_CONFIG.dummyQrPayload, {
    type: 'png',
    width: 600,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}

/**
 * Builds the exact Meta template message payload matching the approved
 * `jki_shema_natal_qr_registration_2` template definition.
 *
 * Header: IMAGE component with { id: mediaId }
 * Body: Exactly one text parameter {{1}} = "TEST PARTICIPANT"
 */
export function buildVerifiedTestTemplatePayload(
  recipientPhone: string,
  mediaId: string
): WhatsAppTemplatePayload {
  return buildWhatsAppTemplatePayload(
    recipientPhone,
    VERIFIED_META_TEST_CONFIG.templateName,
    VERIFIED_META_TEST_CONFIG.templateLang,
    [
      {
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: { id: mediaId },
          },
        ],
      },
      {
        type: 'body',
        parameters: [
          {
            type: 'text',
            text: VERIFIED_META_TEST_CONFIG.bodyParameterValue,
          },
        ],
      },
    ]
  )
}

export interface LiveTestOptions {
  recipientPhone?: string
  isLive?: boolean
  confirmSend?: boolean
  configOverrides?: Partial<MetaWhatsAppConfig>
}

export interface LiveTestResult {
  mode: 'DRY_RUN' | 'LIVE'
  readyForLive: boolean
  dummyQr: {
    payloadText: string
    mimeType: string
    filename: string
    sizeBytes: number
  }
  recipient: {
    rawInput: string
    normalizedE164: string
    maskedPhone: string
  }
  templateConfig: {
    templateName: string
    templateId: string
    language: string
    wabaId: string
    phoneNumberId: string
    headerType: 'IMAGE'
    bodyParamText: string
  }
  constructedPayload: WhatsAppTemplatePayload
  mediaUploadResult?: MediaUploadResult
  dispatchResult?: DispatchResult
  errors?: string[]
}

/**
 * Controlled test runner for WhatsApp Cloud API.
 *
 * By default (isLive: false), executes in DRY-RUN mode:
 * - Generates dummy QR image and inspects size/MIME
 * - Validates recipient normalization
 * - Validates template structure and builds expected JSON payload
 * - MAKES ZERO NETWORK REQUESTS (no upload, no dispatch, no DB touches)
 *
 * Live mode (isLive: true) is strictly gated:
 * - Requires explicit confirmSend: true
 * - Requires WHATSAPP_MOCK_MODE !== 'true'
 * - Requires valid WHATSAPP_CLOUD_API_TOKEN
 * - Validates phone number ID matches verified test ID (1302620062943874)
 * - Sends at most ONE message with no retry loops
 */
export async function runWhatsAppLiveTest(options: LiveTestOptions = {}): Promise<LiveTestResult> {
  const errors: string[] = []

  // 1. Resolve and validate recipient phone number
  const rawRecipient = (
    options.recipientPhone ||
    process.env.WHATSAPP_TEST_RECIPIENT ||
    ''
  ).trim()

  let normalizedRecipient = ''
  let masked = '****'

  if (!rawRecipient) {
    errors.push(
      'Missing test recipient. Please supply a tester phone number via options.recipientPhone, WHATSAPP_TEST_RECIPIENT, or --to=<phone>.'
    )
  } else {
    try {
      normalizedRecipient = normalizeWhatsAppNumber(rawRecipient)
      masked = maskPhoneNumber(normalizedRecipient)
    } catch (err: any) {
      errors.push(`Invalid test recipient number: ${err?.message || 'normalization failed'}`)
    }
  }

  // 2. Generate dummy QR image buffer
  const dummyQrBuffer = await generateDummyTestQrBuffer()

  // 3. Construct template payload (using pending placeholder in dry-run)
  const placeholderMediaId = 'META_MEDIA_ID_PLACEHOLDER_PENDING_UPLOAD'
  const constructedPayload = normalizedRecipient
    ? buildVerifiedTestTemplatePayload(normalizedRecipient, placeholderMediaId)
    : ({} as WhatsAppTemplatePayload)

  const templateConfig = {
    templateName: VERIFIED_META_TEST_CONFIG.templateName,
    templateId: VERIFIED_META_TEST_CONFIG.templateId,
    language: VERIFIED_META_TEST_CONFIG.templateLang,
    wabaId: VERIFIED_META_TEST_CONFIG.wabaId,
    phoneNumberId: VERIFIED_META_TEST_CONFIG.phoneNumberId,
    headerType: 'IMAGE' as const,
    bodyParamText: VERIFIED_META_TEST_CONFIG.bodyParameterValue,
  }

  const dummyQrInfo = {
    payloadText: VERIFIED_META_TEST_CONFIG.dummyQrPayload,
    mimeType: 'image/png',
    filename: 'dummy-test-ticket-qr.png',
    sizeBytes: dummyQrBuffer.length,
  }

  // 4. DRY-RUN MODE: Return validation report without any network calls
  if (!options.isLive) {
    return {
      mode: 'DRY_RUN',
      readyForLive: errors.length === 0,
      dummyQr: dummyQrInfo,
      recipient: {
        rawInput: rawRecipient,
        normalizedE164: normalizedRecipient,
        maskedPhone: masked,
      },
      templateConfig,
      constructedPayload,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  // 5. LIVE EXECUTION SAFETY GATES
  if (!options.confirmSend) {
    throw new Error(
      'SAFETY GATE TRIGGERED: Live dispatch requires explicit confirmation flag (--confirm-send).'
    )
  }

  if (errors.length > 0) {
    throw new Error(`SAFETY GATE TRIGGERED: Cannot proceed with live execution. Errors: ${errors.join('; ')}`)
  }

  const config = getMetaWhatsAppConfig(options.configOverrides)

  if (config.mockMode) {
    throw new Error(
      'SAFETY GATE TRIGGERED: Live dispatch cannot run in mock mode (WHATSAPP_MOCK_MODE must be false).'
    )
  }

  if (config.phoneNumberId !== VERIFIED_META_TEST_CONFIG.phoneNumberId) {
    throw new Error(
      `SAFETY GATE TRIGGERED: WHATSAPP_PHONE_NUMBER_ID (${config.phoneNumberId}) does not match verified Meta Test Phone Number ID (${VERIFIED_META_TEST_CONFIG.phoneNumberId}).`
    )
  }

  // Step A: Upload dummy QR image to Meta
  const uploadResult = await uploadWhatsAppMedia(
    dummyQrBuffer,
    dummyQrInfo.mimeType,
    dummyQrInfo.filename,
    { config }
  )

  if (uploadResult.outcome !== 'MEDIA_UPLOAD_SUCCESS' || !uploadResult.mediaId) {
    return {
      mode: 'LIVE',
      readyForLive: false,
      dummyQr: dummyQrInfo,
      recipient: {
        rawInput: rawRecipient,
        normalizedE164: normalizedRecipient,
        maskedPhone: masked,
      },
      templateConfig,
      constructedPayload,
      mediaUploadResult: uploadResult,
      errors: [
        `Media upload failed with outcome ${uploadResult.outcome}: ${uploadResult.error?.message || 'unknown error'}`,
      ],
    }
  }

  // Step B: Construct live payload with the real uploaded Meta Media ID
  const livePayload = buildVerifiedTestTemplatePayload(
    normalizedRecipient,
    uploadResult.mediaId
  )

  // Step C: Dispatch exactly one template message
  const dispatchResult = await sendWhatsAppTemplate(livePayload, { config })

  return {
    mode: 'LIVE',
    readyForLive: true,
    dummyQr: dummyQrInfo,
    recipient: {
      rawInput: rawRecipient,
      normalizedE164: normalizedRecipient,
      maskedPhone: masked,
    },
    templateConfig,
    constructedPayload: livePayload,
    mediaUploadResult: uploadResult,
    dispatchResult,
  }
}

