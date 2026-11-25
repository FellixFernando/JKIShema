import { executeManualResend } from '@/services/delivery-resend.service'

const original = process.env.WHATSAPP_SENDING_ENABLED

beforeEach(() => {
  delete process.env.WHATSAPP_SENDING_ENABLED
})

afterAll(() => {
  if (original === undefined) delete process.env.WHATSAPP_SENDING_ENABLED
  else process.env.WHATSAPP_SENDING_ENABLED = original
})

const options = {
  participantId: 'p-1',
  adminUsername: 'admin',
  reason: 'test resend reason',
}

describe('manual resend kill switch', () => {
  it('blocks the resend while sending is disabled, before touching the database', async () => {
    const db = { participant: { findUnique: jest.fn() } }

    const result = await executeManualResend(options, db)

    expect(result.status).toBe(503)
    expect(result.body).toMatchObject({ success: false, errorCode: 'SENDING_DISABLED' })
    expect(db.participant.findUnique).not.toHaveBeenCalled()
  })

  it('continues to the normal eligibility path when enabled', async () => {
    process.env.WHATSAPP_SENDING_ENABLED = 'true'
    const db = { participant: { findUnique: jest.fn().mockResolvedValue(null) } }

    const result = await executeManualResend(options, db)

    expect(db.participant.findUnique).toHaveBeenCalled()
    expect(result.status).toBe(404)
  })
})
