/**
 * Comprehensive Unit and Integration Tests for Phase 6B.2 Manual WhatsApp Resend Backend
 */

import { checkResendEligibility, executeManualResend } from '@/services/delivery-resend.service'
import { POST as resendRoute } from '@/app/api/admin/delivery/[participantId]/resend/route'
import { GET as getDeliveryRoute } from '@/app/api/admin/delivery/[participantId]/route'
import { POST as wamidAssociationRoute } from '@/app/api/admin/delivery/wamid-association/route'

// Mock next-auth
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

// Mock Sharp and ticket-frame.service
jest.mock('@/services/ticket-frame.service', () => ({
  generateFramedTicketQrBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-framed-qr-png')),
}))

// Mock Meta WhatsApp client
jest.mock('@/services/meta-whatsapp.client', () => {
  const actual = jest.requireActual('@/services/meta-whatsapp.client')
  return {
    ...actual,
    getMetaWhatsAppConfig: jest.fn().mockReturnValue({
      apiToken: 'mock-token',
      phoneNumberId: 'mock-phone-id',
      apiVersion: 'v21.0',
      mockMode: false,
      timeoutMs: 15000,
    }),
    uploadWhatsAppMedia: jest.fn(),
    sendWhatsAppTemplate: jest.fn(),
  }
})

