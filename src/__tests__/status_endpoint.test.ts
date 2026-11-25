jest.mock('@/services/config.service', () => ({
  getRegistrationSettings: jest.fn(),
}))
jest.mock('@/lib/db', () => ({
  db: { participant: { count: jest.fn() } },
}))

import { GET } from '@/app/api/status/route'
import { db } from '@/lib/db'
import { getRegistrationSettings } from '@/services/config.service'

const settings = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    totalCapacity: 450,
    maxOnlineQuota: 450,
    isRegistrationOpen: true,
    autoPromoteWaitlist: true,
    ...overrides,
  }) as any

describe('GET /api/status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getRegistrationSettings as jest.Mock).mockResolvedValue(settings())
  })

  it('returns the remaining seats and open state', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(448)

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ remaining: 2, is_open: true })
  })

  it('clamps remaining at zero when capacity is exceeded', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(460)

    const response = await GET()
    const json = await response.json()

    expect(json).toEqual({ remaining: 0, is_open: true })
  })

  it('reports the operator-closed state', async () => {
    ;(getRegistrationSettings as jest.Mock).mockResolvedValue(settings({ isRegistrationOpen: false }))
    ;(db.participant.count as jest.Mock).mockResolvedValue(10)

    const response = await GET()
    const json = await response.json()

    expect(json).toEqual({ remaining: 440, is_open: false })
  })
})
