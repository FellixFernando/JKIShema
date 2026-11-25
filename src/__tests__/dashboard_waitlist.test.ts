jest.mock('@/lib/db', () => ({
  db: {
    participant: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    whatsAppDelivery: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
  },
}))

jest.mock('@/services/config.service', () => ({
  getRegistrationSettings: jest.fn(),
}))

import { db } from '@/lib/db'
import { getDashboardStats, getParticipants } from '@/services/dashboard.service'
import { getRegistrationSettings } from '@/services/config.service'

const settings = {
  totalCapacity: 450,
  maxOnlineQuota: 450,
  isRegistrationOpen: true,
  autoPromoteWaitlist: true,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getRegistrationSettings as jest.Mock).mockResolvedValue(settings)
})

describe('getDashboardStats with waitlist', () => {
  it('returns the configured capacity, waitlist count and registration state', async () => {
    ;(db.participant.count as jest.Mock).mockImplementation(({ where }: any) => {
      if (where?.status === 'CHECKED_IN') return 100
      if (where?.status === 'CANCELLED') return 2
      if (where?.status === 'WAITLISTED') return 3
      if (where?.registration_type === 'ONLINE') return 400
      if (where?.registration_type === 'ON_SITE') return 48
      if (where?.status?.in) return 448
      return 0
    })

    const stats = await getDashboardStats()

    expect(stats).toMatchObject({
      totalCapacity: 450,
      maxOnlineQuota: 450,
      totalRegistered: 448,
      waitlistCount: 3,
      isRegistrationOpen: true,
      remainingOnlineQuota: 50,
    })
  })
})

describe('getParticipants waitlist position', () => {
  it('numbers waitlisted rows oldest first and leaves others null', async () => {
    const mainList = [
      {
        id: 'w-new',
        full_name: 'Wait New',
        whatsapp_number: '628111111111',
        church_status: 'BERGEREJA',
        church_branch: null,
        is_child: false,
        status: 'WAITLISTED',
        registration_type: 'ONLINE',
        checked_in_at: null,
        created_at: new Date('2026-11-21T10:00:00Z'),
        delivery: null,
      },
      {
        id: 'r-1',
        full_name: 'Registered One',
        whatsapp_number: '628222222222',
        church_status: 'BERGEREJA',
        church_branch: null,
        is_child: false,
        status: 'REGISTERED',
        registration_type: 'ONLINE',
        checked_in_at: null,
        created_at: new Date('2026-11-20T10:00:00Z'),
        delivery: null,
      },
    ]

    ;(db.participant.findMany as jest.Mock).mockImplementation(({ where }: any) => {
      if (where?.status === 'WAITLISTED') {
        return Promise.resolve([{ id: 'w-old' }, { id: 'w-new' }])
      }
      return Promise.resolve(mainList)
    })

    const result = await getParticipants({ status: 'ALL' })

    expect(result.find((p) => p.id === 'w-new')?.waitlist_position).toBe(2)
    expect(result.find((p) => p.id === 'r-1')?.waitlist_position).toBeNull()
  })

  it('does not query waitlist positions when the page has none', async () => {
    ;(db.participant.findMany as jest.Mock).mockResolvedValue([])

    await getParticipants({ status: 'REGISTERED' })

    expect(db.participant.findMany).toHaveBeenCalledTimes(1)
  })
})