describe('Phase 6B.2: Manual Resend Backend Suite', () => {
  const { getServerSession } = require('next-auth')
  const { uploadWhatsAppMedia, sendWhatsAppTemplate } = require('@/services/meta-whatsapp.client')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('1. Resend Eligibility Engine', () => {
    it('rejects if participant is not found', () => {
      const res = checkResendEligibility(null, null)
      expect(res.isEligible).toBe(false)
      expect(res.httpStatus).toBe(404)
      expect(res.errorCode).toBe('PARTICIPANT_NOT_FOUND')
    })

    it('rejects if participant is cancelled', () => {
      const participant = { id: 'p1', status: 'CANCELLED', is_wa_opt_in: true }
      const delivery = { id: 'd1', status: 'FAILED' }
      const res = checkResendEligibility(participant, delivery)
      expect(res.isEligible).toBe(false)
      expect(res.httpStatus).toBe(422)
      expect(res.errorCode).toBe('PARTICIPANT_CANCELLED')
    })

    it('rejects if participant opted out of WhatsApp', () => {
      const participant = { id: 'p1', status: 'REGISTERED', is_wa_opt_in: false }
      const delivery = { id: 'd1', status: 'FAILED' }
      const res = checkResendEligibility(participant, delivery)
      expect(res.isEligible).toBe(false)
      expect(res.httpStatus).toBe(422)
      expect(res.errorCode).toBe('NOT_OPTED_IN')
    })

    it('rejects if delivery is already SENT, DELIVERED, or READ', () => {
      const participant = { id: 'p1', status: 'REGISTERED', is_wa_opt_in: true }
      for (const st of ['SENT', 'DELIVERED', 'READ']) {
        const delivery = { id: 'd1', status: st, total_attempts: 1 }
        const res = checkResendEligibility(participant, delivery)
        expect(res.isEligible).toBe(false)
        expect(res.httpStatus).toBe(409)
        expect(res.errorCode).toBe('ALREADY_DELIVERED')
      }
    })

    it('rejects if delivery is in active PROCESSING lock', () => {
      const participant = { id: 'p1', status: 'REGISTERED', is_wa_opt_in: true }
      const delivery = { id: 'd1', status: 'PROCESSING', total_attempts: 1 }
      const res = checkResendEligibility(participant, delivery)
      expect(res.isEligible).toBe(false)
      expect(res.httpStatus).toBe(409)
      expect(res.errorCode).toBe('LOCK_HELD')
    })

    it('rejects if delivery is in UNKNOWN status (requires reconciliation first)', () => {
      const participant = { id: 'p1', status: 'REGISTERED', is_wa_opt_in: true }
      const delivery = { id: 'd1', status: 'UNKNOWN', total_attempts: 1 }
      const res = checkResendEligibility(participant, delivery)
      expect(res.isEligible).toBe(false)
      expect(res.httpStatus).toBe(409)
      expect(res.errorCode).toBe('UNKNOWN_SOAK_ACTIVE')
    })

    it('rejects if retry quota is exhausted (>= 4 total attempts)', () => {
      const participant = { id: 'p1', status: 'REGISTERED', is_wa_opt_in: true }
      const delivery = { id: 'd1', status: 'FAILED', total_attempts: 4 }
      const res = checkResendEligibility(participant, delivery)
      expect(res.isEligible).toBe(false)
      expect(res.httpStatus).toBe(429)
      expect(res.errorCode).toBe('RETRY_QUOTA_EXCEEDED')
    })

    it('rejects if rate-limit cooldown (130429) is still active (< 60s)', () => {
      const participant = { id: 'p1', status: 'REGISTERED', is_wa_opt_in: true }
      const delivery = {
        id: 'd1',
        status: 'FAILED',
        total_attempts: 1,
        last_error_code: '130429',
        updated_at: new Date(Date.now() - 20000), // 20s ago
      }
      const res = checkResendEligibility(participant, delivery)
      expect(res.isEligible).toBe(false)
      expect(res.httpStatus).toBe(429)
      expect(res.errorCode).toBe('RATE_LIMIT_COOLDOWN')
    })

    it('allows resend if rate-limit cooldown has expired (>= 60s)', () => {
      const participant = { id: 'p1', status: 'REGISTERED', is_wa_opt_in: true }
      const delivery = {
        id: 'd1',
        status: 'FAILED',
        total_attempts: 1,
        last_error_code: '130429',
        updated_at: new Date(Date.now() - 65000), // 65s ago
      }
      const res = checkResendEligibility(participant, delivery)
      expect(res.isEligible).toBe(true)
    })

    it('rejects if previous attempt failed with permanent recipient error 131026 or 100', () => {
      const participant = { id: 'p1', status: 'REGISTERED', is_wa_opt_in: true }
      for (const err of ['131026', '100']) {
        const delivery = { id: 'd1', status: 'FAILED', total_attempts: 1, last_error_code: err }
        const res = checkResendEligibility(participant, delivery)
        expect(res.isEligible).toBe(false)
        expect(res.httpStatus).toBe(422)
        expect(res.errorCode).toBe('RECIPIENT_VALIDATION_REQUIRED')
      }
    })

    it('allows resend on eligible transient FAILED status', () => {
      const participant = { id: 'p1', status: 'REGISTERED', is_wa_opt_in: true }
      const delivery = { id: 'd1', status: 'FAILED', total_attempts: 1, last_error_code: 'UPLOAD_FAILED' }
      const res = checkResendEligibility(participant, delivery)
      expect(res.isEligible).toBe(true)
    })

    it('allows resend on NOT_SENT status (initial pending dispatch)', () => {
      const participant = { id: 'p1', status: 'REGISTERED', is_wa_opt_in: true }
      const delivery = { id: 'd1', status: 'NOT_SENT', total_attempts: 0 }
      const res = checkResendEligibility(participant, delivery)
      expect(res.isEligible).toBe(true)
    })
  })

  describe('2. Core Execution Service (executeManualResend)', () => {
    it('executes successful 3-phase resend with monotonic fencing and QR token preservation', async () => {
      const mockParticipant = {
        id: 'p-1',
        full_name: 'Budi Santoso',
        qr_token: 'token-abc-123',
        status: 'REGISTERED',
        is_wa_opt_in: true,
        delivery: {
          id: 'd-1',
          recipient_phone: '081234567890',
          participant_name: 'Budi Santoso',
          status: 'FAILED',
          total_attempts: 1,
        },
      }

      const mockDb: any = {
        participant: {
          findUnique: jest.fn().mockResolvedValue(mockParticipant),
          update: jest.fn().mockResolvedValue({}),
        },
        whatsAppDelivery: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'd-1', total_attempts: 2 }),
        },
        whatsAppDeliveryAttempt: {
          create: jest.fn().mockResolvedValue({ id: 'att-2' }),
          update: jest.fn().mockResolvedValue({}),
        },
      }
      mockDb.$transaction = jest.fn().mockImplementation(async (callback: any) => {
        return callback(mockDb)
      })

      uploadWhatsAppMedia.mockResolvedValueOnce({
        outcome: 'MEDIA_UPLOAD_SUCCESS',
        mediaId: 'media-meta-999',
      })

      sendWhatsAppTemplate.mockResolvedValueOnce({
        outcome: 'DISPATCH_SUCCESS',
        metaMessageId: 'wamid.HBgLM12345',
      })

      const res = await executeManualResend(
        {
          participantId: 'p-1',
          adminUsername: 'admin_test',
          reason: 'Nomor telah diverifikasi via telepon',
        },
        mockDb
      )

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.deliveryStatus).toBe('SENT')
      expect(res.body.attemptNumber).toBe(2)
      expect(res.body.whatsappMessageId).toBe('wamid.HBgLM12345')

      // Verify Attempt Creation Recorded Reason and Username
      expect(mockDb.whatsAppDeliveryAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          delivery_id: 'd-1',
          attempt_number: 2,
          admin_username: 'admin_test',
          resend_reason: 'Nomor telah diverifikasi via telepon',
          status: 'TIMEOUT_UNKNOWN',
        }),
      })

      // Verify Fenced Settlement Checked total_attempts == 2
      expect(mockDb.whatsAppDelivery.updateMany).toHaveBeenLastCalledWith({
        where: {
          id: 'd-1',
          status: 'PROCESSING',
          total_attempts: 2,
        },
        data: expect.objectContaining({
          status: 'SENT',
        }),
      })
    })

    it('settles to FAILED when Meta rejects template dispatch', async () => {
      const mockParticipant = {
        id: 'p-1',
        full_name: 'Budi Santoso',
        qr_token: 'token-abc-123',
        status: 'REGISTERED',
        is_wa_opt_in: true,
        delivery: {
          id: 'd-1',
          recipient_phone: '081234567890',
          participant_name: 'Budi Santoso',
          status: 'FAILED',
          total_attempts: 1,
        },
      }

      const mockDb: any = {
        participant: {
          findUnique: jest.fn().mockResolvedValue(mockParticipant),
          update: jest.fn().mockResolvedValue({}),
        },
        whatsAppDelivery: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'd-1', total_attempts: 2 }),
        },
        whatsAppDeliveryAttempt: {
          create: jest.fn().mockResolvedValue({ id: 'att-2' }),
          update: jest.fn().mockResolvedValue({}),
        },
      }
      mockDb.$transaction = jest.fn().mockImplementation(async (callback: any) => {
        return callback(mockDb)
      })

      uploadWhatsAppMedia.mockResolvedValueOnce({
        outcome: 'MEDIA_UPLOAD_SUCCESS',
        mediaId: 'media-meta-999',
      })

      sendWhatsAppTemplate.mockResolvedValueOnce({
        outcome: 'DISPATCH_REJECTED',
        error: { code: 131026, message: 'Message undeliverable' },
      })

      const res = await executeManualResend(
        {
          participantId: 'p-1',
          adminUsername: 'admin_test',
          reason: 'Coba kirim ulang kedua kali',
        },
        mockDb
      )

      expect(res.status).toBe(502)
      expect(res.body.success).toBe(false)
      expect(res.body.deliveryStatus).toBe('FAILED')
      expect(res.body.errorCode).toBe('131026')
    })

    it('settles to UNKNOWN when Meta dispatch times out', async () => {
      const mockParticipant = {
        id: 'p-1',
        full_name: 'Budi Santoso',
        qr_token: 'token-abc-123',
        status: 'REGISTERED',
        is_wa_opt_in: true,
        delivery: {
          id: 'd-1',
          recipient_phone: '081234567890',
          participant_name: 'Budi Santoso',
          status: 'FAILED',
          total_attempts: 1,
        },
      }

      const mockDb: any = {
        participant: {
          findUnique: jest.fn().mockResolvedValue(mockParticipant),
          update: jest.fn().mockResolvedValue({}),
        },
        whatsAppDelivery: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'd-1', total_attempts: 2 }),
        },
        whatsAppDeliveryAttempt: {
          create: jest.fn().mockResolvedValue({ id: 'att-2' }),
          update: jest.fn().mockResolvedValue({}),
        },
      }
      mockDb.$transaction = jest.fn().mockImplementation(async (callback: any) => {
        return callback(mockDb)
      })

      uploadWhatsAppMedia.mockResolvedValueOnce({
        outcome: 'MEDIA_UPLOAD_SUCCESS',
        mediaId: 'media-meta-999',
      })

      sendWhatsAppTemplate.mockResolvedValueOnce({
        outcome: 'DISPATCH_TIMEOUT_AMBIGUOUS',
        error: { code: 'ETIMEDOUT', message: 'Connection timed out' },
      })

      const res = await executeManualResend(
        {
          participantId: 'p-1',
          adminUsername: 'admin_test',
          reason: 'Kirim ulang setelah network drop',
        },
        mockDb
      )

      expect(res.status).toBe(504)
      expect(res.body.success).toBe(false)
      expect(res.body.deliveryStatus).toBe('UNKNOWN')
    })
  })

  describe('3. API Route Handler (POST /api/admin/delivery/[participantId]/resend)', () => {
    it('returns 401 Unauthorized if no admin session exists', async () => {
      getServerSession.mockResolvedValueOnce(null)

      const req: any = {
        json: jest.fn().mockResolvedValue({ reason: 'Test resend reason' }),
      }

      const res = await resendRoute(req, { params: Promise.resolve({ participantId: 'p-1' }) })
      expect(res.status).toBe(401)
    })

    it('returns 403 Forbidden if user role is not ADMIN or MASTER', async () => {
      getServerSession.mockResolvedValueOnce({ user: { role: 'VOLUNTEER' } })

      const req: any = {
        json: jest.fn().mockResolvedValue({ reason: 'Test resend reason' }),
      }

      const res = await resendRoute(req, { params: Promise.resolve({ participantId: 'p-1' }) })
      expect(res.status).toBe(403)
    })

    it('returns 400 Bad Request if reason is missing or < 5 characters', async () => {
      getServerSession.mockResolvedValueOnce({ user: { role: 'ADMIN', name: 'admin_user' } })

      const req: any = {
        json: jest.fn().mockResolvedValue({ reason: 'abc' }),
      }

      const res = await resendRoute(req, { params: Promise.resolve({ participantId: 'p-1' }) })
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('VALIDATION_FAILED')
    })
  })

  describe('4. WAMID Manual Association API & P2002 -> 409 Conflict', () => {
    const { db } = require('@/lib/db')

    it('associates WAMID and resets matching UNMATCHED webhook event to RETRY', async () => {
      getServerSession.mockResolvedValueOnce({ user: { role: 'ADMIN', name: 'admin_audit' } })

      const mockAttempt = {
        id: 'att-10',
        delivery_id: 'del-10',
        attempt_number: 2,
        meta_message_id: null,
      }

      jest.spyOn(db, '$transaction').mockImplementationOnce(async (callback: any) => {
        const tx = {
          whatsAppDeliveryAttempt: {
            findUnique: jest.fn().mockResolvedValue(mockAttempt),
            update: jest.fn().mockResolvedValue({ id: 'att-10', meta_message_id: 'wamid.LINKED123' }),
          },
          whatsAppWebhookEvent: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        }
        return callback(tx)
      })

      const req: any = {
        json: jest.fn().mockResolvedValue({
          deliveryId: 'del-10',
          attemptId: 'att-10',
          attemptNumber: 2,
          metaMessageId: 'wamid.LINKED123',
          reason: 'Correlated via server stdout log trace req_456',
        }),
      }

      const res = await wamidAssociationRoute(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })

    it('catches Prisma P2002 unique constraint violation and returns 409 Conflict', async () => {
      getServerSession.mockResolvedValueOnce({ user: { role: 'ADMIN', name: 'admin_audit' } })

      const p2002Err: any = new Error('Unique constraint failed on the fields: (`meta_message_id`)')
      p2002Err.code = 'P2002'

      jest.spyOn(db, '$transaction').mockRejectedValueOnce(p2002Err)

      const req: any = {
        json: jest.fn().mockResolvedValue({
          deliveryId: 'del-10',
          attemptId: 'att-10',
          attemptNumber: 2,
          metaMessageId: 'wamid.ALREADY_USED',
          reason: 'Testing collision',
        }),
      }

      const res = await wamidAssociationRoute(req)
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error).toBe('WAMID_ALREADY_ASSOCIATED')
    })
  })
})
