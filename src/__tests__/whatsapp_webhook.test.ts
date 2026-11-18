import crypto from 'crypto'
import {
  MAX_WEBHOOK_BYTES,
  PayloadTooLargeError,
  readLimitedRawBody,
  verifyWebhookSignature,
  verifyGetHandshake,
  parseAndValidateMetaTimestamp,
  normalizeWebhookPayload,
  ingestWebhookPayload,
  getWebhookFutureSkewLimit,
} from '@/services/whatsapp-webhook.service'
import { GET, POST } from '@/app/api/whatsapp/webhook/route'
import { db } from '@/lib/db'
import { processRSVPWebhook } from '@/services/advanced.service'

jest.mock('@/services/advanced.service', () => ({
  processRSVPWebhook: jest.fn().mockResolvedValue({ success: true, action: 'CONFIRMED' }),
}))

jest.mock('@/lib/db', () => {
  const batches = new Map<string, any>()
  const events = new Map<string, any>()

  const mockDb: any = {
    _batches: batches,
    _events: events,
    systemConfig: {
      findUnique: jest.fn(),
    },
    whatsAppWebhookBatch: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    whatsAppWebhookEvent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (input) => {
      if (typeof input === 'function') {
        return await input(mockDb)
      }
      if (Array.isArray(input)) {
        return await Promise.all(input)
      }
      return input
    }),
  }

  return { db: mockDb }
})

