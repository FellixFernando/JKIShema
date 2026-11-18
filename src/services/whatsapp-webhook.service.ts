import crypto from 'crypto'
import { db } from '@/lib/db'
import { processRSVPWebhook } from '@/services/advanced.service'
import { WebhookEventType } from '@prisma/client'

export const MAX_WEBHOOK_BYTES = 256 * 1024 // 256 KB
export const DEFAULT_MAX_FUTURE_SKEW_SEC = 172800 // 48 hours

export class PayloadTooLargeError extends Error {
  constructor() {
    super('Payload Too Large: request body exceeds 256 KB limit.')
    this.name = 'PayloadTooLargeError'
  }
}

export interface ParsedMetaTimestamp {
  isValid: boolean
  timestamp: Date | null
  failureReason?: string
}

export interface NormalizedWebhookEvent {
  event_identity: string
  event_type: WebhookEventType
  meta_message_id: string | null
  event_status: string | null
  meta_timestamp: Date | null
  recipient_phone: string | null
  error_code: string | null
  error_message: string | null
  raw_event: any
  failure_reason: string | null
}

export interface IngestResult {
  success: boolean
  isDuplicate: boolean
  batchId?: string
  eventsCount: number
  error?: string
}

/**
 * Retrieves the configurable future event skew limit from SystemConfig, falling back to 48 hours.
 */
export async function getWebhookFutureSkewLimit(): Promise<number> {
  try {
    if (db.systemConfig && typeof db.systemConfig.findUnique === 'function') {
      const config = await db.systemConfig.findUnique({
        where: { key: 'whatsapp_max_future_event_skew_sec' },
      })
      if (config?.value) {
        const trimmed = config.value.trim()
        if (/^\d+$/.test(trimmed)) {
          const parsed = Number(trimmed)
          // Valid skew between 60 seconds (1 minute) and 2592000 seconds (30 days)
          if (Number.isSafeInteger(parsed) && parsed >= 60 && parsed <= 30 * 86400) {
            return parsed
          }
        }
      }
    }
  } catch {
    // Fall back to default
  }
  return DEFAULT_MAX_FUTURE_SKEW_SEC
}

/**
 * Consumes a request body stream enforcing an exact byte limit.
 * Stops reading and cancels the stream immediately if total bytes exceed maxBytes.
 */
export async function readLimitedRawBody(
  req: Request,
  maxBytes: number = MAX_WEBHOOK_BYTES
): Promise<Buffer> {
  if (!req.body) {
    return Buffer.alloc(0)
  }

  // Handle standard Web API ReadableStream
  if (typeof (req.body as any).getReader === 'function') {
    const reader = (req.body as any).getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          totalBytes += value.length
          if (totalBytes > maxBytes) {
            await reader.cancel()
            throw new PayloadTooLargeError()
          }
          chunks.push(value)
        }
      }
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        throw err
      }
      throw new Error(`Failed to read request stream: ${(err as any)?.message || 'Stream error'}`)
    }

    return Buffer.concat(chunks)
  }

  // Fallback for non-stream bodies in mock test environments
  let raw: Buffer
  if (Buffer.isBuffer(req.body)) {
    raw = req.body
  } else if (req.body instanceof Uint8Array) {
    raw = Buffer.from(req.body)
  } else if (typeof req.body === 'string') {
    raw = Buffer.from(req.body, 'utf8')
  } else if (typeof (req as any).text === 'function') {
    const txt = await (req as any).text()
    raw = Buffer.from(txt, 'utf8')
  } else {
    raw = Buffer.alloc(0)
  }

  if (raw.length > maxBytes) {
    throw new PayloadTooLargeError()
  }
  return raw
}

/**
 * Validates Meta's X-Hub-Signature-256 header using timing-safe comparison.
 * Never throws; returns false on missing, malformed, or invalid signatures.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  appSecret?: string
): boolean {
  if (!appSecret || !signatureHeader) {
    return false
  }

  const prefix = 'sha256='
  if (!signatureHeader.startsWith(prefix)) {
    return false
  }

  const providedHex = signatureHeader.slice(prefix.length).trim()
  if (!/^[a-f0-9]{64}$/i.test(providedHex)) {
    return false
  }

  const calculatedHex = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')

  const providedBuffer = Buffer.from(providedHex, 'hex')
  const calculatedBuffer = Buffer.from(calculatedHex, 'hex')

  if (providedBuffer.length !== calculatedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(providedBuffer, calculatedBuffer)
}

/**
 * Handles Meta GET subscription verification handshake.
 */
