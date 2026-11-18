import { registerParticipant, registerBatchParticipants } from '@/services/registration.service'
import { deliverParticipantTicket } from '@/services/whatsapp.service'
import { db } from '@/lib/db'
import { uploadWhatsAppMedia, sendWhatsAppTemplate } from '@/services/meta-whatsapp.client'

jest.mock('@/services/meta-whatsapp.client', () => {
  const actual = jest.requireActual('@/services/meta-whatsapp.client')
  return {
    __esModule: true,
    ...actual,
    uploadWhatsAppMedia: jest.fn(),
    sendWhatsAppTemplate: jest.fn(),
  }
})

jest.mock('@/lib/db', () => {
  const mockDb: any = {
    participant: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    whatsAppDelivery: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ total_attempts: 1 }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    whatsAppDeliveryAttempt: {
      create: jest.fn(),
      update: jest.fn(),
    },
    systemConfig: {
      findUnique: jest.fn(),
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

describe('Phase 4B: Registration and WhatsApp Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue({ value: '400' })
    ;(db.participant.count as jest.Mock).mockResolvedValue(10)
    ;(db.participant.findFirst as jest.Mock).mockResolvedValue(null)
    ;(db.whatsAppDelivery.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  })

  describe('1. Phone Number Normalization & Validation', () => {
    it('normalizes local 08... format into canonical 628... format upon registration', async () => {
      ;(db.participant.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'p-norm-1', ...data, created_at: new Date() })
      )
      ;(db.whatsAppDelivery.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'del-norm-1', ...data })
      )

      const result = await registerParticipant({
        full_name: 'Dewi Lestari',
        whatsapp_number: '081234567890',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      })

      expect(result.whatsapp_number).toBe('6281234567890')
      expect(db.participant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            whatsapp_number: '6281234567890',
            wa_delivery_status: 'PENDING',
          }),
        })
      )
      expect(db.whatsAppDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipient_phone: '6281234567890',
            participant_name: 'Dewi Lestari',
            status: 'PENDING',
          }),
        })
      )
    })

    it('rejects invalid or non-Indonesian phone numbers before database persistence', async () => {
      await expect(
        registerParticipant({
          full_name: 'Foreign Participant',
          whatsapp_number: '+14155552671',
          church_status: 'BERGEREJA',
          is_wa_opt_in: true,
        })
      ).rejects.toThrow('Only Indonesian phone numbers (+62) are supported.')

      expect(db.participant.create).not.toHaveBeenCalled()
      expect(db.whatsAppDelivery.create).not.toHaveBeenCalled()
    })

    it('rejects duplicate participant matching legacy 08... or canonical 628... in database', async () => {
      ;(db.participant.findFirst as jest.Mock).mockResolvedValue({
        id: 'p-existing-legacy',
        full_name: 'Dewi Lestari',
        whatsapp_number: '081234567890',
        status: 'REGISTERED',
      })

      await expect(
        registerParticipant({
          full_name: 'Dewi Lestari',
          whatsapp_number: '6281234567890',
          church_status: 'BERGEREJA',
          is_wa_opt_in: true,
        })
      ).rejects.toThrow('sudah terdaftar')

      expect(db.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            full_name: 'Dewi Lestari',
            whatsapp_number: { in: ['6281234567890', '081234567890'] },
          }),
        })
      )
      expect(db.participant.create).not.toHaveBeenCalled()
    })
  })

  describe('2. Mandatory Atomic Creation & Rollback on Failure (FIX 1)', () => {
    it('creates Participant and WhatsAppDelivery atomically inside a Prisma transaction', async () => {
      ;(db.participant.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'p-tx-1', ...data, created_at: new Date() })
      )
      ;(db.whatsAppDelivery.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'del-tx-1', ...data })
      )

      const result = await registerParticipant({
        full_name: 'Agus Salim',
        whatsapp_number: '081399990000',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      })

      expect(db.$transaction).toHaveBeenCalled()
      expect(result.id).toBe('p-tx-1')
      expect(db.whatsAppDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            participant_id: 'p-tx-1',
            participant_name: 'Agus Salim',
            recipient_phone: '6281399990000',
            status: 'PENDING',
          }),
        })
      )
    })

    it('rolls back and rejects registration if WhatsAppDelivery creation fails', async () => {
      ;(db.participant.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'p-rollback-1', ...data, created_at: new Date() })
      )
      ;(db.whatsAppDelivery.create as jest.Mock).mockRejectedValue(
        new Error('Database error during delivery insertion')
      )

      await expect(
        registerParticipant({
          full_name: 'Fail Delivery',
          whatsapp_number: '081399991111',
          church_status: 'BERGEREJA',
          is_wa_opt_in: true,
        })
      ).rejects.toThrow('Database error during delivery insertion')
    })
  })

  describe('3. Concurrency Protection & Dispatch Ownership Lock (FIX 3)', () => {
    const originalEnv = process.env.WHATSAPP_MOCK_MODE
    const originalToken = process.env.WHATSAPP_CLOUD_API_TOKEN
    const originalPhone = process.env.WHATSAPP_PHONE_NUMBER_ID

    beforeEach(() => {
      process.env.WHATSAPP_MOCK_MODE = 'false'
      process.env.WHATSAPP_CLOUD_API_TOKEN = 'test-token'
      process.env.WHATSAPP_PHONE_NUMBER_ID = '1302620062943874'
    })

    afterEach(() => {
      process.env.WHATSAPP_MOCK_MODE = originalEnv
      process.env.WHATSAPP_CLOUD_API_TOKEN = originalToken
      process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhone
    })

    it('prevents concurrent duplicate dispatch: only one acquires ownership, second is blocked with 0 Meta calls', async () => {
      const mockParticipant = {
        id: 'part-concur-1',
        full_name: 'Concurrent Runner',
        whatsapp_number: '6281299998888',
        qr_token: 'qr-concur-1',
        wa_delivery_status: 'PENDING',
      }
      const mockDelivery = {
        id: 'del-concur-1',
        participant_id: 'part-concur-1',
        participant_name: 'Concurrent Runner',
        recipient_phone: '6281299998888',
        qr_token_snapshot: 'qr-concur-1',
        status: 'PENDING',
        total_attempts: 0,
        participant: mockParticipant,
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)
      ;(db.whatsAppDeliveryAttempt.create as jest.Mock).mockResolvedValue({ id: 'att-concur-1' })

      // Simulate atomic lock: first updateMany succeeds with count 1, second gets count 0
      let callCount = 0
      ;(db.whatsAppDelivery.updateMany as jest.Mock).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ count: 1 })
        }
        return Promise.resolve({ count: 0 })
      })

      ;(uploadWhatsAppMedia as jest.Mock).mockResolvedValue({
        outcome: 'MEDIA_UPLOAD_SUCCESS',
        mediaId: 'media-concur-1',
        httpStatus: 200,
        durationMs: 50,
      })
      ;(sendWhatsAppTemplate as jest.Mock).mockResolvedValue({
        outcome: 'DISPATCH_SUCCESS',
        metaMessageId: 'wamid.CONCUR_1',
        recipientPhone: '6281299998888',
        httpStatus: 200,
        durationMs: 50,
      })

      // Run two concurrent dispatch requests simultaneously
      const [res1, res2] = await Promise.all([
        deliverParticipantTicket('part-concur-1'),
        deliverParticipantTicket('part-concur-1'),
      ])

      // One call succeeds
      expect(res1.success).toBe(true)
      expect(res1.outcome).toBe('DISPATCH_SUCCESS')
      expect(res1.metaMessageId).toBe('wamid.CONCUR_1')

      // The losing call is safely blocked
      expect(res2.success).toBe(false)
      expect(res2.outcome).toBe('DISPATCH_REJECTED')
      expect(res2.error).toContain('failed to acquire exclusive ownership')

      // Exactly ONE upload and ONE sendWhatsAppTemplate were performed
      expect(uploadWhatsAppMedia).toHaveBeenCalledTimes(1)
      expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1)
    })

    it('rejects dispatch for deliveries in PROCESSING, UNKNOWN, SENT, DELIVERED, READ, FAILED, and CANCELLED', async () => {
      const nonPendingStatuses = [
        'PROCESSING',
        'UNKNOWN',
        'SENT',
        'DELIVERED',
        'READ',
        'FAILED',
        'CANCELLED',
      ]

      for (const st of nonPendingStatuses) {
        ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue({
          id: `del-status-${st}`,
          participant_id: `part-${st}`,
          status: st,
          participant: { id: `part-${st}`, wa_message_id: 'existing-id' },
        })

        const res = await deliverParticipantTicket(`part-${st}`)

        if (st === 'SENT' || st === 'DELIVERED' || st === 'READ') {
          expect(res.success).toBe(true)
          expect(res.outcome).toBe('DISPATCH_SUCCESS')
        } else if (st === 'UNKNOWN') {
          expect(res.success).toBe(false)
          expect(res.outcome).toBe('DISPATCH_TIMEOUT_AMBIGUOUS')
        } else {
          expect(res.success).toBe(false)
          expect(res.outcome).toBe('DISPATCH_REJECTED')
        }
      }

      // No external Meta calls made for any of these non-pending records
      expect(uploadWhatsAppMedia).not.toHaveBeenCalled()
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled()
    })

    it('rolls back ownership claim if attempt creation throws inside the transaction', async () => {
      const mockParticipant = {
        id: 'part-att-fail',
        full_name: 'Attempt Failure',
        whatsapp_number: '6281288887777',
        qr_token: 'qr-att-fail',
        wa_delivery_status: 'PENDING',
      }
      const mockDelivery = {
        id: 'del-att-fail',
        participant_id: 'part-att-fail',
        participant_name: 'Attempt Failure',
        recipient_phone: '6281288887777',
        qr_token_snapshot: 'qr-att-fail',
        status: 'PENDING',
        total_attempts: 0,
        participant: mockParticipant,
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)
      ;(db.whatsAppDelivery.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.whatsAppDeliveryAttempt.create as jest.Mock).mockRejectedValue(
        new Error('Failed to create attempt record in DB')
      )

      const res = await deliverParticipantTicket('part-att-fail')

      expect(res.success).toBe(false)
      expect(res.outcome).toBe('DISPATCH_REJECTED')
      expect(res.error).toContain('Failed to acquire dispatch ownership')

      // Zero Meta calls
      expect(uploadWhatsAppMedia).not.toHaveBeenCalled()
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled()
    })
  })

  describe('4. Mock Mode Isolation (Section 2.D)', () => {
    it('in mock mode: returns MOCK_SUCCESS and sets delivery status to NOT_SENT (never fake SENT/WAMID)', async () => {
      const originalEnv = process.env.WHATSAPP_MOCK_MODE
      process.env.WHATSAPP_MOCK_MODE = 'true'

      const mockParticipant = {
        id: 'part-mock-1',
        full_name: 'Siti Mock',
        whatsapp_number: '6281211112222',
        qr_token: 'uuid-qr-mock-1',
        wa_delivery_status: 'PENDING',
      }
      const mockDelivery = {
        id: 'del-mock-1',
        participant_id: 'part-mock-1',
        participant_name: 'Siti Mock',
        recipient_phone: '6281211112222',
        qr_token_snapshot: 'uuid-qr-mock-1',
        status: 'PENDING',
        total_attempts: 0,
        participant: mockParticipant,
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)
      ;(db.whatsAppDelivery.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.participant.update as jest.Mock).mockResolvedValue({ ...mockParticipant, wa_delivery_status: 'NOT_SENT' })

      const result = await deliverParticipantTicket('part-mock-1')

      process.env.WHATSAPP_MOCK_MODE = originalEnv

      expect(result.success).toBe(true)
      expect(result.outcome).toBe('MOCK_SUCCESS')
      expect(result.metaMessageId).toBeUndefined()

      // Verify that status was set to NOT_SENT, never SENT or DELIVERED
      expect(db.whatsAppDelivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-mock-1', status: 'PENDING' },
          data: expect.objectContaining({
            status: 'NOT_SENT',
          }),
        })
      )
      expect(db.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'part-mock-1' },
          data: expect.objectContaining({
            wa_delivery_status: 'NOT_SENT',
          }),
        })
      )
      // Never created a fake attempt record
      expect(db.whatsAppDeliveryAttempt.create).not.toHaveBeenCalled()
    })
  })

  describe('5. Production Dispatch & Failure Handling', () => {
    const originalEnv = process.env.WHATSAPP_MOCK_MODE
    const originalToken = process.env.WHATSAPP_CLOUD_API_TOKEN
    const originalPhone = process.env.WHATSAPP_PHONE_NUMBER_ID

    beforeEach(() => {
      process.env.WHATSAPP_MOCK_MODE = 'false'
      process.env.WHATSAPP_CLOUD_API_TOKEN = 'test-token'
      process.env.WHATSAPP_PHONE_NUMBER_ID = '1302620062943874'
      ;(db.whatsAppDelivery.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    })

    afterEach(() => {
      process.env.WHATSAPP_MOCK_MODE = originalEnv
      process.env.WHATSAPP_CLOUD_API_TOKEN = originalToken
      process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhone
    })

    it('records attempt SUCCESS and sets delivery to SENT upon valid Meta response', async () => {
      const mockParticipant = {
        id: 'part-prod-1',
        full_name: 'Eko Prod',
        whatsapp_number: '6281233334444',
        qr_token: 'uuid-qr-prod-1',
        wa_delivery_status: 'PENDING',
      }
      const mockDelivery = {
        id: 'del-prod-1',
        participant_id: 'part-prod-1',
        participant_name: 'Eko Prod',
        recipient_phone: '6281233334444',
        qr_token_snapshot: 'uuid-qr-prod-1',
        status: 'PENDING',
        total_attempts: 0,
        participant: mockParticipant,
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)
      ;(db.whatsAppDeliveryAttempt.create as jest.Mock).mockResolvedValue({ id: 'att-1' })

      ;(uploadWhatsAppMedia as jest.Mock).mockResolvedValue({
        outcome: 'MEDIA_UPLOAD_SUCCESS',
        mediaId: 'meta-media-id-999',
        httpStatus: 200,
        durationMs: 120,
      })

      ;(sendWhatsAppTemplate as jest.Mock).mockResolvedValue({
        outcome: 'DISPATCH_SUCCESS',
        metaMessageId: 'wamid.HBgLMTIzNDU2Nzg5MA==',
        recipientPhone: '6281233334444',
        httpStatus: 200,
        durationMs: 150,
      })

      const res = await deliverParticipantTicket('part-prod-1')

      expect(res.success).toBe(true)
      expect(res.outcome).toBe('DISPATCH_SUCCESS')
      expect(res.metaMessageId).toBe('wamid.HBgLMTIzNDU2Nzg5MA==')

      expect(db.whatsAppDeliveryAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-1' },
          data: expect.objectContaining({
            status: 'SUCCESS',
            meta_message_id: 'wamid.HBgLMTIzNDU2Nzg5MA==',
          }),
        })
      )
      expect(db.whatsAppDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-prod-1' },
          data: expect.objectContaining({
            status: 'SENT',
          }),
        })
      )
      expect(db.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'part-prod-1' },
          data: expect.objectContaining({
            wa_delivery_status: 'SENT',
            wa_message_id: 'wamid.HBgLMTIzNDU2Nzg5MA==',
          }),
        })
      )
    })

    it('records attempt FAILED and delivery FAILED when media upload is rejected', async () => {
      const mockParticipant = {
        id: 'part-prod-fail',
        full_name: 'Gagal Media',
        whatsapp_number: '6281255556666',
        qr_token: 'uuid-qr-fail',
        wa_delivery_status: 'PENDING',
      }
      const mockDelivery = {
        id: 'del-prod-fail',
        participant_id: 'part-prod-fail',
        participant_name: 'Gagal Media',
        recipient_phone: '6281255556666',
        qr_token_snapshot: 'uuid-qr-fail',
        status: 'PENDING',
        total_attempts: 0,
        participant: mockParticipant,
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)
      ;(db.whatsAppDeliveryAttempt.create as jest.Mock).mockResolvedValue({ id: 'att-fail-1' })

      ;(uploadWhatsAppMedia as jest.Mock).mockResolvedValue({
        outcome: 'MEDIA_UPLOAD_REJECTED',
        error: { message: 'Authentication Error', code: 190 },
        httpStatus: 401,
        durationMs: 80,
      })

      const sendTemplateSpy = sendWhatsAppTemplate as jest.Mock

      const res = await deliverParticipantTicket('part-prod-fail')

      expect(res.success).toBe(false)
      expect(res.outcome).toBe('UPLOAD_FAILED')
      // Message dispatch must be aborted when media upload fails
      expect(sendTemplateSpy).not.toHaveBeenCalled()

      expect(db.whatsAppDeliveryAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-fail-1' },
          data: expect.objectContaining({
            status: 'FAILED',
            error_code: '190',
          }),
        })
      )
      expect(db.whatsAppDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-prod-fail' },
          data: expect.objectContaining({
            status: 'FAILED',
            last_error_code: '190',
          }),
        })
      )
    })

    it('records attempt TIMEOUT_UNKNOWN and delivery UNKNOWN when Meta response is ambiguous', async () => {
      const mockParticipant = {
        id: 'part-prod-timeout',
        full_name: 'Budi Timeout',
        whatsapp_number: '6281277778888',
        qr_token: 'uuid-qr-timeout',
        wa_delivery_status: 'PENDING',
      }
      const mockDelivery = {
        id: 'del-prod-timeout',
        participant_id: 'part-prod-timeout',
        participant_name: 'Budi Timeout',
        recipient_phone: '6281277778888',
        qr_token_snapshot: 'uuid-qr-timeout',
        status: 'PENDING',
        total_attempts: 0,
        participant: mockParticipant,
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)
      ;(db.whatsAppDeliveryAttempt.create as jest.Mock).mockResolvedValue({ id: 'att-timeout' })

      ;(uploadWhatsAppMedia as jest.Mock).mockResolvedValue({
        outcome: 'MEDIA_UPLOAD_SUCCESS',
        mediaId: 'meta-media-id-timeout',
        httpStatus: 200,
        durationMs: 100,
      })

      ;(sendWhatsAppTemplate as jest.Mock).mockResolvedValue({
        outcome: 'DISPATCH_TIMEOUT_AMBIGUOUS',
        recipientPhone: '6281277778888',
        error: { message: 'Meta Cloud API HTTP request timed out.' },
        durationMs: 15000,
      })

      const res = await deliverParticipantTicket('part-prod-timeout')

      expect(res.success).toBe(false)
      expect(res.outcome).toBe('DISPATCH_TIMEOUT_AMBIGUOUS')

      expect(db.whatsAppDeliveryAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-timeout' },
          data: expect.objectContaining({
            status: 'TIMEOUT_UNKNOWN',
          }),
        })
      )
      expect(db.whatsAppDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-prod-timeout' },
          data: expect.objectContaining({
            status: 'UNKNOWN',
          }),
        })
      )
      expect(db.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'part-prod-timeout' },
          data: expect.objectContaining({
            wa_delivery_status: 'UNKNOWN',
          }),
        })
      )
    })
  })

  describe('6. Registration Resilience (Participant Not Lost on WhatsApp Error)', () => {
    it('returns participant registration data even if WhatsApp dispatch throws an unexpected exception', async () => {
      ;(db.participant.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'p-resilient', ...data, created_at: new Date() })
      )
      ;(db.whatsAppDelivery.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'del-resilient', ...data })
      )

      // Simulate whatsAppDelivery.findFirst throwing inside deliverParticipantTicket
      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockRejectedValue(
        new Error('Fatal database connection error')
      )

      const res = await registerParticipant({
        full_name: 'Budi Resilient',
        whatsapp_number: '081299887766',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      })

      // Registration is successfully returned despite dispatch exception
      expect(res.id).toBe('p-resilient')
      expect(res.full_name).toBe('Budi Resilient')
      expect(res.whatsapp_number).toBe('6281299887766')
    })
  })
})
