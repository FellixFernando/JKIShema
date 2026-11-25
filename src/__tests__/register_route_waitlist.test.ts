jest.mock('@/services/registration.service', () => ({
  registerBatchParticipants: jest.fn(),
  registerParticipant: jest.fn(),
}))

import { POST } from '@/app/api/register/route'
import { registerBatchParticipants } from '@/services/registration.service'

const request = (body: unknown) =>
  new Request('http://localhost/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const input = [
  {
    full_name: 'Test Route',
    whatsapp_number: '081234567890',
    church_status: 'BERGEREJA',
    church_branch: 'JKI Shema Sunter, Jakarta',
    is_wa_opt_in: true,
  },
]

describe('POST /api/register waitlist response', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns an empty data array and no token when the batch is waitlisted', async () => {
    ;(registerBatchParticipants as jest.Mock).mockResolvedValue([
      { id: 'p-1', status: 'WAITLISTED', qr_token: 'secret-token-must-not-leak' },
    ])

    const response = await POST(request(input))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ success: true, status: 'WAITLISTED', data: [] })
    expect(JSON.stringify(json)).not.toContain('secret-token-must-not-leak')
  })

  it('keeps the existing shape for a registered participant', async () => {
    const registered = { id: 'p-2', status: 'REGISTERED', qr_token: 'ticket-token' }
    ;(registerBatchParticipants as jest.Mock).mockResolvedValue([registered])

    const response = await POST(request(input))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json).toEqual({ success: true, data: [registered] })
  })
})