export function verifyGetHandshake(
  searchParams: URLSearchParams,
  expectedVerifyToken?: string
): { isValid: boolean; challenge?: string; error?: string } {
  if (!expectedVerifyToken) {
    return { isValid: false, error: 'Verification token configuration missing on server.' }
  }

  const mode = searchParams.get('hub.mode')
  const verifyToken = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (!mode || !verifyToken || !challenge) {
    return { isValid: false, error: 'Missing required hub parameters.' }
  }

  if (mode !== 'subscribe') {
    return { isValid: false, error: 'Invalid hub.mode.' }
  }

  const expectedBuffer = Buffer.from(expectedVerifyToken, 'utf8')
  const providedBuffer = Buffer.from(verifyToken, 'utf8')

  if (expectedBuffer.length !== providedBuffer.length) {
    return { isValid: false, error: 'Invalid verify token.' }
  }

  const matches = crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  if (!matches) {
    return { isValid: false, error: 'Invalid verify token.' }
  }

  return { isValid: true, challenge }
}

/**
 * Parses and validates integer Unix seconds timestamps without arbitrary year bounds.
 */
export function parseAndValidateMetaTimestamp(
  rawTs: any,
  maxFutureSkewSec: number = DEFAULT_MAX_FUTURE_SKEW_SEC
): ParsedMetaTimestamp {
  if (rawTs === undefined || rawTs === null || rawTs === '') {
    return { isValid: false, timestamp: null, failureReason: 'MISSING_META_TIMESTAMP' }
  }

  const strVal = String(rawTs).trim()
  if (!/^\d+$/.test(strVal)) {
    return { isValid: false, timestamp: null, failureReason: 'INVALID_META_TIMESTAMP_FORMAT' }
  }

  const seconds = Number(strVal)
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    return { isValid: false, timestamp: null, failureReason: 'UNSAFE_OR_NON_POSITIVE_TIMESTAMP' }
  }

  const parsedDate = new Date(seconds * 1000)
  if (isNaN(parsedDate.getTime())) {
    return { isValid: false, timestamp: null, failureReason: 'UNREPRESENTABLE_DATE' }
  }

  // Configurable operational future sanity limit
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (seconds > nowSeconds + maxFutureSkewSec) {
    return { isValid: false, timestamp: null, failureReason: 'FUTURE_TIMESTAMP_EXCEEDS_SANITY_LIMIT' }
  }

  return { isValid: true, timestamp: parsedDate }
}

/**
 * Normalizes standard Meta WhatsApp webhook payloads into discrete events.
 */
