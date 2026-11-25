jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/services/config.service', () => ({
  getRegistrationSettings: jest.fn(),
}))

import { db } from '@/lib/db'
import { cancelParticipant } from '@/services/dashboard.service'
import { getRegistrationSettings } from '@/services/config.service'

let participants: any[] = []
let deliveries: any[] = []

const fakeDb: any = {
  participant: {
    findUnique: async ({ where }: any) =>
      participants.find((p) => p.id === where.id) ?? null,
    findFirst: async ({ where, orderBy }: any) => {
      const rows = participants
        .filter((p) => (where.status ? p.status === where.status : true))
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      return orderBy?.created_at === 'asc' ? rows[0] ?? null : rows[0] ?? null
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0
      for (const p of participants) {
        if (where.id && p.id !== where.id) continue
        if (where.status && p.status !== where.status) continue
        Object.assign(p, data)
        count++
      }
      return { count }
    },
  },
  whatsAppDelivery: {
    updateMany: async ({ where, data }: any) => {
      let count = 0
      for (const d of deliveries) {
        if (where.participant_id && d.participant_id !== where.participant_id) continue
        if (where.status?.in && !where.status.in.includes(d.status)) continue
        Object.assign(d, data)
        count++
      }
      return { count }
    },
    create: async ({ data }: any) => {
      const row = { id: `del-${deliveries.length + 1}`, ...data }
      deliveries.push(row)
      return row
    },
  },
  $executeRaw: async () => 1,
  $transaction: async (fn: any) => fn(fakeDb),
}

const settings = (autoPromoteWaitlist = true) => ({
  totalCapacity: 450,
  maxOnlineQuota: 450,
  isRegistrationOpen: true,
  autoPromoteWaitlist,
})

beforeEach(() => {
  participants = []
  deliveries = []
  Object.assign(db as any, fakeDb)
  ;(getRegistrationSettings as jest.Mock).mockResolvedValue(settings())
})

describe('cancelParticipant with waitlist promotion', () => {
  it('cancels the participant, cancels the pending delivery and promotes the oldest waitlisted', async () => {
    participants = [
      { id: 'p1', status: 'REGISTERED', created_at: new Date('2026-11-20T10:00:00Z') },
      { id: 'w1', status: 'WAITLISTED', created_at: new Date('2026-11-20T11:00:00Z') },
      { id: 'w2', status: 'WAITLISTED', created_at: new Date('2026-11-20T12:00:00Z') },
    ]
    deliveries = [{ id: 'd1', participant_id: 'p1', status: 'PENDING' }]

    const cancelled = await cancelParticipant('p1')

    expect(cancelled.status).toBe('CANCELLED')
    expect(participants.find((p) => p.id === 'w1')?.status).toBe('REGISTERED')
    expect(participants.find((p) => p.id === 'w2')?.status).toBe('WAITLISTED')
    expect(deliveries.find((d) => d.id === 'd1')?.status).toBe('CANCELLED')
    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_id: 'w1', status: 'PENDING' }),
      ])
    )
  })

  it('does not promote when auto_promote_waitlist is false', async () => {
    ;(getRegistrationSettings as jest.Mock).mockResolvedValue(settings(false))
    participants = [
      { id: 'p1', status: 'REGISTERED', created_at: new Date('2026-11-20T10:00:00Z') },
      { id: 'w1', status: 'WAITLISTED', created_at: new Date('2026-11-20T11:00:00Z') },
    ]

    await cancelParticipant('p1')

    expect(participants.find((p) => p.id === 'w1')?.status).toBe('WAITLISTED')
    expect(deliveries).toHaveLength(0)
  })

  it('promotes two different people for two cancellations', async () => {
    participants = [
      { id: 'p1', status: 'REGISTERED', created_at: new Date('2026-11-20T09:00:00Z') },
      { id: 'p2', status: 'REGISTERED', created_at: new Date('2026-11-20T10:00:00Z') },
      { id: 'w1', status: 'WAITLISTED', created_at: new Date('2026-11-20T11:00:00Z') },
      { id: 'w2', status: 'WAITLISTED', created_at: new Date('2026-11-20T12:00:00Z') },
    ]

    await cancelParticipant('p1')
    await cancelParticipant('p2')

    expect(participants.find((p) => p.id === 'w1')?.status).toBe('REGISTERED')
    expect(participants.find((p) => p.id === 'w2')?.status).toBe('REGISTERED')
  })

  it('refuses to cancel a checked-in participant', async () => {
    participants = [
      { id: 'p1', status: 'CHECKED_IN', created_at: new Date('2026-11-20T10:00:00Z') },
      { id: 'w1', status: 'WAITLISTED', created_at: new Date('2026-11-20T11:00:00Z') },
    ]

    await expect(cancelParticipant('p1')).rejects.toThrow(/Check-In/i)
    expect(participants.find((p) => p.id === 'p1')?.status).toBe('CHECKED_IN')
    expect(participants.find((p) => p.id === 'w1')?.status).toBe('WAITLISTED')
  })

  it('creates no delivery when nobody is waiting', async () => {
    participants = [
      { id: 'p1', status: 'REGISTERED', created_at: new Date('2026-11-20T10:00:00Z') },
    ]

    await cancelParticipant('p1')

    expect(participants.find((p) => p.id === 'p1')?.status).toBe('CANCELLED')
    expect(deliveries).toHaveLength(0)
  })
})
