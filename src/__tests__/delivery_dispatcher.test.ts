jest.mock('@/lib/db', () => ({
  db: {
    whatsAppDeliveryAttempt: { count: jest.fn() },
    whatsAppDelivery: { findMany: jest.fn() },
  },
}))
jest.mock('@/services/whatsapp.service', () => ({
  deliverParticipantTicket: jest.fn(),
}))

import { db } from '@/lib/db'
import { dispatchPendingTickets } from '@/services/delivery-dispatcher.service'
import { deliverParticipantTicket } from '@/services/whatsapp.service'

const originalEnv = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...originalEnv }
  process.env.WHATSAPP_SENDING_ENABLED = 'true'
  process.env.WHATSAPP_DAILY_SEND_CAP = '249'
  ;(db.whatsAppDeliveryAttempt.count as jest.Mock).mockResolvedValue(0)
  ;(db.whatsAppDelivery.findMany as jest.Mock).mockResolvedValue([])
  ;(deliverParticipantTicket as jest.Mock).mockResolvedValue({ success: true })
})

afterAll(() => {
  process.env = originalEnv
})

describe('dispatchPendingTickets', () => {
  it('does nothing while the sending switch is off', async () => {
    process.env.WHATSAPP_SENDING_ENABLED = 'false'

    const result = await dispatchPendingTickets()

    expect(result.enabled).toBe(false)
    expect(result.attempted).toBe(0)
    expect(db.whatsAppDeliveryAttempt.count).not.toHaveBeenCalled()
    expect(db.whatsAppDelivery.findMany).not.toHaveBeenCalled()
  })

  it('treats an unset switch as off', async () => {
    delete process.env.WHATSAPP_SENDING_ENABLED

    const result = await dispatchPendingTickets()

    expect(result.enabled).toBe(false)
    expect(deliverParticipantTicket).not.toHaveBeenCalled()
  })

  it('does nothing when the 24h cap is already used', async () => {
    ;(db.whatsAppDeliveryAttempt.count as jest.Mock).mockResolvedValue(249)

    const result = await dispatchPendingTickets()

    expect(result.attempted).toBe(0)
    expect(result.remaining).toBe(0)
    expect(db.whatsAppDelivery.findMany).not.toHaveBeenCalled()
  })

  it('dispatches pending rows oldest first and counts the result', async () => {
    ;(db.whatsAppDelivery.findMany as jest.Mock).mockResolvedValue([
      { id: 'd-old', participant_id: 'p-old' },
      { id: 'd-new', participant_id: 'p-new' },
    ])

    const result = await dispatchPendingTickets()

    expect(db.whatsAppDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
        orderBy: { created_at: 'asc' },
        take: 249,
      })
    )
    expect(deliverParticipantTicket).toHaveBeenNthCalledWith(1, 'p-old')
    expect(deliverParticipantTicket).toHaveBeenNthCalledWith(2, 'p-new')
    expect(result).toMatchObject({ enabled: true, attempted: 2, sent: 2, failed: 0, remaining: 247 })
  })

  it('respects a custom cap and only takes the remaining budget', async () => {
    process.env.WHATSAPP_DAILY_SEND_CAP = '3'
    ;(db.whatsAppDeliveryAttempt.count as jest.Mock).mockResolvedValue(2)
    ;(db.whatsAppDelivery.findMany as jest.Mock).mockResolvedValue([
      { id: 'd1', participant_id: 'p1' },
    ])

    const result = await dispatchPendingTickets()

    expect(db.whatsAppDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 })
    )
    expect(result.attempted).toBe(1)
    expect(result.remaining).toBe(0)
  })

  it('stops on a configuration error instead of burning the whole batch', async () => {
    ;(db.whatsAppDelivery.findMany as jest.Mock).mockResolvedValue([
      { id: 'd1', participant_id: 'p1' },
      { id: 'd2', participant_id: 'p2' },
    ])
    ;(deliverParticipantTicket as jest.Mock).mockResolvedValue({
      success: false,
      outcome: 'CONFIG_ERROR',
      error: 'missing credentials',
    })

    const result = await dispatchPendingTickets()

    expect(deliverParticipantTicket).toHaveBeenCalledTimes(1)
    expect(result.stoppedOnConfigError).toBe(true)
    expect(result.failed).toBe(1)
  })

  it('continues past a single failed recipient', async () => {
    ;(db.whatsAppDelivery.findMany as jest.Mock).mockResolvedValue([
      { id: 'd1', participant_id: 'p1' },
      { id: 'd2', participant_id: 'p2' },
    ])
    ;(deliverParticipantTicket as jest.Mock)
      .mockResolvedValueOnce({ success: false, outcome: 'DISPATCH_REJECTED' })
      .mockResolvedValueOnce({ success: true })

    const result = await dispatchPendingTickets()

    expect(deliverParticipantTicket).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ attempted: 2, sent: 1, failed: 1 })
  })
})
