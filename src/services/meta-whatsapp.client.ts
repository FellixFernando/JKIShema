import { normalizeWhatsAppNumber } from '@/lib/phone'

/**
 * Outcome classifications for Meta WhatsApp Cloud API operations.
 *
 * Media upload and message dispatch have fundamentally different risk profiles:
 * - Media upload is an internal idempotent asset staging operation (safe to retry on transient failure).
 * - Message dispatch is an external outward participant communication (ambiguous outcomes must NEVER be auto-retried).
 */
export type MediaUploadOutcome =
  | 'MEDIA_UPLOAD_SUCCESS'
  | 'MEDIA_UPLOAD_REJECTED'
  | 'MEDIA_UPLOAD_RATE_LIMITED'
  | 'MEDIA_UPLOAD_TRANSIENT_FAILURE'

export type DispatchOutcome =
  | 'DISPATCH_SUCCESS'
  | 'DISPATCH_REJECTED'
  | 'DISPATCH_RATE_LIMITED'
  | 'DISPATCH_UNKNOWN'
  | 'DISPATCH_TIMEOUT_AMBIGUOUS'
  | 'MOCK_SUCCESS'

export interface MetaApiError {
  message: string
  code?: number
  subcode?: number
  type?: string
  fbtraceId?: string
  errorDataDetails?: string
}

export interface MediaUploadResult {
  outcome: MediaUploadOutcome
  mediaId?: string
  error?: MetaApiError
  httpStatus?: number
  durationMs: number
}

export interface DispatchResult {
  outcome: DispatchOutcome
  metaMessageId?: string
  recipientPhone: string
  error?: MetaApiError
  httpStatus?: number
  durationMs: number
  mock?: boolean
}

export class WhatsAppConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WhatsAppConfigurationError'
  }
}

export interface MetaWhatsAppConfig {
  apiToken: string
  phoneNumberId: string
  apiVersion: string
  mockMode: boolean
  timeoutMs: number
}

/**
 * Sanitizes strings, URLs, or error messages to ensure Bearer tokens and sensitive secrets are never logged.
 */
export function redactSecrets(input: string, tokenToRedact?: string): string {
  if (!input || typeof input !== 'string') return ''
  let sanitized = input.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer ***')
  if (tokenToRedact && tokenToRedact.trim()) {
    sanitized = sanitized.split(tokenToRedact).join('***')
  }
  return sanitized
}

/**
 * Resolves Meta WhatsApp Cloud API configuration from environment variables or overrides.
 *
 * Enforces explicit validation:
 * - In production mode (mockMode !== true), missing credentials throw WhatsAppConfigurationError.
 * - In explicit mock mode, credentials are not required.
 */
export function getMetaWhatsAppConfig(overrides?: Partial<MetaWhatsAppConfig>): MetaWhatsAppConfig {
  const mockMode = overrides?.mockMode ?? (process.env.WHATSAPP_MOCK_MODE === 'true')
  const apiToken = overrides?.apiToken ?? process.env.WHATSAPP_CLOUD_API_TOKEN ?? ''
  const phoneNumberId = overrides?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? ''
  const apiVersion = overrides?.apiVersion ?? process.env.WHATSAPP_API_VERSION ?? 'v22.0'
  const timeoutMs = overrides?.timeoutMs ?? (process.env.WHATSAPP_TIMEOUT_MS ? parseInt(process.env.WHATSAPP_TIMEOUT_MS, 10) : 15000)

  if (!mockMode) {
    if (!apiToken.trim() || !phoneNumberId.trim()) {
      throw new WhatsAppConfigurationError(
        'Meta WhatsApp Cloud API credentials missing: WHATSAPP_CLOUD_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required in production mode.'
      )
    }
  }

  return {
    apiToken,
    phoneNumberId,
    apiVersion,
    mockMode,
    timeoutMs,
  }
}

// ---------------------------------------------------------------------------
// Strongly Typed Template Types (Generic, No Invented Conventions)
// ---------------------------------------------------------------------------

export type WhatsAppComponentType = 'header' | 'body' | 'button'

export interface WhatsAppParameterText {
  type: 'text'
  text: string
}

export interface WhatsAppParameterImage {
  type: 'image'
  image: { id: string } | { link: string }
}

export type WhatsAppParameter = WhatsAppParameterText | WhatsAppParameterImage

export interface WhatsAppTemplateComponent {
  type: WhatsAppComponentType
  sub_type?: 'url' | 'quick_reply'
  index?: number
  parameters: WhatsAppParameter[]
}

export interface WhatsAppTemplatePayload {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'template'
  template: {
    name: string
    language: {
      code: string
    }
    components?: WhatsAppTemplateComponent[]
  }
}

/**
 * Builds a valid Meta WhatsApp template message payload.
 *
 * Normalizes the recipient phone number to E.164 (without leading '+') using normalizeWhatsAppNumber.
 * Validates template name and language code without assuming any specific template convention.
 */
