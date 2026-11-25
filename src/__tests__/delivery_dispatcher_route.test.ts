jest.mock('@/services/delivery-dispatcher.service', () => ({
  dispatchPendingTickets: jest.fn(),
}))

import { POST } from '@/app/api/internal/delivery-dispatcher/route'
import { dispatchPendingTickets } from '@/services/delivery-dispatcher.service'

const originalSecret = process.env.CRON_SECRET

const request = (token?: string) =>
  new Request('http://localhost/api/internal/delivery-dispatcher', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'cron-secret'
  ;(dispatchPendingTickets as jest.Mock).mockResolvedValue({
    enabled: true,
    attempted: 1,
    sent: 1,
    failed: 0,
    remaining: 248,
    stoppedOnConfigError: false,
  })
})

describe('POST /api/internal/delivery-dispatcher', () => {
  it('fails closed when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET

    const response = await POST(request('anything'))

    expect(response.status).toBe(500)
    expect(dispatchPendingTickets).not.toHaveBeenCalled()
  })

  it('rejects a missing or wrong bearer token', async () => {
    expect((await POST(request())).status).toBe(401)
    expect((await POST(request('wrong'))).status).toBe(401)
    expect(dispatchPendingTickets).not.toHaveBeenCalled()
  })

  it('runs the dispatcher with the correct token', async () => {
    const response = await POST(request('cron-secret'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(dispatchPendingTickets).toHaveBeenCalledTimes(1)
    expect(json).toMatchObject({ enabled: true, attempted: 1, sent: 1 })
  })
})
