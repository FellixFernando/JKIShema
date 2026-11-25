/**
 * Comprehensive Unit and Integration Tests for Phase 6C.2:
 * Dashboard WhatsApp Delivery Telemetry and Participant Delivery Filtering
 */

import {
  getDashboardStats,
  getParticipants,
  VALID_WA_DELIVERY_STATUSES,
} from '@/services/dashboard.service'
import { GET as dashboardRoute } from '@/app/api/admin/dashboard/route'
import { GET as participantsRoute } from '@/app/api/admin/participants/route'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/db', () => ({
  db: {
    participant: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    systemConfig: {
      findUnique: jest.fn(),
    },
    whatsAppDelivery: {
      groupBy: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

describe('Phase 6C.2: Dashboard Telemetry & Participant Delivery Filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('1. Dashboard WhatsApp Delivery Aggregation', () => {
    it('aggregates delivery statuses accurately via groupBy without N+1 queries', async () => {
      ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue({ value: '400' })
      ;(db.participant.count as jest.Mock)
        .mockResolvedValueOnce(300) // total registered
        .mockResolvedValueOnce(280) // online
        .mockResolvedValueOnce(20) // on-site
        .mockResolvedValueOnce(150) // checked-in
        .mockResolvedValueOnce(10) // cancelled
        .mockResolvedValueOnce(0) // waitlisted

      // Mock groupBy aggregation
      ;(db.whatsAppDelivery.groupBy as jest.Mock).mockResolvedValue([
        { status: 'DELIVERED', _count: { _all: 250 } },
        { status: 'READ', _count: { _all: 30 } },
        { status: 'SENT', _count: { _all: 10 } },
        { status: 'PROCESSING', _count: { _all: 2 } },
        { status: 'FAILED', _count: { _all: 5 } },
        { status: 'UNKNOWN', _count: { _all: 3 } },
      ])

      const stats = await getDashboardStats()

      // Preserved event stats
      expect(stats.totalRegistered).toBe(300)
      expect(stats.onlineCount).toBe(280)
      expect(stats.checkedInCount).toBe(150)
      expect(stats.remainingOnlineQuota).toBe(170) // 450 - 280

      // WhatsApp Delivery stats
      expect(stats.whatsappDeliveryStats).toBeDefined()
      expect(stats.whatsappDeliveryStats.delivered).toBe(250)
      expect(stats.whatsappDeliveryStats.read).toBe(30)
      expect(stats.whatsappDeliveryStats.sent).toBe(10)
      expect(stats.whatsappDeliveryStats.processing).toBe(2)
      expect(stats.whatsappDeliveryStats.failed).toBe(5)
      expect(stats.whatsappDeliveryStats.unknown).toBe(3)
      expect(stats.whatsappDeliveryStats.not_sent).toBe(0) // Defaulted to 0
      expect(stats.whatsappDeliveryStats.cancelled).toBe(0) // Defaulted to 0
      expect(stats.whatsappDeliveryStats.total).toBe(300)
    })

    it('handles zero-count statuses gracefully when no delivery records exist', async () => {
      ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue({ value: '400' })
      ;(db.participant.count as jest.Mock)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)

      ;(db.whatsAppDelivery.groupBy as jest.Mock).mockResolvedValue([])

      const stats = await getDashboardStats()

      expect(stats.whatsappDeliveryStats).toEqual({
        not_sent: 0,
        pending: 0,
        processing: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        unknown: 0,
        cancelled: 0,
        total: 0,
      })
    })
  })

  describe('2. Participant Query with WhatsApp Delivery Relation', () => {
    it('returns sanitized delivery details and excludes internal QR tokens / secrets', async () => {
      const mockRawParticipants = [
        {
          id: 'p-1',
          full_name: 'Budi Santoso',
          whatsapp_number: '081234567890',
          church_status: 'BERGEREJA',
          church_branch: 'Pusat',
          is_child: false,
          status: 'REGISTERED',
          registration_type: 'ONLINE',
          checked_in_at: null,
          created_at: new Date('2026-11-20T10:00:00Z'),
          delivery: {
            id: 'del-1',
            status: 'DELIVERED',
            total_attempts: 1,
            last_error_code: null,
            updated_at: new Date('2026-11-20T10:02:00Z'),
          },
        },
        {
          id: 'p-2',
          full_name: 'Siti Rahma',
          whatsapp_number: '081987654321',
          church_status: 'TIDAK_BERGEREJA',
          church_branch: null,
          is_child: true,
          status: 'REGISTERED',
          registration_type: 'ONLINE',
          checked_in_at: null,
          created_at: new Date('2026-11-20T11:00:00Z'),
          delivery: null, // No delivery record yet
        },
      ]

      ;(db.participant.findMany as jest.Mock).mockResolvedValue(mockRawParticipants)

      const result = await getParticipants({})

      expect(result).toHaveLength(2)

      // First participant with delivery
      expect(result[0].delivery).toEqual({
        id: 'del-1',
        status: 'DELIVERED',
        total_attempts: 1,
        last_error_code: null,
        updated_at: new Date('2026-11-20T10:02:00Z'),
      })
      // Ensure QR token snapshot is not exposed
      expect((result[0].delivery as any).qr_token_snapshot).toBeUndefined()

      // Second participant without delivery
      expect(result[1].delivery).toBeNull()
    })
  })

  describe('3. WhatsApp Delivery Status Filtering', () => {
    it('filters participants by specific WhatsApp status (e.g. FAILED)', async () => {
      ;(db.participant.findMany as jest.Mock).mockResolvedValue([])

      await getParticipants({ waStatus: 'FAILED' })

      expect(db.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            delivery: {
              status: 'FAILED',
            },
          },
        })
      )
    })

    it('filters participants without delivery record when waStatus is NO_DELIVERY', async () => {
      ;(db.participant.findMany as jest.Mock).mockResolvedValue([])

      await getParticipants({ waStatus: 'NO_DELIVERY' })

      expect(db.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            delivery: null,
          },
        })
      )
    })

    it('combines search keyword, event registration status, and WhatsApp status filters', async () => {
      ;(db.participant.findMany as jest.Mock).mockResolvedValue([])

      await getParticipants({
        search: 'Budi',
        status: 'REGISTERED',
        waStatus: 'UNKNOWN',
      })

      expect(db.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'REGISTERED',
            OR: [
              { full_name: { contains: 'Budi', mode: 'insensitive' } },
              { whatsapp_number: { contains: 'Budi' } },
            ],
            delivery: {
              status: 'UNKNOWN',
            },
          },
        })
      )
    })
  })

  describe('4. API Route Validation and Authorization', () => {
    it('returns 401 Unauthorized from GET /api/admin/dashboard when session is missing', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValueOnce(null)

      const res = await dashboardRoute()
      expect(res.status).toBe(401)
    })

    it('returns 403 Forbidden from GET /api/admin/dashboard when role is not ADMIN/MASTER', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValueOnce({
        user: { role: 'VOLUNTEER' },
      })

      const res = await dashboardRoute()
      expect(res.status).toBe(403)
    })

    it('returns 401 Unauthorized from GET /api/admin/participants when session is missing', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValueOnce(null)

      const req = new Request('http://localhost/api/admin/participants')
      const res = await participantsRoute(req)
      expect(res.status).toBe(401)
    })

    it('returns 403 Forbidden from GET /api/admin/participants when role is not ADMIN/MASTER', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValueOnce({
        user: { role: 'VOLUNTEER' },
      })

      const req = new Request('http://localhost/api/admin/participants')
      const res = await participantsRoute(req)
      expect(res.status).toBe(403)
    })

    it('returns 400 Bad Request when an invalid wa_status filter is requested', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValueOnce({
        user: { role: 'ADMIN', name: 'admin_test' },
      })

      const req = new Request('http://localhost/api/admin/participants?wa_status=INVALID_STATUS_XYZ')
      const res = await participantsRoute(req)

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('INVALID_WA_STATUS')
      expect(data.message).toContain('Nilai filter wa_status "INVALID_STATUS_XYZ" tidak valid')
    })

    it('accepts valid wa_status filters and returns filtered participants', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValueOnce({
        user: { role: 'ADMIN', name: 'admin_test' },
      })
      ;(db.participant.findMany as jest.Mock).mockResolvedValue([])

      const req = new Request('http://localhost/api/admin/participants?wa_status=DELIVERED')
      const res = await participantsRoute(req)

      expect(res.status).toBe(200)
      expect(db.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            delivery: {
              status: 'DELIVERED',
            },
          },
        })
      )
    })
  })
})
