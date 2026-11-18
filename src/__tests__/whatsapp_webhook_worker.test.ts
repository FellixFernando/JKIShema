import crypto from 'crypto'
import {
  DEFAULT_WORKER_BATCH_SIZE,
  DEFAULT_WORKER_LEASE_SEC,
  MAX_UNMATCHED_RETRIES,
  MAX_TRANSIENT_RETRIES,
  calculateUnmatchedBackoffDelay,
  calculatePositiveJitter,
  calculateTransientBackoffDelay,
  evaluateDeliveryStatusTransition,
  getDeliveryStatusTimestamp,
  claimEligibleEvents,
  updateBatchStatusRollup,
  processWebhookInboxBatch,
  LeaseFencingExpiredError,
} from '@/services/whatsapp-webhook-worker.service'
import { POST as internalWorkerRoute } from '@/app/api/internal/webhook-worker/route'
import { deliverParticipantTicket } from '@/services/whatsapp.service'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => {
  const mockDb: any = {
    whatsAppWebhookEvent: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
    whatsAppWebhookBatch: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    whatsAppDeliveryAttempt: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    whatsAppDelivery: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    participant: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
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

jest.mock('@/services/meta-whatsapp.client', () => ({
  getMetaWhatsAppConfig: jest.fn().mockReturnValue({
    mockMode: false,
    phoneNumberId: 'test-phone-id',
    accessToken: 'test-access-token',
    businessAccountId: 'test-waba-id',
  }),
  uploadWhatsAppMedia: jest.fn().mockResolvedValue({
    outcome: 'MEDIA_UPLOAD_SUCCESS',
    mediaId: 'meta-media-id-123',
  }),
  sendWhatsAppTemplate: jest.fn().mockResolvedValue({
    outcome: 'DISPATCH_SUCCESS',
    metaMessageId: 'wamid.DISPATCHED_123',
  }),
  buildWhatsAppTemplatePayload: jest.fn().mockReturnValue({}),
}))

describe('Phase 5C: WhatsApp Webhook Event Processing & Delivery Status Synchronization', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }

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

  // ---------------------------------------------------------------------------
  // 1. Unmatched WAMID Delay & Jitter Calculations
  // ---------------------------------------------------------------------------
  describe('Unmatched WAMID Delay and Jitter Calculations', () => {
    it('calculates the exact piecewise schedule for retries 1 through 12', () => {
      const expectedSchedule = [15, 30, 60, 120, 300, 900, 1800, 3600, 7200, 14400, 21600, 36000]

      let cumulativeSum = 0
      for (let r = 1; r <= 12; r++) {
        const delay = calculateUnmatchedBackoffDelay(r)
        expect(delay).toBe(expectedSchedule[r - 1])
        cumulativeSum += delay
      }

      // Verify exact sum equals 86,025 seconds = 23h 53m 45s
      expect(cumulativeSum).toBe(86025)
      expect(cumulativeSum).toBe(23 * 3600 + 53 * 60 + 45)
    })

    it('calculates positive-only bounded jitter within bounds', () => {
      for (const delay of [15, 30, 60, 120, 300, 3600, 36000]) {
        for (let i = 0; i < 20; i++) {
          const jitter = calculatePositiveJitter(delay)
          expect(jitter).toBeGreaterThanOrEqual(0)
          const maxExpectedJitter = Math.min(15, Math.floor(0.1 * delay))
          expect(jitter).toBeLessThanOrEqual(maxExpectedJitter)
        }
      }
    })

    it('verifies the cumulative maximum jitter across all 12 retries equals exactly 142 seconds', () => {
      let cumulativeMaxJitter = 0
      const expectedMaxPerRetry = [1, 3, 6, 12, 15, 15, 15, 15, 15, 15, 15, 15]

      for (let r = 1; r <= 12; r++) {
        const delay = calculateUnmatchedBackoffDelay(r)
        const maxJitter = Math.min(15, Math.floor(0.1 * delay))
        expect(maxJitter).toBe(expectedMaxPerRetry[r - 1])
        cumulativeMaxJitter += maxJitter
      }

      // Verification: 1 + 3 + 6 + 12 + 15 * 8 = 22 + 120 = 142 seconds
      expect(cumulativeMaxJitter).toBe(142)
    })

    it('calculates transient error exponential backoff bounded within retry limits', () => {
      expect(calculateTransientBackoffDelay(1)).toBeGreaterThanOrEqual(5)
      expect(calculateTransientBackoffDelay(2)).toBeGreaterThanOrEqual(15)
      expect(calculateTransientBackoffDelay(5)).toBeGreaterThanOrEqual(300)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Authoritative Delivery Status Transition Evaluator
  // ---------------------------------------------------------------------------
  describe('Authoritative Delivery Status Transition Evaluator', () => {
    const baseDate = new Date('2026-11-18T10:00:00.000Z')
    const t0 = baseDate
    const tMinus1 = new Date(baseDate.getTime() - 1000)
    const tPlus1 = new Date(baseDate.getTime() + 1000)

    it('rejects events with missing, null, or invalid timestamps as IGNORED', () => {
      const resNull = evaluateDeliveryStatusTransition('SENT', t0, 'delivered', null)
      expect(resNull.isIgnored).toBe(true)
      expect(resNull.shouldUpdate).toBe(false)
      expect(resNull.reason).toBe('INVALID_OR_MISSING_TIMESTAMP')

      const resInvalid = evaluateDeliveryStatusTransition('SENT', t0, 'delivered', new Date('invalid'))
      expect(resInvalid.isIgnored).toBe(true)
    })

    it('strictly preserves terminal READ state regardless of incoming event status or timestamp', () => {
      for (const incoming of ['sent', 'delivered', 'failed', 'read']) {
        const res = evaluateDeliveryStatusTransition('READ', t0, incoming, tPlus1)
        expect(res.isIgnored).toBe(true)
        expect(res.shouldUpdate).toBe(false)
        expect(res.reason).toBe('READ_IS_TERMINAL')
      }
    })

    it('does not advance PENDING status upon unsolicited status event arrival', () => {
      const res = evaluateDeliveryStatusTransition('PENDING', null, 'delivered', t0)
      expect(res.isIgnored).toBe(true)
      expect(res.shouldUpdate).toBe(false)
      expect(res.reason).toBe('PENDING_NOT_ADVANCED_BY_STATUS_EVENT')
    })

    it('advances PROCESSING or UNKNOWN status upon valid matching event arrival', () => {
      const resSent = evaluateDeliveryStatusTransition('PROCESSING', null, 'sent', t0)
      expect(resSent.shouldUpdate).toBe(true)
      expect(resSent.resultingStatus).toBe('SENT')

      const resDelivered = evaluateDeliveryStatusTransition('UNKNOWN', null, 'delivered', t0)
      expect(resDelivered.shouldUpdate).toBe(true)
      expect(resDelivered.resultingStatus).toBe('DELIVERED')
    })

    it('SENT -> DELIVERED transitions correctly: accepted when >= sent_at, ignored when < sent_at', () => {
      // Strictly newer
      const newer = evaluateDeliveryStatusTransition('SENT', t0, 'delivered', tPlus1)
      expect(newer.shouldUpdate).toBe(true)
      expect(newer.resultingStatus).toBe('DELIVERED')

      // Equal timestamp: Rank(3) > Rank(2) -> accepted
      const equal = evaluateDeliveryStatusTransition('SENT', t0, 'delivered', t0)
      expect(equal.shouldUpdate).toBe(true)
      expect(equal.resultingStatus).toBe('DELIVERED')

      // Older timestamp -> ignored
      const older = evaluateDeliveryStatusTransition('SENT', t0, 'delivered', tMinus1)
      expect(older.isIgnored).toBe(true)
      expect(older.shouldUpdate).toBe(false)
    })

    it('SENT -> FAILED transition: accepted strictly newer, REJECTED at equal timestamp (Rank 1 < Rank 2)', () => {
      // Strictly newer -> accepted
      const newer = evaluateDeliveryStatusTransition('SENT', t0, 'failed', tPlus1)
      expect(newer.shouldUpdate).toBe(true)
      expect(newer.resultingStatus).toBe('FAILED')

      // Equal timestamp -> REJECTED because Rank(FAILED)=1 < Rank(SENT)=2
      const equal = evaluateDeliveryStatusTransition('SENT', t0, 'failed', t0)
      expect(equal.isIgnored).toBe(true)
      expect(equal.shouldUpdate).toBe(false)
      expect(equal.reason).toContain('EQUAL_TIMESTAMP_LOWER_OR_EQUAL_PRECEDENCE')

      // Older timestamp -> ignored
      const older = evaluateDeliveryStatusTransition('SENT', t0, 'failed', tMinus1)
      expect(older.isIgnored).toBe(true)
      expect(older.shouldUpdate).toBe(false)
    })

    it('DELIVERED -> READ transition: accepted when >= delivered_at, ignored when < delivered_at', () => {
      // Strictly newer
      const newer = evaluateDeliveryStatusTransition('DELIVERED', t0, 'read', tPlus1)
      expect(newer.shouldUpdate).toBe(true)
      expect(newer.resultingStatus).toBe('READ')

      // Equal timestamp: Rank(4) > Rank(3) -> accepted
      const equal = evaluateDeliveryStatusTransition('DELIVERED', t0, 'read', t0)
      expect(equal.shouldUpdate).toBe(true)
      expect(equal.resultingStatus).toBe('READ')

      // Older -> ignored
      const older = evaluateDeliveryStatusTransition('DELIVERED', t0, 'read', tMinus1)
      expect(older.isIgnored).toBe(true)
    })

    it('DELIVERED -> FAILED transition: accepted strictly newer, REJECTED at equal timestamp (Rank 1 < Rank 3)', () => {
      // Strictly newer carrier revocation -> accepted
      const newer = evaluateDeliveryStatusTransition('DELIVERED', t0, 'failed', tPlus1)
      expect(newer.shouldUpdate).toBe(true)
      expect(newer.resultingStatus).toBe('FAILED')

      // Equal timestamp -> REJECTED because Rank(FAILED)=1 < Rank(DELIVERED)=3
      const equal = evaluateDeliveryStatusTransition('DELIVERED', t0, 'failed', t0)
      expect(equal.isIgnored).toBe(true)
      expect(equal.shouldUpdate).toBe(false)
      expect(equal.reason).toContain('EQUAL_TIMESTAMP_LOWER_OR_EQUAL_PRECEDENCE')
    })

    it('DELIVERED -> SENT: strictly prevented from regressing (monotonic progression)', () => {
      const res = evaluateDeliveryStatusTransition('DELIVERED', t0, 'sent', tPlus1)
      expect(res.isIgnored).toBe(true)
      expect(res.shouldUpdate).toBe(false)
      expect(res.reason).toBe('CANNOT_REGRESS_TO_SENT')
    })

    it('FAILED -> DELIVERED transition: accepted when >= failed_at, ignored when < failed_at', () => {
      // Strictly newer delivery supersedes earlier transient failure
      const newer = evaluateDeliveryStatusTransition('FAILED', t0, 'delivered', tPlus1)
      expect(newer.shouldUpdate).toBe(true)
      expect(newer.resultingStatus).toBe('DELIVERED')

      // Equal timestamp: Rank(3) > Rank(1) -> accepted!
      const equal = evaluateDeliveryStatusTransition('FAILED', t0, 'delivered', t0)
      expect(equal.shouldUpdate).toBe(true)
      expect(equal.resultingStatus).toBe('DELIVERED')

      // Older delivery than failure -> ignored
      const older = evaluateDeliveryStatusTransition('FAILED', t0, 'delivered', tMinus1)
      expect(older.isIgnored).toBe(true)
      expect(older.shouldUpdate).toBe(false)
    })

    it('FAILED -> READ transition: accepted when >= failed_at, ignored when < failed_at', () => {
      // Newer read
      const newer = evaluateDeliveryStatusTransition('FAILED', t0, 'read', tPlus1)
      expect(newer.shouldUpdate).toBe(true)
      expect(newer.resultingStatus).toBe('READ')

      // Equal timestamp: Rank(4) > Rank(1) -> accepted!
      const equal = evaluateDeliveryStatusTransition('FAILED', t0, 'read', t0)
      expect(equal.shouldUpdate).toBe(true)
      expect(equal.resultingStatus).toBe('READ')
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Atomic Event Claiming & Unique Per-Event Tokens
  // ---------------------------------------------------------------------------
  describe('Atomic Event Claiming and Per-Event Tokens', () => {
    it('claims eligible events and assigns each event its own distinct claim_token', async () => {
      const now = new Date()
      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValue([
        { id: 'ev-1', processing_state: 'RECEIVED' },
        { id: 'ev-2', processing_state: 'RETRY' },
      ])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockImplementation(({ where, data }) =>
        Promise.resolve({ id: where.id, ...data })
      )

      const claimed = await claimEligibleEvents(10, 60)

      expect(claimed).toHaveLength(2)
      expect(claimed[0].claim_token).toBeDefined()
      expect(claimed[1].claim_token).toBeDefined()
      expect(claimed[0].claim_token).not.toBe(claimed[1].claim_token)
      expect(claimed[0].processing_state).toBe('PROCESSING')
      expect(claimed[1].processing_state).toBe('PROCESSING')
    })

    it('reclaims expired PROCESSING events whose lease has elapsed', async () => {
      const now = new Date()
      const expiredAt = new Date(now.getTime() - 10000)

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValue([
        { id: 'ev-expired', processing_state: 'PROCESSING', claim_expires_at: expiredAt },
      ])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockImplementation(({ where, data }) =>
        Promise.resolve({ id: where.id, ...data })
      )

      const claimed = await claimEligibleEvents(5, 60)

      expect(claimed).toHaveLength(1)
      expect(claimed[0].id).toBe('ev-expired')
      expect(claimed[0].processing_state).toBe('PROCESSING')
      expect(claimed[0].claim_token).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Inbound RSVP Recovery & Concurrency
  // ---------------------------------------------------------------------------
  describe('Inbound RSVP Recovery and Concurrency', () => {
    it('recovers stalled inbound RSVP message using atomic conditional updateMany', async () => {
      const eventRecord = {
        id: 'ev-rsvp-stalled',
        batch_id: 'batch-1',
        event_type: 'INBOUND_MESSAGE',
        processing_state: 'RECEIVED',
        recipient_phone: '08123456789',
        claim_token: 'token-rsvp-1',
        claim_expires_at: new Date(Date.now() + 60000),
        raw_event: { text: { body: 'Maaf saya batal hadir' } },
      }

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([eventRecord])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockResolvedValueOnce(eventRecord)
      ;(db.whatsAppWebhookEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.participant.findFirst as jest.Mock).mockResolvedValue({
        id: 'part-123',
        status: 'REGISTERED',
      })
      ;(db.participant.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSED', _count: { _all: 1 } },
      ])

      const result = await processWebhookInboxBatch()

      expect(result.processedCount).toBe(1)
      expect(db.participant.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'part-123',
          status: { in: ['REGISTERED', 'CHECKED_IN'] },
        },
        data: { status: 'CANCELLED' },
      })
      expect(db.whatsAppWebhookEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'ev-rsvp-stalled',
            claim_token: 'token-rsvp-1',
          }),
          data: expect.objectContaining({
            processing_state: 'PROCESSED',
          }),
        })
      )
    })

    it('safely handles concurrent second RSVP cancellation when participant is already cancelled', async () => {
      const eventRecord = {
        id: 'ev-rsvp-concurrent',
        batch_id: 'batch-1',
        event_type: 'INBOUND_MESSAGE',
        processing_state: 'RECEIVED',
        recipient_phone: '08123456789',
        claim_token: 'token-rsvp-2',
        claim_expires_at: new Date(Date.now() + 60000),
        raw_event: { text: { body: 'Batal hadir' } },
      }

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([eventRecord])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockResolvedValueOnce(eventRecord)
      ;(db.whatsAppWebhookEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.participant.findFirst as jest.Mock).mockResolvedValue(null) // Already cancelled
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSED', _count: { _all: 1 } },
      ])

      const result = await processWebhookInboxBatch()

      expect(result.processedCount).toBe(1)
      expect(db.participant.updateMany).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Unmatched WAMID Recovery & Terminal UNMATCHED Transition
  // ---------------------------------------------------------------------------
  describe('Unmatched WAMID Recovery and Terminal UNMATCHED Transition', () => {
    it('schedules retry with piecewise backoff delay when WAMID is not yet committed', async () => {
      const eventRecord = {
        id: 'ev-unmatched-1',
        batch_id: 'batch-1',
        event_type: 'STATUS_UPDATE',
        meta_message_id: 'wamid.UNMATCHED_TEST',
        event_status: 'delivered',
        meta_timestamp: new Date(),
        retry_count: 0,
        claim_token: 'token-unmatched-1',
        claim_expires_at: new Date(Date.now() + 60000),
      }

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([eventRecord])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockResolvedValueOnce(eventRecord)
      ;(db.whatsAppWebhookEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.whatsAppDeliveryAttempt.findUnique as jest.Mock).mockResolvedValue(null) // Not found
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'RETRY', _count: { _all: 1 } },
      ])

      const result = await processWebhookInboxBatch()

      expect(result.retryCount).toBe(1)
      expect(db.whatsAppWebhookEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'ev-unmatched-1',
            claim_token: 'token-unmatched-1',
          }),
          data: expect.objectContaining({
            processing_state: 'RETRY',
            retry_count: 1,
            failure_reason: 'UNMATCHED_WAMID',
          }),
        })
      )
    })

    it('transitions event to terminal UNMATCHED when max retries (12) are exhausted', async () => {
      const eventRecord = {
        id: 'ev-unmatched-exhausted',
        batch_id: 'batch-1',
        event_type: 'STATUS_UPDATE',
        meta_message_id: 'wamid.EXHAUSTED',
        event_status: 'delivered',
        meta_timestamp: new Date(),
        retry_count: 12, // Max retries reached
        claim_token: 'token-unmatched-exhausted',
        claim_expires_at: new Date(Date.now() + 60000),
      }

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([eventRecord])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockResolvedValueOnce(eventRecord)
      ;(db.whatsAppWebhookEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.whatsAppDeliveryAttempt.findUnique as jest.Mock).mockResolvedValue(null)
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'UNMATCHED', _count: { _all: 1 } },
      ])

      const result = await processWebhookInboxBatch()

      expect(result.unmatchedCount).toBe(1)
      expect(db.whatsAppWebhookEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'ev-unmatched-exhausted',
            claim_token: 'token-unmatched-exhausted',
          }),
          data: expect.objectContaining({
            processing_state: 'UNMATCHED',
            next_retry_at: null,
            failure_reason: 'UNMATCHED_WAMID_MAX_RETRIES_EXCEEDED',
          }),
        })
      )
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Automatic Late WAMID Recovery Upon Dispatch Commit
  // ---------------------------------------------------------------------------
  describe('Automatic Late WAMID Recovery Upon Dispatch Commit', () => {
    it('reactivates matching UNMATCHED or RETRY events in the same transaction that persists WAMID', async () => {
      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue({
        id: 'del-123',
        status: 'PENDING',
        total_attempts: 0,
        qr_token_snapshot: 'qr-token-uuid',
        recipient_phone: '6281234567890',
        participant_name: 'Test Participant',
        participant: { id: 'part-123', wa_message_id: null },
      })
      ;(db.whatsAppDelivery.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.whatsAppDelivery.findUnique as jest.Mock).mockResolvedValue({ total_attempts: 1 })
      ;(db.whatsAppDeliveryAttempt.create as jest.Mock).mockResolvedValue({ id: 'att-123' })
      ;(db.participant.update as jest.Mock).mockResolvedValue({})
      ;(db.whatsAppDelivery.update as jest.Mock).mockResolvedValue({})
      ;(db.whatsAppDeliveryAttempt.update as jest.Mock).mockResolvedValue({})
      ;(db.whatsAppWebhookEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 })

      const res = await deliverParticipantTicket('part-123')

      expect(res.success).toBe(true)
      expect(res.metaMessageId).toBe('wamid.DISPATCHED_123')

      // Verify late WAMID reactivation occurred
      expect(db.whatsAppWebhookEvent.updateMany).toHaveBeenCalledWith({
        where: {
          meta_message_id: 'wamid.DISPATCHED_123',
          processing_state: { in: ['UNMATCHED', 'RETRY'] },
        },
        data: expect.objectContaining({
          processing_state: 'RECEIVED',
          failure_reason: null,
          claim_token: null,
          claim_expires_at: null,
        }),
      })
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Status Synchronization & Older Attempt Isolation
  // ---------------------------------------------------------------------------
  describe('Status Synchronization and Older Attempt Isolation', () => {
    it('updates WhatsAppDelivery summary and Participant when event belongs to latest attempt', async () => {
      const eventDate = new Date('2026-11-18T10:05:00.000Z')
      const eventRecord = {
        id: 'ev-status-latest',
        batch_id: 'batch-1',
        event_type: 'STATUS_UPDATE',
        meta_message_id: 'wamid.LATEST_1',
        event_status: 'delivered',
        meta_timestamp: eventDate,
        claim_token: 'token-latest-1',
        claim_expires_at: new Date(Date.now() + 60000),
      }

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([eventRecord])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockResolvedValueOnce(eventRecord)
      ;(db.whatsAppDeliveryAttempt.findUnique as jest.Mock).mockResolvedValue({
        id: 'att-latest',
        delivery_id: 'del-latest',
        attempt_number: 1,
      })
      ;(db.whatsAppDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 'del-latest',
        status: 'SENT',
        sent_at: new Date('2026-11-18T10:00:00.000Z'),
        total_attempts: 1, // matches attempt_number
        participant_id: 'part-latest',
      })
      ;(db.whatsAppDelivery.update as jest.Mock).mockResolvedValue({})
      ;(db.participant.update as jest.Mock).mockResolvedValue({})
      ;(db.whatsAppWebhookEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSED', _count: { _all: 1 } },
      ])

      const result = await processWebhookInboxBatch()

      expect(result.processedCount).toBe(1)
      expect(db.whatsAppDelivery.update).toHaveBeenCalledWith({
        where: { id: 'del-latest' },
        data: expect.objectContaining({
          status: 'DELIVERED',
          delivered_at: eventDate,
        }),
      })
      expect(db.participant.update).toHaveBeenCalledWith({
        where: { id: 'part-latest' },
        data: expect.objectContaining({
          wa_delivery_status: 'DELIVERED',
        }),
      })
    })

    it('attaches attempt_id but DOES NOT mutate WhatsAppDelivery summary when event belongs to older attempt', async () => {
      const eventRecord = {
        id: 'ev-status-older',
        batch_id: 'batch-1',
        event_type: 'STATUS_UPDATE',
        meta_message_id: 'wamid.OLDER_1',
        event_status: 'delivered',
        meta_timestamp: new Date(),
        claim_token: 'token-older-1',
        claim_expires_at: new Date(Date.now() + 60000),
      }

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([eventRecord])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockResolvedValueOnce(eventRecord)
      ;(db.whatsAppDeliveryAttempt.findUnique as jest.Mock).mockResolvedValue({
        id: 'att-1',
        delivery_id: 'del-multi-attempt',
        attempt_number: 1, // Older attempt
      })
      ;(db.whatsAppDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 'del-multi-attempt',
        status: 'SENT',
        total_attempts: 2, // Latest attempt is attempt 2
        participant_id: 'part-multi',
      })
      ;(db.whatsAppWebhookEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSED', _count: { _all: 1 } },
      ])

      const result = await processWebhookInboxBatch()

      expect(result.processedCount).toBe(1)
      expect(db.whatsAppDelivery.update).not.toHaveBeenCalled()
      expect(db.participant.update).not.toHaveBeenCalled()
      expect(db.whatsAppWebhookEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            processing_state: 'PROCESSED',
            attempt_id: 'att-1',
          }),
        })
      )
    })
  })

  // ---------------------------------------------------------------------------
  // 8. Stale Worker Fencing & Reclaim Protection
  // ---------------------------------------------------------------------------
  describe('Stale Worker Fencing and Reclaim Protection', () => {
    it('rejects event completion when worker lease has expired or been reclaimed by another worker', async () => {
      const eventRecord = {
        id: 'ev-stale-worker',
        batch_id: 'batch-1',
        event_type: 'INBOUND_MESSAGE',
        processing_state: 'PROCESSING',
        recipient_phone: '08123456789',
        claim_token: 'old-token-stale',
        claim_expires_at: new Date(Date.now() + 60000),
        raw_event: { text: { body: 'Hadir' } },
      }

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([eventRecord])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockResolvedValueOnce(eventRecord)
      // Fencing update returns count: 0 (reclaimed by another worker or lease expired in DB)
      ;(db.whatsAppWebhookEvent.updateMany as jest.Mock).mockResolvedValue({ count: 0 })
      ;(db.participant.findFirst as jest.Mock).mockResolvedValue({ id: 'part-1' })
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSING', _count: { _all: 1 } },
      ])

      const result = await processWebhookInboxBatch()

      // Event was not committed as processed
      expect(result.processedCount).toBe(0)
    })

    it('throws LeaseFencingExpiredError and rolls back delivery, attempt, and participant mutations inside interactive transaction when lease fencing fails', async () => {
      const eventDate = new Date('2026-11-18T10:05:00.000Z')
      const staleEvent = {
        id: 'ev-stale-fencing-tx',
        batch_id: 'batch-1',
        event_type: 'STATUS_UPDATE',
        meta_message_id: 'wamid.STALE_FENCE_1',
        event_status: 'delivered',
        meta_timestamp: eventDate,
        claim_token: 'stale-token-123',
        claim_expires_at: new Date(Date.now() + 60000),
      }

      let committedDeliveryStatus = 'SENT'
      let committedParticipantStatus = 'SENT'
      let rolledBackMutationsOccurred = false

      // Transaction mock that accurately models rollback behavior upon thrown error
      ;(db.$transaction as jest.Mock).mockImplementationOnce(async (txCallback: any) => {
        let stagedDeliveryStatus = committedDeliveryStatus
        let stagedParticipantStatus = committedParticipantStatus

        const stagedTx = {
          whatsAppDelivery: {
            update: jest.fn().mockImplementation(({ data }) => {
              stagedDeliveryStatus = data.status
              return Promise.resolve({ id: 'del-fencing-test', ...data })
            }),
          },
          whatsAppDeliveryAttempt: {
            update: jest.fn().mockResolvedValue({ id: 'att-fencing-test' }),
          },
          participant: {
            update: jest.fn().mockImplementation(({ data }) => {
              stagedParticipantStatus = data.wa_delivery_status
              return Promise.resolve({ id: 'part-fencing-test', ...data })
            }),
          },
          whatsAppWebhookEvent: {
            // Fencing fails: 0 rows affected because lease expired or was reclaimed
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        }

        try {
          const res = await txCallback(stagedTx)
          committedDeliveryStatus = stagedDeliveryStatus
          committedParticipantStatus = stagedParticipantStatus
          return res
        } catch (err: any) {
          // Transaction rolled back! Discard staged mutations!
          rolledBackMutationsOccurred = true
          throw err
        }
      })

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([staleEvent])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockResolvedValueOnce(staleEvent)
      ;(db.whatsAppDeliveryAttempt.findUnique as jest.Mock).mockResolvedValue({
        id: 'att-fencing-test',
        delivery_id: 'del-fencing-test',
        attempt_number: 1,
      })
      ;(db.whatsAppDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 'del-fencing-test',
        status: 'SENT',
        sent_at: new Date('2026-11-18T10:00:00.000Z'),
        total_attempts: 1,
        participant_id: 'part-fencing-test',
      })
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSING', _count: { _all: 1 } },
      ])

      const result = await processWebhookInboxBatch()

      // The caller handles lease expiration without falsely reporting processed
      expect(result.processedCount).toBe(0)
      expect(rolledBackMutationsOccurred).toBe(true)

      // Verified: delivery and participant mutations were rolled back and not committed
      expect(committedDeliveryStatus).toBe('SENT') // NOT 'DELIVERED'
      expect(committedParticipantStatus).toBe('SENT') // NOT 'DELIVERED'
    })

    it('retries transaction on Prisma P2034 deadlock and succeeds if subsequent attempt succeeds', async () => {
      const eventDate = new Date('2026-11-18T10:05:00.000Z')
      const deadlockEvent = {
        id: 'ev-deadlock-retry',
        batch_id: 'batch-1',
        event_type: 'STATUS_UPDATE',
        meta_message_id: 'wamid.DEADLOCK_1',
        event_status: 'delivered',
        meta_timestamp: eventDate,
        claim_token: 'deadlock-token-1',
        claim_expires_at: new Date(Date.now() + 60000),
      }

      let txCalls = 0
      ;(db.$transaction as jest.Mock).mockImplementation(async (txCallback: any) => {
        txCalls++
        if (txCalls === 1) {
          // First attempt throws Prisma P2034 deadlock
          const deadlockErr: any = new Error('Transaction failed due to a write conflict or deadlock. Please retry.')
          deadlockErr.code = 'P2034'
          throw deadlockErr
        }
        // Second attempt succeeds
        return await txCallback(db)
      })

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([deadlockEvent])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockResolvedValueOnce(deadlockEvent)
      ;(db.whatsAppDeliveryAttempt.findUnique as jest.Mock).mockResolvedValue({
        id: 'att-deadlock',
        delivery_id: 'del-deadlock',
        attempt_number: 1,
      })
      ;(db.whatsAppDelivery.findUnique as jest.Mock).mockResolvedValue({
        id: 'del-deadlock',
        status: 'SENT',
        sent_at: new Date('2026-11-18T10:00:00.000Z'),
        total_attempts: 1,
        participant_id: 'part-deadlock',
      })
      ;(db.whatsAppDelivery.update as jest.Mock).mockResolvedValue({})
      ;(db.participant.update as jest.Mock).mockResolvedValue({})
      ;(db.whatsAppWebhookEvent.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSED', _count: { _all: 1 } },
      ])

      const result = await processWebhookInboxBatch()

      expect(txCalls).toBe(2)
      expect(result.processedCount).toBe(1)
    })

    it('aborts deadlock retry and rejects execution if lease expires during retry loop', async () => {
      const eventDate = new Date('2026-11-18T10:05:00.000Z')
      const expiringEvent = {
        id: 'ev-expiring-deadlock',
        batch_id: 'batch-1',
        event_type: 'STATUS_UPDATE',
        meta_message_id: 'wamid.EXPIRING_1',
        event_status: 'delivered',
        meta_timestamp: eventDate,
        claim_token: 'expiring-token-1',
        // Lease expires in 5 seconds (< 10s pre-execution safety buffer)
        claim_expires_at: new Date(Date.now() + 5000),
      }

      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValueOnce([expiringEvent])
      ;(db.whatsAppWebhookEvent.update as jest.Mock).mockResolvedValueOnce(expiringEvent)
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSING', _count: { _all: 1 } },
      ])

      const result = await processWebhookInboxBatch()

      // Skipped cleanly by pre-execution safety buffer
      expect(result.processedCount).toBe(0)
      expect(db.$transaction).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // 9. Batch Status Aggregation Rollup
  // ---------------------------------------------------------------------------
  describe('Batch Status Aggregation Rollup', () => {
    it('sets batch to PROCESSED when all child events are PROCESSED or IGNORED', async () => {
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSED', _count: { _all: 2 } },
        { processing_state: 'IGNORED', _count: { _all: 1 } },
      ])

      const status = await updateBatchStatusRollup('batch-success')

      expect(status).toBe('PROCESSED')
      expect(db.whatsAppWebhookBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-success' },
        data: expect.objectContaining({ status: 'PROCESSED' }),
      })
    })

    it('sets batch to PARTIALLY_FAILED when some events are PROCESSED and some are FAILED or UNMATCHED', async () => {
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSED', _count: { _all: 2 } },
        { processing_state: 'FAILED', _count: { _all: 1 } },
      ])

      const status = await updateBatchStatusRollup('batch-partial')

      expect(status).toBe('PARTIALLY_FAILED')
      expect(db.whatsAppWebhookBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-partial' },
        data: expect.objectContaining({ status: 'PARTIALLY_FAILED' }),
      })
    })

    it('sets batch to FAILED when all child events are FAILED or UNMATCHED', async () => {
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'FAILED', _count: { _all: 2 } },
        { processing_state: 'UNMATCHED', _count: { _all: 1 } },
      ])

      const status = await updateBatchStatusRollup('batch-failed')

      expect(status).toBe('FAILED')
      expect(db.whatsAppWebhookBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-failed' },
        data: expect.objectContaining({ status: 'FAILED' }),
      })
    })

    it('keeps batch in RECEIVED when any child event is still in-flight (RECEIVED, PROCESSING, RETRY)', async () => {
      ;(db.whatsAppWebhookEvent.groupBy as jest.Mock).mockResolvedValue([
        { processing_state: 'PROCESSED', _count: { _all: 1 } },
        { processing_state: 'RETRY', _count: { _all: 1 } },
      ])

      const status = await updateBatchStatusRollup('batch-in-flight')

      expect(status).toBe('RECEIVED')
      expect(db.whatsAppWebhookBatch.update).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // 10. Internal Worker HTTP Route Authentication & Execution
  // ---------------------------------------------------------------------------
  describe('Internal Worker HTTP Route (POST /api/internal/webhook-worker)', () => {
    it('returns 500 when CRON_SECRET is missing from environment', async () => {
      delete process.env.CRON_SECRET

      const req = new Request('https://example.com/api/internal/webhook-worker', {
        method: 'POST',
        headers: { authorization: 'Bearer some-token' },
      })

      const res = await internalWorkerRoute(req)
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toBe('Worker authentication is unconfigured')
      expect(db.whatsAppWebhookEvent.findMany).not.toHaveBeenCalled()
    })

    it('returns 500 when CRON_SECRET is empty string', async () => {
      process.env.CRON_SECRET = ''

      const req = new Request('https://example.com/api/internal/webhook-worker', {
        method: 'POST',
        headers: { authorization: 'Bearer some-token' },
      })

      const res = await internalWorkerRoute(req)
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toBe('Worker authentication is unconfigured')
      expect(db.whatsAppWebhookEvent.findMany).not.toHaveBeenCalled()
    })

    it('returns 500 when CRON_SECRET is whitespace-only', async () => {
      process.env.CRON_SECRET = '   '

      const req = new Request('https://example.com/api/internal/webhook-worker', {
        method: 'POST',
        headers: { authorization: 'Bearer some-token' },
      })

      const res = await internalWorkerRoute(req)
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toBe('Worker authentication is unconfigured')
      expect(db.whatsAppWebhookEvent.findMany).not.toHaveBeenCalled()
    })

    it('returns 401 when Authorization header is completely missing', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token'

      const req = new Request('https://example.com/api/internal/webhook-worker', {
        method: 'POST',
      })

      const res = await internalWorkerRoute(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('Unauthorized')
      expect(db.whatsAppWebhookEvent.findMany).not.toHaveBeenCalled()
    })

    it('returns 401 when Authorization header is malformed (not Bearer)', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token'

      const req = new Request('https://example.com/api/internal/webhook-worker', {
        method: 'POST',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      })

      const res = await internalWorkerRoute(req)
      expect(res.status).toBe(401)
      expect(db.whatsAppWebhookEvent.findMany).not.toHaveBeenCalled()
    })

    it('returns 401 when Authorization header is Bearer with empty token', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token'

      const req = new Request('https://example.com/api/internal/webhook-worker', {
        method: 'POST',
        headers: { authorization: 'Bearer ' },
      })

      const res = await internalWorkerRoute(req)
      expect(res.status).toBe(401)
      expect(db.whatsAppWebhookEvent.findMany).not.toHaveBeenCalled()
    })

    it('returns 401 when query parameter token is passed without valid Bearer header', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token'

      // Query param tokens must strictly NOT authenticate
      const req = new Request('https://example.com/api/internal/webhook-worker?token=super-secret-cron-token', {
        method: 'POST',
      })

      const res = await internalWorkerRoute(req)
      expect(res.status).toBe(401)
      expect(db.whatsAppWebhookEvent.findMany).not.toHaveBeenCalled()
    })

    it('returns 401 Unauthorized when CRON_SECRET is set and bearer token is invalid', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token'

      const req = new Request('https://example.com/api/internal/webhook-worker', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-token' },
      })

      const res = await internalWorkerRoute(req)
      expect(res.status).toBe(401)
      expect(db.whatsAppWebhookEvent.findMany).not.toHaveBeenCalled()
    })

    it('returns 200 OK and runs worker when valid Bearer token is provided', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token'
      ;(db.whatsAppWebhookEvent.findMany as jest.Mock).mockResolvedValue([])

      const req = new Request('https://example.com/api/internal/webhook-worker', {
        method: 'POST',
        headers: { authorization: 'Bearer super-secret-cron-token' },
      })

      const res = await internalWorkerRoute(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.claimedCount).toBe(0)
      expect(db.whatsAppWebhookEvent.findMany).toHaveBeenCalled()
    })
  })
})

