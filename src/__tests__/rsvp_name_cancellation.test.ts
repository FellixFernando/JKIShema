jest.mock('@/lib/db', () => ({
  db: { participant: { findMany: jest.fn() } },
}))
jest.mock('@/services/dashboard.service', () => ({
  cancelParticipant: jest.fn(),
}))

import { processRSVPWebhook } from '@/services/advanced.service'
import { db } from '@/lib/db'
import { cancelParticipant } from '@/services/dashboard.service'

const people = [
  { id: 'budi', full_name: 'Budi Santoso', whatsapp_number: '6281234567890', status: 'REGISTERED' },
  { id: 'sari', full_name: 'Sari Dewi', whatsapp_number: '6281234567890', status: 'REGISTERED' },
  { id: 'joko', full_name: 'Joko Susilo', whatsapp_number: '6281234567890', status: 'CHECKED_IN' },
]

beforeEach(() => {
  jest.clearAllMocks()
  ;(db.participant.findMany as jest.Mock).mockResolvedValue(people)
  ;(cancelParticipant as jest.Mock).mockResolvedValue({ id: 'budi', status: 'CANCELLED' })
})

describe('name-gated free-text cancellation', () => {
  it('cancels only the named person on a shared phone', async () => {
    const result = await processRSVPWebhook('6281234567890', 'Batal Budi Santoso')

    expect(result.action).toBe('CANCELLED')
    expect(cancelParticipant).toHaveBeenCalledTimes(1)
    expect(cancelParticipant).toHaveBeenCalledWith('budi')
    expect(cancelParticipant).not.toHaveBeenCalledWith('sari')
  })

  it('matches names through case and punctuation', async () => {
    const result = await processRSVPWebhook('6281234567890', 'BATAL: budi santoso!')

    expect(result.action).toBe('CANCELLED')
    expect(cancelParticipant).toHaveBeenCalledWith('budi')
  })

  it('cancels nobody when the name is missing', async () => {
    const result = await processRSVPWebhook('6281234567890', 'Batal')

    expect(result.action).toBe('NEEDS_NAME')
    expect(cancelParticipant).not.toHaveBeenCalled()
  })

  it('cancels nobody when the name matches more than one person', async () => {
    const result = await processRSVPWebhook('6281234567890', 'Batal Budi Santoso dan Sari Dewi')

    expect(result.action).toBe('AMBIGUOUS')
    expect(cancelParticipant).not.toHaveBeenCalled()
  })

  it('cancels nobody when the name does not match', async () => {
    const result = await processRSVPWebhook('6281234567890', 'Batal Orang Lain')

    expect(result.action).toBe('NEEDS_NAME')
    expect(cancelParticipant).not.toHaveBeenCalled()
  })

  it('refuses a checked-in participant and flags it for review', async () => {
    const result = await processRSVPWebhook('6281234567890', 'Batal Joko Susilo')

    expect(result.action).toBe('REVIEW_CHECKED_IN')
    expect(cancelParticipant).not.toHaveBeenCalled()
  })

  it('still confirms attendance without changing state', async () => {
    const result = await processRSVPWebhook('6281234567890', 'Saya akan hadir')

    expect(result.action).toBe('CONFIRMED')
    expect(cancelParticipant).not.toHaveBeenCalled()
  })
})