describe('Phase 5B: Meta WhatsApp Webhook Endpoint & Durable Ingestion', () => {
  const TEST_SECRET = 'test-app-secret-12345'
  const TEST_VERIFY_TOKEN = 'test-verify-token-67890'
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.WHATSAPP_APP_SECRET = TEST_SECRET
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN

    ;(db.whatsAppWebhookBatch.findUnique as jest.Mock).mockResolvedValue(null)
    ;(db.whatsAppWebhookBatch.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: 'batch-uuid-1', ...data, created_at: new Date() })
    )
    ;(db.whatsAppWebhookEvent.upsert as jest.Mock).mockImplementation(({ create }) =>
      Promise.resolve({ id: `event-${create.event_identity}`, ...create, created_at: new Date() })
    )
    ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValue([])
    ;(db.whatsAppWebhookEvent.update as jest.Mock).mockImplementation(({ where, data }) =>
      Promise.resolve({ id: where.id, ...data, updated_at: new Date() })
    )
    ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue(null)
    ;(processRSVPWebhook as jest.Mock).mockResolvedValue({ success: true, action: 'CONFIRMED' })
    ;(db.$transaction as jest.Mock).mockImplementation(async (input) => {
      if (typeof input === 'function') {
        return await input(db)
      }
      if (Array.isArray(input)) {
        return await Promise.all(input)
      }
      return input
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // Helper to compute valid Meta signature
  function computeSignature(payload: string | Buffer, secret: string = TEST_SECRET): string {
    const raw = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload
    return 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
  }

  // Helper to construct a Mock Request with streaming body
  function createStreamRequest(
    body: string | Buffer,
    headers: Record<string, string> = {}
  ): Request {
    const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buf))
        controller.close()
      },
    })
    return new Request('https://example.com/api/whatsapp/webhook', {
      method: 'POST',
      headers: new Headers(headers),
      body: stream,
      // @ts-ignore
      duplex: 'half',
    })
  }

  // ---------------------------------------------------------------------------
  // 1. GET Webhook Subscription Verification
  // ---------------------------------------------------------------------------
  describe('GET Webhook Verification Handshake', () => {
    it('returns 200 with raw challenge text when mode is subscribe and verify_token matches', async () => {
      const req = new Request(
        `https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=test_challenge_code_123`
      )
      const res = await GET(req)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/plain')
      const text = await res.text()
      expect(text).toBe('test_challenge_code_123')
    })

    it('returns 403 when verify_token is incorrect', async () => {
      const req = new Request(
        `https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge123`
      )
      const res = await GET(req)

      expect(res.status).toBe(403)
      expect(await res.text()).toBe('Forbidden')
    })

    it('returns 403 when hub.verify_token is missing', async () => {
      const req = new Request(
        `https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.challenge=challenge123`
      )
      const res = await GET(req)

      expect(res.status).toBe(403)
    })

    it('returns 403 when hub.mode is not "subscribe"', async () => {
      const req = new Request(
        `https://example.com/api/whatsapp/webhook?hub.mode=unsubscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=challenge123`
      )
      const res = await GET(req)

      expect(res.status).toBe(403)
    })

    it('returns 403 when hub.challenge is missing', async () => {
      const req = new Request(
        `https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}`
      )
      const res = await GET(req)

      expect(res.status).toBe(403)
    })

    it('returns 403 if server verify token configuration is missing', async () => {
      delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      const req = new Request(
        `https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=challenge123`
      )
      const res = await GET(req)

      expect(res.status).toBe(403)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. POST Cryptographic Signature Verification
  // ---------------------------------------------------------------------------
  describe('POST Signature Verification (X-Hub-Signature-256)', () => {
    const samplePayload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })

    it('accepts requests with valid HMAC-SHA256 signature', async () => {
      const sig = computeSignature(samplePayload)
      const req = createStreamRequest(samplePayload, {
        'x-hub-signature-256': sig,
        'content-type': 'application/json',
      })

      const res = await POST(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })

    it('rejects requests with an invalid HMAC signature (401 Unauthorized)', async () => {
      const invalidSig = 'sha256=' + 'a'.repeat(64)
      const req = createStreamRequest(samplePayload, {
        'x-hub-signature-256': invalidSig,
        'content-type': 'application/json',
      })

      const res = await POST(req)
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe('Unauthorized')
    })

    it('rejects requests with missing x-hub-signature-256 header (401)', async () => {
      const req = createStreamRequest(samplePayload, {
        'content-type': 'application/json',
      })

      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it('rejects requests with malformed signature format (no sha256= prefix)', async () => {
      const req = createStreamRequest(samplePayload, {
        'x-hub-signature-256': 'md5=1234567890abcdef',
        'content-type': 'application/json',
      })

      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it('rejects requests when server WHATSAPP_APP_SECRET is not configured (401)', async () => {
      delete process.env.WHATSAPP_APP_SECRET
      const sig = computeSignature(samplePayload, TEST_SECRET)
      const req = createStreamRequest(samplePayload, {
        'x-hub-signature-256': sig,
        'content-type': 'application/json',
      })

      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it('rejects tampered raw body where payload does not match signature', async () => {
      const originalPayload = samplePayload
      const sig = computeSignature(originalPayload)
      const tamperedPayload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'tampered' }] })

      const req = createStreamRequest(tamperedPayload, {
        'x-hub-signature-256': sig, // Signature computed on originalPayload!
        'content-type': 'application/json',
      })

      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it('rejects signature with unequal hex length safely without throwing', () => {
      const rawBuf = Buffer.from('hello')
      const invalidShortSig = 'sha256=1234'
      const isValid = verifyWebhookSignature(rawBuf, invalidShortSig, TEST_SECRET)
      expect(isValid).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Streaming Request Body Size Enforcement (256 KB Limit)
  // ---------------------------------------------------------------------------
  describe('Streaming Request Body Limit (256 KB)', () => {
    it('accepts payloads well below 256 KB', async () => {
      const payload = JSON.stringify({ data: 'small payload' })
      const sig = computeSignature(payload)
      const req = createStreamRequest(payload, { 'x-hub-signature-256': sig })

      const res = await POST(req)
      expect(res.status).toBe(200)
    })

    it('accepts payload exactly at 256 KB', async () => {
      const jsonPrefix = '{"data":"'
      const jsonSuffix = '"}'
      const targetSize = MAX_WEBHOOK_BYTES
      const padSize = targetSize - jsonPrefix.length - jsonSuffix.length
      const payload = jsonPrefix + 'a'.repeat(padSize) + jsonSuffix

      expect(Buffer.byteLength(payload)).toBe(MAX_WEBHOOK_BYTES)

      const sig = computeSignature(payload)
      const req = createStreamRequest(payload, { 'x-hub-signature-256': sig })

      const res = await POST(req)
      expect(res.status).toBe(200)
    })

    it('rejects oversized payload exceeding 256 KB with HTTP 413 Payload Too Large', async () => {
      // 256 KB + 10 bytes
      const oversizedPayload = 'a'.repeat(MAX_WEBHOOK_BYTES + 10)
      const sig = computeSignature(oversizedPayload)
      const req = createStreamRequest(oversizedPayload, { 'x-hub-signature-256': sig })

      const res = await POST(req)
      expect(res.status).toBe(413)
      const body = await res.json()
      expect(body.error).toBe('Payload Too Large')
    })

    it('cancels the reader stream immediately when limit is exceeded without buffering excess', async () => {
      let cancelled = false
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_WEBHOOK_BYTES + 100))
        },
        cancel() {
          cancelled = true
        },
      })

      const req = new Request('https://example.com/api/whatsapp/webhook', {
        method: 'POST',
        body: stream,
        // @ts-ignore
        duplex: 'half',
      })

      await expect(readLimitedRawBody(req, MAX_WEBHOOK_BYTES)).rejects.toThrow(PayloadTooLargeError)
      expect(cancelled).toBe(true)
    })

    it('handles empty body by returning 400 Bad Request', async () => {
      const req = new Request('https://example.com/api/whatsapp/webhook', {
        method: 'POST',
        headers: { 'x-hub-signature-256': computeSignature('') },
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Timestamp Parsing & Validation
  // ---------------------------------------------------------------------------
  describe('Timestamp Parsing and Policy', () => {
    it('parses valid numeric string Unix seconds into valid Date', () => {
      const res = parseAndValidateMetaTimestamp('1731826800')
      expect(res.isValid).toBe(true)
      expect(res.timestamp).toEqual(new Date(1731826800 * 1000))
      expect(res.failureReason).toBeUndefined()
    })

    it('flags missing timestamp with MISSING_META_TIMESTAMP and returns null Date', () => {
      const res = parseAndValidateMetaTimestamp(undefined)
      expect(res.isValid).toBe(false)
      expect(res.timestamp).toBeNull()
      expect(res.failureReason).toBe('MISSING_META_TIMESTAMP')
    })

    it('flags non-numeric timestamp with INVALID_META_TIMESTAMP_FORMAT', () => {
      const res = parseAndValidateMetaTimestamp('not-a-number')
      expect(res.isValid).toBe(false)
      expect(res.timestamp).toBeNull()
      expect(res.failureReason).toBe('INVALID_META_TIMESTAMP_FORMAT')
    })

    it('flags non-positive timestamp with UNSAFE_OR_NON_POSITIVE_TIMESTAMP', () => {
      const res = parseAndValidateMetaTimestamp('0')
      expect(res.isValid).toBe(false)
      expect(res.timestamp).toBeNull()
      expect(res.failureReason).toBe('UNSAFE_OR_NON_POSITIVE_TIMESTAMP')
    })

    it('flags unsafe integer timestamp with UNSAFE_OR_NON_POSITIVE_TIMESTAMP', () => {
      const res = parseAndValidateMetaTimestamp('999999999999999999999')
      expect(res.isValid).toBe(false)
      expect(res.timestamp).toBeNull()
      expect(res.failureReason).toBe('UNSAFE_OR_NON_POSITIVE_TIMESTAMP')
    })

    it('flags future timestamp exceeding configured skew policy', () => {
      // 5 days into future
      const futureSeconds = Math.floor(Date.now() / 1000) + 5 * 86400
      const res = parseAndValidateMetaTimestamp(String(futureSeconds), 172800) // 48h limit
      expect(res.isValid).toBe(false)
      expect(res.timestamp).toBeNull()
      expect(res.failureReason).toBe('FUTURE_TIMESTAMP_EXCEEDS_SANITY_LIMIT')
    })

    it('retrieves future skew limit from SystemConfig if present', async () => {
      ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue({
        key: 'whatsapp_max_future_event_skew_sec',
        value: '86400',
      })
      const limit = await getWebhookFutureSkewLimit()
      expect(limit).toBe(86400)
      expect(db.systemConfig.findUnique).toHaveBeenCalledWith({
        where: { key: 'whatsapp_max_future_event_skew_sec' },
      })
    })

    it('falls back to default 172800 (48h) if SystemConfig key is missing or invalid', async () => {
      ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue(null)
      expect(await getWebhookFutureSkewLimit()).toBe(172800)

      // Malformed string
      ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue({
        key: 'whatsapp_max_future_event_skew_sec',
        value: 'invalid-number',
      })
      expect(await getWebhookFutureSkewLimit()).toBe(172800)

      // Trailing non-numeric
      ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue({
        key: 'whatsapp_max_future_event_skew_sec',
        value: '86400abc',
      })
      expect(await getWebhookFutureSkewLimit()).toBe(172800)

      // Fractional string
      ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue({
        key: 'whatsapp_max_future_event_skew_sec',
        value: '86400.5',
      })
      expect(await getWebhookFutureSkewLimit()).toBe(172800)

      // Negative number
      ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue({
        key: 'whatsapp_max_future_event_skew_sec',
        value: '-100',
      })
      expect(await getWebhookFutureSkewLimit()).toBe(172800)

      // Excessive number (> 30 days)
      ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue({
        key: 'whatsapp_max_future_event_skew_sec',
        value: '9999999999',
      })
      expect(await getWebhookFutureSkewLimit()).toBe(172800)

      // Database error
      ;(db.systemConfig.findUnique as jest.Mock).mockRejectedValueOnce(new Error('DB read timeout'))
      expect(await getWebhookFutureSkewLimit()).toBe(172800)
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Payload Parsing & Normalization
  // ---------------------------------------------------------------------------
  describe('Payload Normalization and Event Identity', () => {
    it('normalizes single status event and derives deterministic identity', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    {
                      id: 'wamid.HBgLMTIzNA==',
                      status: 'delivered',
                      timestamp: '1731826800',
                      recipient_id: '6281234567890',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events).toHaveLength(1)
      expect(events[0].event_type).toBe('STATUS_UPDATE')
      expect(events[0].meta_message_id).toBe('wamid.HBgLMTIzNA==')
      expect(events[0].event_status).toBe('delivered')
      expect(events[0].event_identity).toBe('status:wamid.HBgLMTIzNA==:6281234567890:delivered:1731826800')
      expect(events[0].recipient_phone).toBe('6281234567890')
      expect(events[0].meta_timestamp).toEqual(new Date(1731826800 * 1000))
    })

    it('normalizes multiple status events within one change value', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    { id: 'wamid.1', status: 'sent', timestamp: '1731826800' },
                    { id: 'wamid.2', status: 'delivered', timestamp: '1731826805' },
                  ],
                },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events).toHaveLength(2)
      expect(events[0].event_identity).toBe('status:wamid.1:no_recipient:sent:1731826800')
      expect(events[1].event_identity).toBe('status:wamid.2:no_recipient:delivered:1731826805')
    })

    it('disambiguates status failure events sharing same WAMID, status, and timestamp using error code', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    {
                      id: 'wamid.SHARED',
                      recipient_id: '628123456789',
                      status: 'failed',
                      timestamp: '1731826800',
                      errors: [{ code: 131051, title: 'Spam rate limit' }],
                    },
                    {
                      id: 'wamid.SHARED',
                      recipient_id: '628123456789',
                      status: 'failed',
                      timestamp: '1731826800',
                      errors: [{ code: 131052, title: 'Server error' }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events).toHaveLength(2)
      expect(events[0].event_identity).toBe('status:wamid.SHARED:628123456789:failed:1731826800:131051')
      expect(events[1].event_identity).toBe('status:wamid.SHARED:628123456789:failed:1731826800:131052')
      expect(events[0].event_identity).not.toBe(events[1].event_identity)
    })

    it('flags inbound messages missing Meta message ID as UNSUPPORTED with deterministic fallback identity', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '6281299990000',
                      timestamp: '1731826900',
                      type: 'text',
                      text: { body: 'Hello' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events).toHaveLength(1)
      expect(events[0].event_type).toBe('UNSUPPORTED')
      expect(events[0].failure_reason).toBe('MISSING_META_MESSAGE_ID')
      expect(events[0].event_identity).toMatch(/^message:no_id:6281299990000:1731826900:[a-f0-9]{16}$/)
    })

    it('produces identical fallback identity for two identical messages from same sender lacking IDs (deduplication risk)', () => {
      const msg = {
        from: '6281299990000',
        timestamp: '1731826900',
        type: 'text',
        text: { body: 'Batal' },
      }
      const payload1 = {
        object: 'whatsapp_business_account',
        entry: [{ id: 'WABA-1', changes: [{ field: 'messages', value: { messages: [msg] } }] }],
      }
      const payload2 = {
        object: 'whatsapp_business_account',
        entry: [{ id: 'WABA-1', changes: [{ field: 'messages', value: { messages: [{ ...msg }] } }] }],
      }

      const events1 = normalizeWebhookPayload(payload1)
      const events2 = normalizeWebhookPayload(payload2)

      // Identical fallback identity means second message would be deduped: documented Meta format limitation
      expect(events1[0].event_identity).toBe(events2[0].event_identity)
    })

    it('produces distinct fallback identities for two different messages from same sender lacking IDs', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    { from: '6281299990000', timestamp: '1731826900', type: 'text', text: { body: 'Message A' } },
                    { from: '6281299990000', timestamp: '1731826901', type: 'text', text: { body: 'Message B' } },
                  ],
                },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events).toHaveLength(2)
      expect(events[0].event_identity).not.toBe(events[1].event_identity)
    })

    it('produces identical deterministic identity for duplicate delivery of a message with a valid Meta ID', () => {
      const msg = {
        id: 'wamid.HBgLVALID123',
        from: '6281299990000',
        timestamp: '1731826900',
        type: 'text',
        text: { body: 'Hadir' },
      }
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{ id: 'WABA-1', changes: [{ field: 'messages', value: { messages: [msg] } }] }],
      }

      const events1 = normalizeWebhookPayload(payload)
      const events2 = normalizeWebhookPayload(payload)

      expect(events1[0].event_identity).toBe('message:wamid.HBgLVALID123')
      expect(events2[0].event_identity).toBe('message:wamid.HBgLVALID123')
      expect(events1[0].event_type).toBe('INBOUND_MESSAGE')
    })

    it('joins multiple status error codes with underscore in event identity', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    {
                      id: 'wamid.MULTI_ERR',
                      recipient_id: '628123456789',
                      status: 'failed',
                      timestamp: '1731826800',
                      errors: [
                        { code: 131051, title: 'Error 1' },
                        { code: 131052, title: 'Error 2' },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events[0].event_identity).toBe('status:wamid.MULTI_ERR:628123456789:failed:1731826800:131051_131052')
      expect(events[0].error_code).toBe('131051')
    })

    it('normalizes multiple entries and multiple changes', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: { statuses: [{ id: 'wamid.1', status: 'read', timestamp: '1731826810' }] },
              },
            ],
          },
          {
            id: 'WABA-2',
            changes: [
              {
                field: 'messages',
                value: { statuses: [{ id: 'wamid.2', status: 'failed', timestamp: '1731826820' }] },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events).toHaveLength(2)
      expect(events[0].meta_message_id).toBe('wamid.1')
      expect(events[1].meta_message_id).toBe('wamid.2')
    })

    it('normalizes inbound user messages separately with message:<id> identity', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '6281299990000',
                      id: 'wamid.INBOUND_123',
                      timestamp: '1731826900',
                      type: 'text',
                      text: { body: 'Maaf saya tidak hadir' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events).toHaveLength(1)
      expect(events[0].event_type).toBe('INBOUND_MESSAGE')
      expect(events[0].meta_message_id).toBe('wamid.INBOUND_123')
      expect(events[0].event_status).toBeNull()
      expect(events[0].event_identity).toBe('message:wamid.INBOUND_123')
      expect(events[0].recipient_phone).toBe('6281299990000')
    })

    it('normalizes mixed payload containing both status events and inbound messages', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [{ id: 'wamid.STATUS_1', status: 'sent', timestamp: '1731826800' }],
                  messages: [
                    { from: '628128888', id: 'wamid.MSG_1', timestamp: '1731826805', type: 'text' },
                  ],
                },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events).toHaveLength(2)
      expect(events[0].event_type).toBe('STATUS_UPDATE')
      expect(events[1].event_type).toBe('INBOUND_MESSAGE')
    })

    it('preserves invalid/missing timestamps as null with explicit failureReason in normalized event', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    { id: 'wamid.NO_TS', status: 'failed' }, // No timestamp
                  ],
                },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events).toHaveLength(1)
      expect(events[0].meta_timestamp).toBeNull()
      expect(events[0].failure_reason).toBe('MISSING_META_TIMESTAMP')
    })

    it('captures Meta error details for failed status updates', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    {
                      id: 'wamid.ERR_1',
                      status: 'failed',
                      timestamp: '1731826800',
                      errors: [
                        {
                          code: 131026,
                          title: 'Message undeliverable',
                          message: 'Message undeliverable',
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events[0].error_code).toBe('131026')
      expect(events[0].error_message).toBe('Message undeliverable')
    })

    it('gracefully handles unknown / unsupported event types without crashing', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'account_update',
                value: { ban_info: 'none' },
              },
            ],
          },
        ],
      }

      const events = normalizeWebhookPayload(payload)
      expect(events).toHaveLength(1)
      expect(events[0].event_type).toBe('UNSUPPORTED')
      expect(events[0].failure_reason).toBe('NO_STATUSES_OR_MESSAGES_FOUND')
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Durable Ingestion & Deduplication
  // ---------------------------------------------------------------------------
  describe('Durable Persistence and Deduplication', () => {
    it('persists parent batch and child events atomically in Prisma transaction', async () => {
      const payloadObj = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    { id: 'wamid.ATOMIC_1', status: 'sent', timestamp: '1731826800' },
                    { id: 'wamid.ATOMIC_2', status: 'delivered', timestamp: '1731826805' },
                  ],
                },
              },
            ],
          },
        ],
      }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      const result = await ingestWebhookPayload(rawBuf, payloadObj)

      expect(result.success).toBe(true)
      expect(result.isDuplicate).toBe(false)
      expect(result.eventsCount).toBe(2)
      expect(db.$transaction).toHaveBeenCalled()
      expect(db.whatsAppWebhookBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RECEIVED',
            events_count: 2,
          }),
        })
      )
      expect(db.whatsAppWebhookEvent.upsert).toHaveBeenCalledTimes(2)
    })

    it('recognizes duplicate HTTP payload and returns isDuplicate: true without inserting again', async () => {
      const payloadObj = { object: 'whatsapp_business_account', entry: [] }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      // Mock that batch already exists with matching payload_hash
      ;(db.whatsAppWebhookBatch.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing-batch-uuid',
        events_count: 0,
      })

      const result = await ingestWebhookPayload(rawBuf, payloadObj)

      expect(result.success).toBe(true)
      expect(result.isDuplicate).toBe(true)
      expect(result.batchId).toBe('existing-batch-uuid')
      expect(db.whatsAppWebhookBatch.create).not.toHaveBeenCalled()
    })

    it('handles concurrent duplicate batch insertion (Prisma P2002) gracefully', async () => {
      const payloadObj = { object: 'whatsapp_business_account', entry: [] }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      // First findUnique returns null (both threads raced)
      ;(db.whatsAppWebhookBatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // initial check inside tx
        .mockResolvedValueOnce({ id: 'winning-batch-id', events_count: 0 }) // fallback fetch after P2002

      const p2002Err: any = new Error('Unique constraint failed on the fields: (`payload_hash`)')
      p2002Err.code = 'P2002'
      p2002Err.meta = { target: ['payload_hash'] }
      ;(db.whatsAppWebhookBatch.create as jest.Mock).mockRejectedValueOnce(p2002Err)

      const result = await ingestWebhookPayload(rawBuf, payloadObj)

      expect(result.success).toBe(true)
      expect(result.isDuplicate).toBe(true)
      expect(result.batchId).toBe('winning-batch-id')
    })

    it('recovers uncompleted inbound RSVP messages from winning batch during concurrent duplicate batch collision', async () => {
      const payloadObj = { object: 'whatsapp_business_account', entry: [] }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      ;(db.whatsAppWebhookBatch.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'winning-batch-id', events_count: 1 })

      const p2002Err: any = new Error('Unique constraint failed on payload_hash')
      p2002Err.code = 'P2002'
      p2002Err.meta = { target: ['payload_hash'] }
      ;(db.whatsAppWebhookBatch.create as jest.Mock).mockRejectedValueOnce(p2002Err)

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'event-winner-uncompleted',
          event_type: 'INBOUND_MESSAGE',
          event_identity: 'message:wamid.CONCURRENT_WINNER',
          recipient_phone: '08123456789',
          raw_event: { text: { body: 'Batal hadir' } },
        },
      ])

      const result = await ingestWebhookPayload(rawBuf, payloadObj)

      expect(result.success).toBe(true)
      expect(result.isDuplicate).toBe(true)
      expect(processRSVPWebhook).toHaveBeenCalledWith('08123456789', 'Batal hadir')
      expect(db.whatsAppWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-winner-uncompleted' },
          data: expect.objectContaining({ processing_state: 'PROCESSED' }),
        })
      )
    })

    it('rethrows unrelated P2002 unique constraint error (e.g. not on payload_hash) as an error without masking it', async () => {
      const payloadObj = { object: 'whatsapp_business_account', entry: [] }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      const p2002Other: any = new Error('Unique constraint failed on the fields: (`other_field`)')
      p2002Other.code = 'P2002'
      p2002Other.meta = { target: ['other_field'] }
      ;(db.whatsAppWebhookBatch.create as jest.Mock).mockRejectedValueOnce(p2002Other)

      await expect(ingestWebhookPayload(rawBuf, payloadObj)).rejects.toThrow('Unique constraint failed')
    })

    it('persists structured JSON in raw_payload while payload_hash stores SHA-256 of raw bytes', async () => {
      const payloadObj = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [{ id: 'wamid.HASH_TEST', status: 'sent', timestamp: '1731826800' }],
                },
              },
            ],
          },
        ],
      }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')
      const expectedHash = crypto.createHash('sha256').update(rawBuf).digest('hex')

      await ingestWebhookPayload(rawBuf, payloadObj)

      expect(db.whatsAppWebhookBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            raw_payload: payloadObj,
            payload_hash: expectedHash,
          }),
        })
      )
    })

    it('returns 500 Internal Server Error when database persistence throws an exception', async () => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
      const sig = computeSignature(payload)

      // Simulate database failure
      ;(db.$transaction as jest.Mock).mockRejectedValue(new Error('PostgreSQL connection timeout'))

      const req = createStreamRequest(payload, { 'x-hub-signature-256': sig })
      const res = await POST(req)

      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toBe('Internal Server Error')
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Inbound RSVP Compatibility
  // ---------------------------------------------------------------------------
  describe('Inbound RSVP Compatibility', () => {
    it('routes inbound text message to processRSVPWebhook after durable persistence commits', async () => {
      const payloadObj = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '08123456789',
                      id: 'wamid.RSVP_TEST',
                      timestamp: '1731826900',
                      type: 'text',
                      text: { body: 'Maaf saya tidak hadir' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      await ingestWebhookPayload(rawBuf, payloadObj)

      expect(processRSVPWebhook).toHaveBeenCalledWith('08123456789', 'Maaf saya tidak hadir')
    })

    it('does NOT trigger processRSVPWebhook for status update events', async () => {
      const payloadObj = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    { id: 'wamid.STATUS_ONLY', status: 'delivered', timestamp: '1731826800' },
                  ],
                },
              },
            ],
          },
        ],
      }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      await ingestWebhookPayload(rawBuf, payloadObj)

      expect(processRSVPWebhook).not.toHaveBeenCalled()
    })

    it('supports legacy { whatsapp_number, message } payload shape for backward compatibility', async () => {
      const legacyPayload = {
        whatsapp_number: '081299998888',
        message: 'Batal hadir',
      }
      const rawBuf = Buffer.from(JSON.stringify(legacyPayload), 'utf8')

      const result = await ingestWebhookPayload(rawBuf, legacyPayload)

      expect(result.success).toBe(true)
      expect(result.eventsCount).toBe(1)
      expect(processRSVPWebhook).toHaveBeenCalledWith('081299998888', 'Batal hadir')
    })

    it('marks inbound event processing_state as PROCESSED on successful RSVP processing', async () => {
      const payloadObj = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '08123456789',
                      id: 'wamid.RSVP_SUCCESS',
                      timestamp: '1731826900',
                      type: 'text',
                      text: { body: 'Hadir' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      await ingestWebhookPayload(rawBuf, payloadObj)

      expect(db.whatsAppWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { event_identity: 'message:wamid.RSVP_SUCCESS' },
          data: expect.objectContaining({
            processing_state: 'PROCESSED',
            processed_at: expect.any(Date),
            failure_reason: null,
          }),
        })
      )
    })

    it('marks inbound event processing_state as FAILED and throws when processRSVPWebhook fails', async () => {
      ;(processRSVPWebhook as jest.Mock).mockRejectedValueOnce(new Error('RSVP database write failed'))

      const payloadObj = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '08123456789',
                      id: 'wamid.RSVP_FAIL',
                      timestamp: '1731826900',
                      type: 'text',
                      text: { body: 'Batal hadir' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      await expect(ingestWebhookPayload(rawBuf, payloadObj)).rejects.toThrow('RSVP database write failed')

      expect(db.whatsAppWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { event_identity: 'message:wamid.RSVP_FAIL' },
          data: expect.objectContaining({
            processing_state: 'FAILED',
            failure_reason: expect.stringContaining('RSVP database write failed'),
          }),
        })
      )
    })

    it('returns HTTP 500 from webhook POST route when inbound RSVP processing fails', async () => {
      ;(processRSVPWebhook as jest.Mock).mockRejectedValueOnce(new Error('Downstream service unreachable'))

      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '08123456789',
                      id: 'wamid.RSVP_HTTP500',
                      timestamp: '1731826900',
                      type: 'text',
                      text: { body: 'Batal hadir' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      })
      const sig = computeSignature(payload)
      const req = createStreamRequest(payload, { 'x-hub-signature-256': sig })

      const res = await POST(req)
      expect(res.status).toBe(500)
    })

    it('throws and marks event FAILED if marking event PROCESSED throws a database error (Scenario B)', async () => {
      // First update (to PROCESSED) fails with a DB error
      ;(db.whatsAppWebhookEvent.update as jest.Mock)
        .mockRejectedValueOnce(new Error('Connection lost while marking PROCESSED'))
        .mockResolvedValueOnce({ id: 'event-message:wamid.SCENARIO_B', processing_state: 'FAILED' })

      const payloadObj = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '08123456789',
                      id: 'wamid.SCENARIO_B',
                      timestamp: '1731826900',
                      type: 'text',
                      text: { body: 'Hadir' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      await expect(ingestWebhookPayload(rawBuf, payloadObj)).rejects.toThrow('Connection lost while marking PROCESSED')

      expect(db.whatsAppWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { event_identity: 'message:wamid.SCENARIO_B' },
          data: expect.objectContaining({
            processing_state: 'FAILED',
            failure_reason: expect.stringContaining('Connection lost while marking PROCESSED'),
          }),
        })
      )
    })

    it('retries uncompleted inbound RSVP messages when duplicate batch arrives and marks PROCESSED', async () => {
      const payloadObj = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '08123456789',
                      id: 'wamid.RSVP_RETRY',
                      timestamp: '1731826900',
                      type: 'text',
                      text: { body: 'Batal hadir' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8')

      // Mock batch already exists (duplicate)
      ;(db.whatsAppWebhookBatch.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing-batch-uuid',
        events_count: 1,
      })
      // Mock uncompleted event found in existing batch
      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'event-uncompleted-1',
          event_identity: 'message:wamid.RSVP_RETRY',
          event_type: 'INBOUND_MESSAGE',
          processing_state: 'FAILED',
          recipient_phone: '08123456789',
          raw_event: {
            text: { body: 'Batal hadir' },
          },
        },
      ])

      const result = await ingestWebhookPayload(rawBuf, payloadObj)

      expect(result.success).toBe(true)
      expect(result.isDuplicate).toBe(true)
      expect(processRSVPWebhook).toHaveBeenCalledWith('08123456789', 'Batal hadir')
      expect(db.whatsAppWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-uncompleted-1' },
          data: expect.objectContaining({
            processing_state: 'PROCESSED',
            processed_at: expect.any(Date),
            failure_reason: null,
          }),
        })
      )
    })

    it('strictly rejects unauthenticated POST requests lacking x-hub-signature-256 header with 401 even for legacy format', async () => {
      const legacyPayload = JSON.stringify({
        whatsapp_number: '081299998888',
        message: 'Batal hadir',
      })
      // No x-hub-signature-256 header
      const req = createStreamRequest(legacyPayload)
      const res = await POST(req)

      expect(res.status).toBe(401)
      expect(processRSVPWebhook).not.toHaveBeenCalled()
    })
  })
})
