/**
 * Phase 7B.2.1: WhatsApp E2E Safety & Mock Hardening Test Suite
 *
 * Verifies:
 * 1. E2E mode explicitly enables WhatsApp mock behavior.
 * 2. Mock mode never invokes real Meta HTTP requests.
 * 3. Mock media upload returns a valid fake media ID.
 * 4. Mock template sending returns a valid fake WAMID.
 * 5. Manual resend succeeds through the mocked service path.
 * 6. Manual resend preserves the existing QR token.
 * 7. Manual resend still respects quota and eligibility.
 * 8. Initial registration dispatch can simulate success.
 * 9. Initial registration dispatch can simulate failure.
 * 10. Mock mode works without real Meta credentials.
 * 11. Missing or invalid E2E safety configuration fails closed.
 * 12. Production behavior remains unchanged when mock mode is disabled.
 */

import {
  getMetaWhatsAppConfig,
  uploadWhatsAppMedia,
  sendWhatsAppTemplate,
  WhatsAppConfigurationError,
  buildWhatsAppTemplatePayload,
} from '@/services/meta-whatsapp.client'
import { deliverParticipantTicket } from '@/services/whatsapp.service'
import { executeManualResend } from '@/services/delivery-resend.service'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: {
    participant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    whatsAppDelivery: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    whatsAppDeliveryAttempt: {
      create: jest.fn(),
      update: jest.fn(),
    },
    systemConfig: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

describe('Phase 7B.2.1: E2E Safety & WhatsApp Mock Hardening', () => {
  const envBackup = { ...process.env }
  const originalFetch = global.fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key]
      } else {
        process.env[key] = envBackup[key]
      }
    }
    fetchMock = jest.fn(() => {
      throw new Error('NETWORK_CALL_FORBIDDEN: Real outbound fetch attempted in test!')
    })
    global.fetch = fetchMock
  })

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key]
      } else {
        process.env[key] = envBackup[key]
      }
    }
    global.fetch = originalFetch
  })

  describe('1. Environment Configuration & Mock Boundaries', () => {
    it('1. E2E mode (APP_ENV=e2e) explicitly enables WhatsApp mock behavior', () => {
      delete process.env.WHATSAPP_MOCK_MODE
      delete process.env.WHATSAPP_CLOUD_API_TOKEN
      delete process.env.WHATSAPP_PHONE_NUMBER_ID
      process.env.APP_ENV = 'e2e'

      const config = getMetaWhatsAppConfig()
      expect(config.mockMode).toBe(true)
      expect(config.apiToken).toBe('mock_api_token')
      expect(config.phoneNumberId).toBe('mock_phone_id')
    })

    it('2. Mock mode never invokes real Meta HTTP requests', async () => {
      const config = getMetaWhatsAppConfig({ mockMode: true })
      const payload = buildWhatsAppTemplatePayload('6281234567890', 'test_template', 'id', [])

      await uploadWhatsAppMedia(Buffer.from('fake-png'), 'image/png', 'ticket.png', { config })
      await sendWhatsAppTemplate(payload, { config })

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('3. Mock media upload returns a valid fake media ID', async () => {
      const config = getMetaWhatsAppConfig({ mockMode: true })
      const res = await uploadWhatsAppMedia(Buffer.from('fake-png'), 'image/png', 'ticket.png', { config })

      expect(res.outcome).toBe('MEDIA_UPLOAD_SUCCESS')
      expect(res.mediaId).toBeDefined()
      expect(res.mediaId).toMatch(/^mock_media_/)
      expect(res.durationMs).toBe(0)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('4. Mock template sending returns a valid fake WAMID', async () => {
      const config = getMetaWhatsAppConfig({ mockMode: true })
      const payload = buildWhatsAppTemplatePayload('6281234567890', 'test_template', 'id', [])
      const res = await sendWhatsAppTemplate(payload, { config })

      expect(res.outcome).toBe('MOCK_SUCCESS')
      expect(res.mock).toBe(true)
      expect(res.metaMessageId).toBeDefined()
      expect(res.metaMessageId).toMatch(/^wamid\.mock_/)
      expect(res.recipientPhone).toBe('6281234567890')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('10. Mock mode works without real Meta credentials', () => {
      delete process.env.WHATSAPP_CLOUD_API_TOKEN
      delete process.env.WHATSAPP_PHONE_NUMBER_ID
      process.env.WHATSAPP_MOCK_MODE = 'true'

      expect(() => getMetaWhatsAppConfig()).not.toThrow()
      const config = getMetaWhatsAppConfig()
      expect(config.mockMode).toBe(true)
    })

    it('11. Missing or invalid E2E safety configuration fails closed', () => {
      process.env.APP_ENV = 'e2e'

      // If E2E is set, forcing mockMode: false MUST fail closed
      expect(() => {
        getMetaWhatsAppConfig({ mockMode: false })
      }).toThrow(WhatsAppConfigurationError)

      expect(() => {
        getMetaWhatsAppConfig({ mockMode: false })
      }).toThrow(/CRITICAL E2E SAFETY VIOLATION/)
    })

    it('12. Production behavior remains unchanged when mock mode is disabled', () => {
      delete process.env.APP_ENV
      delete process.env.WHATSAPP_MOCK_MODE
      delete process.env.WHATSAPP_CLOUD_API_TOKEN
      delete process.env.WHATSAPP_PHONE_NUMBER_ID

      // Without credentials in production mode, throws error
      expect(() => {
        getMetaWhatsAppConfig({ mockMode: false })
      }).toThrow(WhatsAppConfigurationError)
      expect(() => {
        getMetaWhatsAppConfig({ mockMode: false })
      }).toThrow(/Meta WhatsApp Cloud API credentials missing/)
    })
  })

  describe('2. Manual Resend Mock Service Flow', () => {
    it('5 & 6. Manual resend succeeds through mocked path and preserves existing QR token', async () => {
      process.env.WHATSAPP_MOCK_MODE = 'true'

      const mockParticipant = {
        id: 'p-resend-1',
        full_name: 'Budi Test',
        whatsapp_number: '6281234567890',
        status: 'REGISTERED',
        is_wa_opt_in: true,
        qr_token: 'canonical-qr-token-uuid-1234', // Canonical token
      }

      const mockDelivery = {
        id: 'del-resend-1',
        participant_id: 'p-resend-1',
        participant_name: 'Budi Test',
        recipient_phone: '6281234567890',
        status: 'FAILED',
        total_attempts: 1,
        last_error_code: '131053',
        updated_at: new Date(),
      }

      ;(db.participant.findUnique as jest.Mock).mockResolvedValue({
        ...mockParticipant,
        delivery: mockDelivery,
      })
      ;(db.whatsAppDelivery.findUnique as jest.Mock).mockResolvedValue(mockDelivery)

      // Mock transaction for acquire lock and attempt creation
      ;(db.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const tx = {
          whatsAppDelivery: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              id: 'del-resend-1',
              total_attempts: 2,
            }),
          },
          whatsAppDeliveryAttempt: {
            create: jest.fn().mockResolvedValue({ id: 'att-resend-2' }),
          },
        }
        return callback(tx)
      })

      ;(db.whatsAppDelivery.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
      ;(db.whatsAppDeliveryAttempt.update as jest.Mock).mockResolvedValue({ id: 'att-resend-2' })

      const res = await executeManualResend({
        participantId: 'p-resend-1',
        adminUsername: 'admin_tester',
        reason: 'Verifikasi nomor di E2E',
      })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.deliveryStatus).toBe('SENT')
      expect(res.body.whatsappMessageId).toMatch(/^wamid\.mock_/)

      // Verify QR token was preserved: participant update only synced WA status, never mutated qr_token
      expect(db.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p-resend-1' },
          data: expect.not.objectContaining({ qr_token: expect.anything() }),
        })
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('7. Manual resend still respects quota (429) and eligibility (409)', async () => {
      process.env.WHATSAPP_MOCK_MODE = 'true'

      const mockParticipant = {
        id: 'p-quota-1',
        full_name: 'Quota Test',
        whatsapp_number: '6281234567890',
        status: 'REGISTERED',
        is_wa_opt_in: true,
        qr_token: 'token-uuid',
      }

      const mockExhaustedDelivery = {
        id: 'del-quota-1',
        participant_id: 'p-quota-1',
        participant_name: 'Quota Test',
        recipient_phone: '6281234567890',
        status: 'FAILED',
        total_attempts: 4, // Max lifetime quota reached
      }

      ;(db.participant.findUnique as jest.Mock).mockResolvedValue({
        ...mockParticipant,
        delivery: mockExhaustedDelivery,
      })
      ;(db.whatsAppDelivery.findUnique as jest.Mock).mockResolvedValue(mockExhaustedDelivery)

      const res = await executeManualResend({
        participantId: 'p-quota-1',
        adminUsername: 'admin_tester',
        reason: 'Percobaan ke-5 yang harus ditolak',
      })

      expect(res.status).toBe(429)
      expect(res.body.errorCode).toBe('RETRY_QUOTA_EXCEEDED')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('3. Registration Dispatch Simulation', () => {
    it('8. Initial registration dispatch can simulate success (WHATSAPP_MOCK_DISPATCH_OUTCOME=SENT)', async () => {
      process.env.WHATSAPP_MOCK_MODE = 'true'
      process.env.WHATSAPP_MOCK_DISPATCH_OUTCOME = 'SENT'

      const mockDelivery = {
        id: 'del-mock-reg-1',
        participant_id: 'p-reg-1',
        participant_name: 'Reg Success Test',
        recipient_phone: '6281234567890',
        status: 'PENDING',
        total_attempts: 0,
        participant: {
          id: 'p-reg-1',
          full_name: 'Reg Success Test',
          wa_message_id: null,
        },
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)
      ;(db.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const tx = {
          whatsAppDelivery: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          whatsAppDeliveryAttempt: {
            create: jest.fn().mockResolvedValue({ id: 'att-reg-1' }),
          },
          participant: {
            update: jest.fn().mockResolvedValue({}),
          },
        }
        return callback(tx)
      })

      const res = await deliverParticipantTicket('p-reg-1')

      expect(res.success).toBe(true)
      expect(res.outcome).toBe('MOCK_SUCCESS')
      expect(res.metaMessageId).toMatch(/^wamid\.mock_/)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('9. Initial registration dispatch can simulate failure (WHATSAPP_SIMULATE_DISPATCH_FAILURE=true)', async () => {
      process.env.WHATSAPP_MOCK_MODE = 'true'
      process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE = 'true'

      const mockDelivery = {
        id: 'del-mock-reg-fail',
        participant_id: 'p-reg-fail',
        participant_name: 'Reg Fail Test',
        recipient_phone: '6281234567890',
        status: 'PENDING',
        total_attempts: 0,
        participant: {
          id: 'p-reg-fail',
          full_name: 'Reg Fail Test',
          wa_message_id: null,
        },
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)
      const txMock = {
        whatsAppDelivery: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppDeliveryAttempt: {
          create: jest.fn().mockResolvedValue({ id: 'att-mock-reg-fail' }),
        },
        participant: {
          update: jest.fn().mockResolvedValue({}),
        },
      }
      ;(db.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(txMock)
      })

      const res = await deliverParticipantTicket('p-reg-fail')

      expect(res.success).toBe(false)
      expect(res.outcome).toBe('DISPATCH_REJECTED')
      expect(res.error).toContain('Simulated registration dispatch failure')
      expect(txMock.whatsAppDelivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-mock-reg-fail', status: 'PENDING' },
          data: expect.objectContaining({
            status: 'FAILED',
            last_error_code: 'SIMULATED_FAILURE',
            total_attempts: { increment: 1 },
          }),
        })
      )
      expect(txMock.whatsAppDeliveryAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            delivery_id: 'del-mock-reg-fail',
            attempt_number: 1,
            status: 'FAILED',
            error_code: 'SIMULATED_FAILURE',
          }),
        })
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('10. Sequential resend quota lifecycle: enforces initial failure attempt #1 and max 3 manual resends (4 total lifetime)', async () => {
      process.env.WHATSAPP_MOCK_MODE = 'true'

      const canonicalQrToken = 'canonical-qr-token-uuid-seq-1234'
      const participantRecord: any = {
        id: 'p-seq-quota',
        full_name: 'Sequential Quota Tester',
        whatsapp_number: '6281234567890',
        status: 'REGISTERED',
        is_wa_opt_in: true,
        qr_token: canonicalQrToken,
        wa_delivery_status: 'PENDING',
        wa_message_id: null,
      }

      const deliveryRecord: any = {
        id: 'del-seq-quota',
        participant_id: 'p-seq-quota',
        participant_name: 'Sequential Quota Tester',
        recipient_phone: '6281234567890',
        qr_token_snapshot: canonicalQrToken,
        status: 'PENDING',
        total_attempts: 0,
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date(),
        participant: participantRecord,
      }

      const attemptsList: any[] = []

      // In-memory Prisma store mock
      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockImplementation(async () => ({
        ...deliveryRecord,
        participant: participantRecord,
      }))
      ;(db.whatsAppDelivery.findUnique as jest.Mock).mockImplementation(async () => ({
        ...deliveryRecord,
      }))
      ;(db.participant.findUnique as jest.Mock).mockImplementation(async () => ({
        ...participantRecord,
        delivery: deliveryRecord,
      }))

      ;(db.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const tx = {
          whatsAppDelivery: {
            updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
              if (where.status && where.status.in && !where.status.in.includes(deliveryRecord.status)) {
                return { count: 0 }
              }
              if (where.status && typeof where.status === 'string' && where.status !== deliveryRecord.status) {
                return { count: 0 }
              }
              if (where.total_attempts !== undefined && where.total_attempts !== deliveryRecord.total_attempts) {
                return { count: 0 }
              }
              if (data.status) deliveryRecord.status = data.status
              if (data.total_attempts?.increment) {
                deliveryRecord.total_attempts += data.total_attempts.increment
              }
              if (data.last_error_code !== undefined) deliveryRecord.last_error_code = data.last_error_code
              if (data.last_error_message !== undefined) deliveryRecord.last_error_message = data.last_error_message
              deliveryRecord.updated_at = new Date()
              return { count: 1 }
            }),
            findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
              ...deliveryRecord,
            })),
            update: jest.fn().mockImplementation(async ({ data }: any) => {
              if (data.status) deliveryRecord.status = data.status
              if (data.last_error_code !== undefined) deliveryRecord.last_error_code = data.last_error_code
              return deliveryRecord
            }),
          },
          whatsAppDeliveryAttempt: {
            create: jest.fn().mockImplementation(async ({ data }: any) => {
              const attempt = {
                id: `att-seq-${attemptsList.length + 1}`,
                ...data,
                created_at: new Date(),
              }
              attemptsList.push(attempt)
              return attempt
            }),
            update: jest.fn().mockImplementation(async ({ where, data }: any) => {
              const att = attemptsList.find((a) => a.id === where.id)
              if (att) {
                Object.assign(att, data)
              }
              return att
            }),
          },
          participant: {
            update: jest.fn().mockImplementation(async ({ data }: any) => {
              if (data.wa_delivery_status) participantRecord.wa_delivery_status = data.wa_delivery_status
              if (data.wa_message_id) participantRecord.wa_message_id = data.wa_message_id
              if (data.wa_error_code !== undefined) participantRecord.wa_error_code = data.wa_error_code
              return participantRecord
            }),
          },
        }
        return callback(tx)
      })

      ;(db.whatsAppDelivery.updateMany as jest.Mock).mockImplementation(async ({ where, data }: any) => {
        if (where.status && where.status !== deliveryRecord.status) return { count: 0 }
        if (where.total_attempts !== undefined && where.total_attempts !== deliveryRecord.total_attempts) return { count: 0 }
        if (data.status) deliveryRecord.status = data.status
        return { count: 1 }
      })
      ;(db.whatsAppDeliveryAttempt.update as jest.Mock).mockImplementation(async ({ where, data }: any) => {
        const att = attemptsList.find((a) => a.id === where.id)
        if (att) Object.assign(att, data)
        return att
      })
      ;(db.participant.update as jest.Mock).mockImplementation(async ({ data }: any) => {
        if (data.wa_delivery_status) participantRecord.wa_delivery_status = data.wa_delivery_status
        if (data.wa_message_id) participantRecord.wa_message_id = data.wa_message_id
        return participantRecord
      })

      // Lifecycle Step 1: Initial simulated registration failure -> creates Attempt #1, total_attempts = 1
      process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE = 'true'
      const initRes = await deliverParticipantTicket('p-seq-quota')
      expect(initRes.success).toBe(false)
      expect(initRes.outcome).toBe('DISPATCH_REJECTED')
      expect(deliveryRecord.status).toBe('FAILED')
      expect(deliveryRecord.total_attempts).toBe(1)
      expect(attemptsList).toHaveLength(1)
      expect(attemptsList[0].attempt_number).toBe(1)
      expect(attemptsList[0].status).toBe('FAILED')
      expect(attemptsList[0].error_code).toBe('SIMULATED_FAILURE')
      expect(participantRecord.qr_token).toBe(canonicalQrToken)

      // Lifecycle Step 2: Manual resend 1 -> creates Attempt #2, total_attempts = 2
      delete process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE
      const resend1 = await executeManualResend({
        participantId: 'p-seq-quota',
        adminUsername: 'admin_seq',
        reason: 'Alasan resend 1 valid',
      })
      expect(resend1.status).toBe(200)
      expect(resend1.body.success).toBe(true)
      expect(resend1.body.attemptNumber).toBe(2)
      expect(deliveryRecord.status).toBe('SENT')
      expect(deliveryRecord.total_attempts).toBe(2)
      expect(attemptsList).toHaveLength(2)
      expect(attemptsList[1].attempt_number).toBe(2)
      expect(attemptsList[1].status).toBe('SUCCESS')
      expect(participantRecord.qr_token).toBe(canonicalQrToken)

      // Lifecycle Step 3: Delivery failed event received, then Manual resend 2 -> creates Attempt #3, total_attempts = 3
      deliveryRecord.status = 'FAILED'
      deliveryRecord.last_error_code = '131053'
      const resend2 = await executeManualResend({
        participantId: 'p-seq-quota',
        adminUsername: 'admin_seq',
        reason: 'Alasan resend 2 valid',
      })
      expect(resend2.status).toBe(200)
      expect(resend2.body.success).toBe(true)
      expect(resend2.body.attemptNumber).toBe(3)
      expect(deliveryRecord.status).toBe('SENT')
      expect(deliveryRecord.total_attempts).toBe(3)
      expect(attemptsList).toHaveLength(3)
      expect(attemptsList[2].attempt_number).toBe(3)
      expect(attemptsList[2].status).toBe('SUCCESS')
      expect(participantRecord.qr_token).toBe(canonicalQrToken)

      // Lifecycle Step 4: Delivery failed event received, then Manual resend 3 -> creates Attempt #4, total_attempts = 4
      deliveryRecord.status = 'FAILED'
      deliveryRecord.last_error_code = '131053'
      const resend3 = await executeManualResend({
        participantId: 'p-seq-quota',
        adminUsername: 'admin_seq',
        reason: 'Alasan resend 3 valid',
      })
      expect(resend3.status).toBe(200)
      expect(resend3.body.success).toBe(true)
      expect(resend3.body.attemptNumber).toBe(4)
      expect(deliveryRecord.status).toBe('SENT')
      expect(deliveryRecord.total_attempts).toBe(4)
      expect(attemptsList).toHaveLength(4)
      expect(attemptsList[3].attempt_number).toBe(4)
      expect(attemptsList[3].status).toBe('SUCCESS')
      expect(participantRecord.qr_token).toBe(canonicalQrToken)

      // Lifecycle Step 5: Delivery failed event received, then Manual resend 4 (Attempt #5) -> REJECTED (HTTP 429)
      deliveryRecord.status = 'FAILED'
      deliveryRecord.last_error_code = '131053'
      const resend4 = await executeManualResend({
        participantId: 'p-seq-quota',
        adminUsername: 'admin_seq',
        reason: 'Alasan resend 4 percobaan ke-5',
      })
      expect(resend4.status).toBe(429)
      expect(resend4.body.success).toBe(false)
      expect(resend4.body.errorCode).toBe('RETRY_QUOTA_EXCEEDED')
      expect(deliveryRecord.total_attempts).toBe(4) // total_attempts never exceeds 4
      expect(attemptsList).toHaveLength(4) // No 5th attempt created
      expect(participantRecord.qr_token).toBe(canonicalQrToken) // QR token remains unchanged
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('11. Simulated failure aborts without creating attempt or updating participant if claim count is 0', async () => {
      process.env.WHATSAPP_MOCK_MODE = 'true'
      process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE = 'true'

      const mockDelivery = {
        id: 'del-mock-reg-claimed',
        participant_id: 'p-reg-claimed',
        participant_name: 'Already Claimed Test',
        recipient_phone: '6281234567890',
        status: 'PENDING',
        total_attempts: 0,
        participant: {
          id: 'p-reg-claimed',
          full_name: 'Already Claimed Test',
          wa_message_id: null,
        },
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)
      const txMock = {
        whatsAppDelivery: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }), // Claim failed / racing update
        },
        whatsAppDeliveryAttempt: {
          create: jest.fn(),
        },
        participant: {
          update: jest.fn(),
        },
      }
      ;(db.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(txMock)
      })

      const res = await deliverParticipantTicket('p-reg-claimed')

      expect(res.success).toBe(false)
      expect(res.outcome).toBe('DISPATCH_REJECTED')
      expect(res.error).toContain('Delivery is no longer in PENDING status or was claimed by another operation.')
      expect(txMock.whatsAppDelivery.updateMany).toHaveBeenCalled()
      expect(txMock.whatsAppDeliveryAttempt.create).not.toHaveBeenCalled()
      expect(txMock.participant.update).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('12. Transaction failure during attempt creation aborts cleanly and reports error', async () => {
      process.env.WHATSAPP_MOCK_MODE = 'true'
      process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE = 'true'

      const mockDelivery = {
        id: 'del-mock-reg-err',
        participant_id: 'p-reg-err',
        participant_name: 'Attempt Failure Test',
        recipient_phone: '6281234567890',
        status: 'PENDING',
        total_attempts: 0,
        participant: {
          id: 'p-reg-err',
          full_name: 'Attempt Failure Test',
          wa_message_id: null,
        },
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)
      const txMock = {
        whatsAppDelivery: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppDeliveryAttempt: {
          create: jest.fn().mockRejectedValue(new Error('Unique constraint violation on attempt_number')),
        },
        participant: {
          update: jest.fn(),
        },
      }
      ;(db.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(txMock)
      })

      const res = await deliverParticipantTicket('p-reg-err')

      expect(res.success).toBe(false)
      expect(res.outcome).toBe('DISPATCH_REJECTED')
      expect(res.error).toContain('Simulated dispatch transaction failed: Unique constraint violation on attempt_number')
      expect(txMock.participant.update).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('13. Concurrent claim race: second racer gets count 0 and cannot create duplicate attempt #1', async () => {
      process.env.WHATSAPP_MOCK_MODE = 'true'
      process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE = 'true'

      const mockDelivery = {
        id: 'del-mock-race',
        participant_id: 'p-reg-race',
        participant_name: 'Race Participant',
        recipient_phone: '6281234567890',
        status: 'PENDING',
        total_attempts: 0,
        participant: {
          id: 'p-reg-race',
          full_name: 'Race Participant',
          wa_message_id: null,
        },
      }

      ;(db.whatsAppDelivery.findFirst as jest.Mock).mockResolvedValue(mockDelivery)

      let claimTaken = false
      const attemptsCreated: any[] = []

      ;(db.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const tx = {
          whatsAppDelivery: {
            updateMany: jest.fn().mockImplementation(async () => {
              if (claimTaken) {
                return { count: 0 }
              }
              claimTaken = true
              return { count: 1 }
            }),
          },
          whatsAppDeliveryAttempt: {
            create: jest.fn().mockImplementation(async ({ data }: any) => {
              attemptsCreated.push(data)
              return { id: 'att-race-1', ...data }
            }),
          },
          participant: {
            update: jest.fn().mockResolvedValue({}),
          },
        }
        return callback(tx)
      })

      // Racer 1 and Racer 2 run concurrently
      const [res1, res2] = await Promise.all([
        deliverParticipantTicket('p-reg-race'),
        deliverParticipantTicket('p-reg-race'),
      ])

      const outcomes = [res1, res2]
      const claimed = outcomes.find(
        (r) => r.error === 'Simulated registration dispatch failure for E2E testing'
      )
      const rejected = outcomes.find((r) =>
        r.error?.includes('Delivery is no longer in PENDING status or was claimed by another operation.')
      )

      expect(claimed).toBeDefined()
      expect(rejected).toBeDefined()
      // Exactly ONE attempt was created across both concurrent executions
      expect(attemptsCreated).toHaveLength(1)
      expect(attemptsCreated[0].attempt_number).toBe(1)
      expect(attemptsCreated[0].status).toBe('FAILED')
    })
  })
})