export function normalizeWebhookPayload(
  payload: any,
  maxFutureSkewSec: number = DEFAULT_MAX_FUTURE_SKEW_SEC
): NormalizedWebhookEvent[] {
  const events: NormalizedWebhookEvent[] = []

  // Check for legacy/custom payload shape: { whatsapp_number, message }
  if (payload && typeof payload === 'object' && payload.whatsapp_number && payload.message && !payload.entry) {
    const rawStr = JSON.stringify(payload)
    const hash = crypto.createHash('sha256').update(rawStr).digest('hex').slice(0, 16)
    events.push({
      event_identity: `message:legacy:${hash}`,
      event_type: 'INBOUND_MESSAGE',
      meta_message_id: null,
      event_status: null,
      meta_timestamp: null,
      recipient_phone: String(payload.whatsapp_number).trim(),
      error_code: null,
      error_message: null,
      raw_event: { text: { body: String(payload.message).trim() } },
      failure_reason: null,
    })
    return events
  }

  if (!payload || !Array.isArray(payload.entry)) {
    // Unrecognized top-level structure
    const rawStr = JSON.stringify(payload || {})
    const hash = crypto.createHash('sha256').update(rawStr).digest('hex').slice(0, 16)
    events.push({
      event_identity: `unsupported:unknown:${hash}`,
      event_type: 'UNSUPPORTED',
      meta_message_id: null,
      event_status: null,
      meta_timestamp: null,
      recipient_phone: null,
      error_code: null,
      error_message: null,
      raw_event: payload,
      failure_reason: 'UNKNOWN_WEBHOOK_STRUCTURE',
    })
    return events
  }

  for (const entry of payload.entry) {
    const wabaId = entry?.id || 'unknown'
    const changes = Array.isArray(entry?.changes) ? entry.changes : []

    for (const change of changes) {
      const field = change?.field || 'unknown'
      const value = change?.value

      if (!value) {
        const rawStr = JSON.stringify(change || {})
        const hash = crypto.createHash('sha256').update(rawStr).digest('hex').slice(0, 16)
        events.push({
          event_identity: `unsupported:${wabaId}:${field}:${hash}`,
          event_type: 'UNSUPPORTED',
          meta_message_id: null,
          event_status: null,
          meta_timestamp: null,
          recipient_phone: null,
          error_code: null,
          error_message: null,
          raw_event: change,
          failure_reason: 'MISSING_CHANGE_VALUE',
        })
        continue
      }

      // 1. Process Status Events (Outbound message status receipts)
      if (Array.isArray(value.statuses)) {
        for (const st of value.statuses) {
          const wamid = st?.id ? String(st.id).trim() : null
          const status = st?.status ? String(st.status).trim() : 'unknown'
          const rawTs = st?.timestamp
          const tsResult = parseAndValidateMetaTimestamp(rawTs, maxFutureSkewSec)
          const recipientId = st?.recipient_id ? String(st.recipient_id).trim() : null

          const rawErrors = Array.isArray(st?.errors) ? st.errors : []
          const errorCodes = rawErrors
            .map((e: any) => e?.code)
            .filter((c: any) => c !== undefined && c !== null)
            .join('_')
          const errorCode = rawErrors[0]?.code !== undefined ? String(rawErrors[0].code) : null
          const errorMsg = rawErrors[0]?.message || rawErrors[0]?.title || null

          // Derive conservative, collision-safe event identity
          const tsIdentity = rawTs !== undefined && rawTs !== null ? String(rawTs).trim() : 'no_ts'
          const wamidIdentity = wamid || 'no_wamid'
          const recipientIdentity = recipientId ? `:${recipientId}` : ':no_recipient'
          const errorIdentity = errorCodes ? `:${errorCodes}` : ''
          const identity = `status:${wamidIdentity}${recipientIdentity}:${status}:${tsIdentity}${errorIdentity}`

          events.push({
            event_identity: identity,
            event_type: 'STATUS_UPDATE',
            meta_message_id: wamid,
            event_status: status,
            meta_timestamp: tsResult.timestamp,
            recipient_phone: recipientId,
            error_code: errorCode,
            error_message: errorMsg,
            raw_event: st,
            failure_reason: tsResult.failureReason || null,
          })
        }
      }

      // 2. Process Inbound Messages (User responses / RSVP)
      if (Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          const msgId = msg?.id ? String(msg.id).trim() : null
          const senderPhone = msg?.from ? String(msg.from).trim() : null
          const rawTs = msg?.timestamp
          const tsResult = parseAndValidateMetaTimestamp(rawTs, maxFutureSkewSec)

          let identity = msgId ? `message:${msgId}` : ''
          let eventType: WebhookEventType = 'INBOUND_MESSAGE'
          let failureReason = tsResult.failureReason || null

          if (!identity) {
            // Meta protocol mandates a message ID (wamid) on valid inbound messages.
            // Messages lacking an ID are marked UNSUPPORTED with explicit failure_reason.
            const fallbackRaw = JSON.stringify(msg || {})
            const fallbackHash = crypto.createHash('sha256').update(fallbackRaw).digest('hex').slice(0, 16)
            identity = `message:no_id:${senderPhone || 'unknown'}:${rawTs || 'no_ts'}:${fallbackHash}`
            eventType = 'UNSUPPORTED'
            failureReason = failureReason || 'MISSING_META_MESSAGE_ID'
          }

          events.push({
            event_identity: identity,
            event_type: eventType,
            meta_message_id: msgId,
            event_status: null,
            meta_timestamp: tsResult.timestamp,
            recipient_phone: senderPhone,
            error_code: null,
            error_message: null,
            raw_event: msg,
            failure_reason: failureReason,
          })
        }
      }

      // 3. Fallback for changes without statuses or messages
      if (!Array.isArray(value.statuses) && !Array.isArray(value.messages)) {
        const rawStr = JSON.stringify(change)
        const hash = crypto.createHash('sha256').update(rawStr).digest('hex').slice(0, 16)
        events.push({
          event_identity: `unsupported:${wabaId}:${field}:${hash}`,
          event_type: 'UNSUPPORTED',
          meta_message_id: null,
          event_status: null,
          meta_timestamp: null,
          recipient_phone: null,
          error_code: null,
          error_message: null,
          raw_event: change,
          failure_reason: 'NO_STATUSES_OR_MESSAGES_FOUND',
        })
      }
    }
  }

  return events
}