export function buildWhatsAppTemplatePayload(
  to: string,
  templateName: string,
  languageCode: string,
  components?: WhatsAppTemplateComponent[]
): WhatsAppTemplatePayload {
  if (!templateName || !templateName.trim()) {
    throw new Error('Template name cannot be empty.')
  }
  if (!languageCode || !languageCode.trim()) {
    throw new Error('Template language code cannot be empty.')
  }

  const normalizedTo = normalizeWhatsAppNumber(to)

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedTo,
    type: 'template',
    template: {
      name: templateName.trim(),
      language: {
        code: languageCode.trim(),
      },
      ...(components && components.length > 0 ? { components } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// Media Upload Service (POST /{phone-number-id}/media)
// ---------------------------------------------------------------------------

/**
 * Safely composes an internal timeout signal with an optional external caller signal.
 * Ensures an external signal can NEVER disable or override the internal timeout.
 */
export function composeAbortSignals(
  internalSignal: AbortSignal,
  externalSignal?: AbortSignal
): AbortSignal {
  if (!externalSignal) return internalSignal
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([internalSignal, externalSignal])
  }
  const combinedController = new AbortController()
  const onAbort = () => combinedController.abort()
  if (internalSignal.aborted || externalSignal.aborted) {
    combinedController.abort()
    return combinedController.signal
  }
  internalSignal.addEventListener('abort', onAbort, { once: true })
  externalSignal.addEventListener('abort', onAbort, { once: true })
  return combinedController.signal
}

/**
 * Uploads an in-memory image buffer (e.g. PNG QR code) to Meta's WhatsApp Cloud API media endpoint.
 *
 * Policy:
 * - 200 with id -> MEDIA_UPLOAD_SUCCESS
 * - 4xx -> MEDIA_UPLOAD_REJECTED (permanent rejection)
 * - 429 -> MEDIA_UPLOAD_RATE_LIMITED
 * - 5xx / Network / Timeout -> MEDIA_UPLOAD_TRANSIENT_FAILURE (transient, retry eligible)
 */
export async function uploadWhatsAppMedia(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  options?: { config?: MetaWhatsAppConfig; timeoutMs?: number; signal?: AbortSignal }
): Promise<MediaUploadResult> {
  const config = options?.config ?? getMetaWhatsAppConfig()

  if (config.mockMode) {
    return {
      outcome: 'MEDIA_UPLOAD_SUCCESS',
      mediaId: undefined,
      durationMs: 0,
    }
  }

  const startTime = Date.now()
  const effectiveTimeout = options?.timeoutMs ?? config.timeoutMs
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout)
  const combinedSignal = composeAbortSignals(controller.signal, options?.signal)

  try {
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/media`
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
    formData.append('file', blob, filename)
    formData.append('messaging_product', 'whatsapp')
    formData.append('type', mimeType)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: formData,
      signal: combinedSignal,
    })

    const durationMs = Date.now() - startTime
    const status = response.status

    if (status === 200) {
      const data = await response.json()
      if (data && typeof data.id === 'string' && data.id.trim()) {
        return {
          outcome: 'MEDIA_UPLOAD_SUCCESS',
          mediaId: data.id.trim(),
          httpStatus: status,
          durationMs,
        }
      }
      return {
        outcome: 'MEDIA_UPLOAD_REJECTED',
        error: { message: 'Meta HTTP 200 response missing media id.' },
        httpStatus: status,
        durationMs,
      }
    }

    let errorData: any = null
    try {
      errorData = await response.json()
    } catch {
      // Non-JSON response body
    }

    const metaError: MetaApiError = {
      message: errorData?.error?.message
        ? redactSecrets(errorData.error.message, config.apiToken)
        : `HTTP ${status}`,
      code: errorData?.error?.code,
      subcode: errorData?.error?.error_subcode,
      type: errorData?.error?.type,
      fbtraceId: errorData?.error?.fbtrace_id,
      errorDataDetails: errorData?.error?.error_data?.details,
    }

    if (status === 429) {
      return { outcome: 'MEDIA_UPLOAD_RATE_LIMITED', error: metaError, httpStatus: status, durationMs }
    }
    if (status >= 400 && status < 500) {
      return { outcome: 'MEDIA_UPLOAD_REJECTED', error: metaError, httpStatus: status, durationMs }
    }
    return { outcome: 'MEDIA_UPLOAD_TRANSIENT_FAILURE', error: metaError, httpStatus: status, durationMs }
  } catch (err: any) {
    const durationMs = Date.now() - startTime
    if (controller.signal.aborted || (!options?.signal?.aborted && err?.name === 'AbortError')) {
      return {
        outcome: 'MEDIA_UPLOAD_TRANSIENT_FAILURE',
        error: {
          message: `Media upload timed out after ${effectiveTimeout}ms.`,
        },
        durationMs,
      }
    }
    if (options?.signal?.aborted) {
      return {
        outcome: 'MEDIA_UPLOAD_TRANSIENT_FAILURE',
        error: {
          message: 'Media upload was cancelled by caller.',
        },
        durationMs,
      }
    }
    return {
      outcome: 'MEDIA_UPLOAD_TRANSIENT_FAILURE',
      error: {
        message: redactSecrets(err?.message || 'Network error during media upload', config.apiToken),
      },
      durationMs,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

// ---------------------------------------------------------------------------
// Template Message Dispatch Service (POST /{phone-number-id}/messages)
// ---------------------------------------------------------------------------

/**
 * Dispatches a template message via Meta WhatsApp Cloud API.
 *
 * CONSERVATIVE DISPATCH SAFETY RULES:
 * - HTTP 200 with messages[0].id -> DISPATCH_SUCCESS
 * - HTTP 4xx (400, 401, 403, 404) -> DISPATCH_REJECTED (permanent rejection)
 * - HTTP 429 -> DISPATCH_RATE_LIMITED
 * - HTTP 5xx -> DISPATCH_UNKNOWN (Message acceptance cannot be ruled out. NEVER auto-retry!)
 * - Network errors / drops -> DISPATCH_UNKNOWN (Request may have reached Meta. NEVER auto-retry!)
 * - Timeout -> DISPATCH_TIMEOUT_AMBIGUOUS (NEVER auto-retry!)
 */
export async function sendWhatsAppTemplate(
  payload: WhatsAppTemplatePayload,
  options?: { config?: MetaWhatsAppConfig; timeoutMs?: number; signal?: AbortSignal }
): Promise<DispatchResult> {
  const config = options?.config ?? getMetaWhatsAppConfig()

  if (config.mockMode) {
    return {
      outcome: 'MOCK_SUCCESS',
      recipientPhone: payload.to,
      durationMs: 0,
      mock: true,
    }
  }

  const startTime = Date.now()
  const effectiveTimeout = options?.timeoutMs ?? config.timeoutMs
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout)
  const combinedSignal = composeAbortSignals(controller.signal, options?.signal)

  try {
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: combinedSignal,
    })

    const durationMs = Date.now() - startTime
    const status = response.status

    if (status === 200) {
      const data = await response.json()
      const metaMessageId = data?.messages?.[0]?.id
      if (metaMessageId && typeof metaMessageId === 'string') {
        return {
          outcome: 'DISPATCH_SUCCESS',
          metaMessageId: metaMessageId.trim(),
          recipientPhone: payload.to,
          httpStatus: status,
          durationMs,
        }
      }
      // HTTP 200 without valid message ID is ambiguous
      return {
        outcome: 'DISPATCH_UNKNOWN',
        error: { message: 'Meta HTTP 200 response missing messages[0].id.' },
        recipientPhone: payload.to,
        httpStatus: status,
        durationMs,
      }
    }

    let errorData: any = null
    try {
      errorData = await response.json()
    } catch {
      // Non-JSON response body
    }

    const metaError: MetaApiError = {
      message: errorData?.error?.message
        ? redactSecrets(errorData.error.message, config.apiToken)
        : `HTTP ${status}`,
      code: errorData?.error?.code,
      subcode: errorData?.error?.error_subcode,
      type: errorData?.error?.type,
      fbtraceId: errorData?.error?.fbtrace_id,
      errorDataDetails: errorData?.error?.error_data?.details,
    }

    if (status === 429) {
      return {
        outcome: 'DISPATCH_RATE_LIMITED',
        error: metaError,
        recipientPhone: payload.to,
        httpStatus: status,
        durationMs,
      }
    }

    if (status >= 400 && status < 500) {
      return {
        outcome: 'DISPATCH_REJECTED',
        error: metaError,
        recipientPhone: payload.to,
        httpStatus: status,
        durationMs,
      }
    }

    // HTTP 5xx: STRICTLY UNKNOWN. Message acceptance cannot be ruled out!
    return {
      outcome: 'DISPATCH_UNKNOWN',
      error: metaError,
      recipientPhone: payload.to,
      httpStatus: status,
      durationMs,
    }
  } catch (err: any) {
    const durationMs = Date.now() - startTime

    if (controller.signal.aborted || (!options?.signal?.aborted && err?.name === 'AbortError')) {
      return {
        outcome: 'DISPATCH_TIMEOUT_AMBIGUOUS',
        error: {
          message: `Request timed out after ${effectiveTimeout}ms (outcome ambiguous; message acceptance cannot be ruled out).`,
        },
        recipientPhone: payload.to,
        durationMs,
      }
    }

    if (options?.signal?.aborted) {
      return {
        outcome: 'DISPATCH_TIMEOUT_AMBIGUOUS',
        error: {
          message: 'Request was cancelled by caller (outcome ambiguous; message acceptance cannot be ruled out).',
        },
        recipientPhone: payload.to,
        durationMs,
      }
    }

    // Network error: STRICTLY UNKNOWN. Request may have reached Meta before TCP reset/drop.
    return {
      outcome: 'DISPATCH_UNKNOWN',
      error: {
        message: redactSecrets(err?.message || 'Network error during message dispatch', config.apiToken),
      },
      recipientPhone: payload.to,
      durationMs,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