/**
 * Executes RSVP cancellation logic for an inbound message event, updating processing state.
 */
async function processInboundRsvpEvent(eventRecord: {
  id?: string
  event_identity: string
  recipient_phone: string | null
  raw_event: any
}): Promise<void> {
  const textBody = eventRecord.raw_event?.text?.body
  if (!eventRecord.recipient_phone || !textBody || typeof textBody !== 'string') {
    return
  }

  try {
    await processRSVPWebhook(eventRecord.recipient_phone, textBody)

    // Mark event PROCESSED in database
    if (db.whatsAppWebhookEvent && typeof db.whatsAppWebhookEvent.update === 'function') {
      await db.whatsAppWebhookEvent.update({
        where: eventRecord.id ? { id: eventRecord.id } : { event_identity: eventRecord.event_identity },
        data: {
          processing_state: 'PROCESSED',
          processed_at: new Date(),
          failure_reason: null,
        },
      })
    }
  } catch (err: any) {
    console.error(`[WEBHOOK RSVP] Error processing inbound RSVP for ${eventRecord.recipient_phone}:`, err?.message || err)

    // Record FAILED state in database
    if (db.whatsAppWebhookEvent && typeof db.whatsAppWebhookEvent.update === 'function') {
      try {
        await db.whatsAppWebhookEvent.update({
          where: eventRecord.id ? { id: eventRecord.id } : { event_identity: eventRecord.event_identity },
          data: {
            processing_state: 'FAILED',
            failure_reason: `RSVP_PROCESSING_FAILED: ${err?.message || 'Unknown error'}`,
          },
        })
      } catch {
        // Suppress secondary update error
      }
    }

    // Critical: rethrow to trigger HTTP 500 so Meta will retry delivery!
    throw new Error(`Inbound RSVP processing failed: ${err?.message || 'Unknown error'}`)
  }
}

/**
 * Atomically persists a raw webhook payload and all extracted events in a single transaction.
 * Resilient against concurrent race conditions (P2002) and retryable on RSVP failure.
 */
export async function ingestWebhookPayload(
  rawBody: Buffer,
  parsedJson: any,
  options?: { maxFutureSkewSec?: number }
): Promise<IngestResult> {
  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')

  // 1. Check if batch already exists (fast deduplication check)
  if (db.whatsAppWebhookBatch && typeof db.whatsAppWebhookBatch.findUnique === 'function') {
    const existing = await db.whatsAppWebhookBatch.findUnique({
      where: { payload_hash: payloadHash },
      select: { id: true, events_count: true },
    })

    if (existing) {
      // Deduplication verification: check if any INBOUND_MESSAGE in this batch still requires RSVP processing
      if (db.whatsAppWebhookEvent && typeof db.whatsAppWebhookEvent.findMany === 'function') {
        const uncompletedInbound = await db.whatsAppWebhookEvent.findMany({
          where: {
            batch_id: existing.id,
            event_type: 'INBOUND_MESSAGE',
            processing_state: { in: ['RECEIVED', 'FAILED', 'RETRY'] },
          },
        })

        for (const ev of uncompletedInbound) {
          await processInboundRsvpEvent(ev)
        }
      }

      return {
        success: true,
        isDuplicate: true,
        batchId: existing.id,
        eventsCount: existing.events_count,
      }
    }
  }

  const normalizedEvents = normalizeWebhookPayload(parsedJson, options?.maxFutureSkewSec)

  const executeInTx = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    if (typeof db.$transaction === 'function') {
      return await db.$transaction(fn)
    }
    return await fn(db)
  }

  let persistResult: { batch: any; events: any[] }

  try {
    persistResult = await executeInTx(async (tx) => {
      // 1. Create parent batch record
      let batch: any = null
      if (tx.whatsAppWebhookBatch && typeof tx.whatsAppWebhookBatch.create === 'function') {
        batch = await tx.whatsAppWebhookBatch.create({
          data: {
            payload_hash: payloadHash,
            raw_payload: parsedJson,
            status: 'RECEIVED',
            events_count: normalizedEvents.length,
          },
        })
      }

      // 2. Create child events idempotently
      const createdEvents: any[] = []
      if (tx.whatsAppWebhookEvent && typeof tx.whatsAppWebhookEvent.upsert === 'function') {
        for (const ev of normalizedEvents) {
          const created = await tx.whatsAppWebhookEvent.upsert({
            where: { event_identity: ev.event_identity },
            create: {
              batch_id: batch?.id || null,
              event_identity: ev.event_identity,
              event_type: ev.event_type,
              meta_message_id: ev.meta_message_id,
              event_status: ev.event_status,
              meta_timestamp: ev.meta_timestamp,
              recipient_phone: ev.recipient_phone,
              error_code: ev.error_code,
              error_message: ev.error_message,
              raw_event: ev.raw_event,
              processing_state: 'RECEIVED',
              failure_reason: ev.failure_reason,
            },
            update: {
              // Duplicate event from separate batch: preserve original state and batch link
            },
          })
          createdEvents.push(created)
        }
      }

      return { batch, events: createdEvents }
    })
  } catch (err: any) {
    // Handle concurrent duplicate batch insertion race condition (Prisma P2002 on payload_hash)
    const isPayloadHashConflict =
      (err?.code === 'P2002' &&
        (err?.meta?.target?.includes('payload_hash') ||
          String(err?.message).includes('payload_hash') ||
          !err?.meta?.target)) ||
      String(err?.message).includes('WhatsAppWebhookBatch_payload_hash_key')

    if (isPayloadHashConflict && db.whatsAppWebhookBatch && typeof db.whatsAppWebhookBatch.findUnique === 'function') {
      const concurrentWinner = await db.whatsAppWebhookBatch.findUnique({
        where: { payload_hash: payloadHash },
        select: { id: true, events_count: true },
      })

      if (concurrentWinner) {
        // Recover/process any uncompleted inbound RSVP messages in the winning batch
        if (db.whatsAppWebhookEvent && typeof db.whatsAppWebhookEvent.findMany === 'function') {
          const uncompletedInbound = await db.whatsAppWebhookEvent.findMany({
            where: {
              batch_id: concurrentWinner.id,
              event_type: 'INBOUND_MESSAGE',
              processing_state: { in: ['RECEIVED', 'FAILED', 'RETRY'] },
            },
          })

          for (const ev of uncompletedInbound) {
            await processInboundRsvpEvent(ev)
          }
        }

        return {
          success: true,
          isDuplicate: true,
          batchId: concurrentWinner.id,
          eventsCount: concurrentWinner.events_count,
        }
      }
    }

    // Unhandled database error -> rethrow to trigger HTTP 500
    throw err
  }

  // 3. Post-Persistence Inbound RSVP Processing
  // Process RSVP after durable persistence commits; failure marks event FAILED and throws to return HTTP 500
  for (const ev of normalizedEvents) {
    if (ev.event_type === 'INBOUND_MESSAGE') {
      await processInboundRsvpEvent(ev)
    }
  }

  return {
    success: true,
    isDuplicate: false,
    batchId: persistResult.batch?.id,
    eventsCount: normalizedEvents.length,
  }
}
