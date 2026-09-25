import { processCheckInByToken, processManualCheckIn } from '@/services/checkin.service'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: {
    participant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

describe('Check-In Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should successfully check-in a REGISTERED participant (Green)', async () => {
    const mockParticipant = {
      id: 'p123',
      full_name: 'Budi Santoso',
      status: 'REGISTERED',
      qr_token: 'valid-qr-123',
    };

    (db.participant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (db.participant.update as jest.Mock).mockResolvedValue({
      ...mockParticipant,
      status: 'CHECKED_IN',
      checked_in_at: new Date(),
    })

    const result = await processCheckInByToken('valid-qr-123')

    expect(result.resultCode).toBe('SUCCESS')
    expect(result.participant.full_name).toBe('Budi Santoso')
    expect(db.participant.update).toHaveBeenCalledWith({
      where: { id: 'p123' },
      data: expect.objectContaining({ status: 'CHECKED_IN' }),
    })
  })

  it('should return ALREADY_CHECKED_IN warning if participant checked in previously (Yellow)', async () => {
    const mockParticipant = {
      id: 'p123',
      full_name: 'Budi Santoso',
      status: 'CHECKED_IN',
      qr_token: 'valid-qr-123',
      checked_in_at: new Date('2026-12-25T10:00:00Z'),
    };

    (db.participant.findUnique as jest.Mock).mockResolvedValue(mockParticipant)

    const result = await processCheckInByToken('valid-qr-123')

    expect(result.resultCode).toBe('ALREADY_CHECKED_IN')
    expect(result.participant.full_name).toBe('Budi Santoso')
    expect(db.participant.update).not.toHaveBeenCalled()
  })

  it('should return INVALID_TOKEN error if qr_token does not exist (Red)', async () => {
    (db.participant.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await processCheckInByToken('invalid-qr-xyz')

    expect(result.resultCode).toBe('INVALID_TOKEN')
    expect(result.participant).toBeNull()
  })

  it('should process manual check-in by participant ID', async () => {
    const mockParticipant = {
      id: 'p999',
      full_name: 'Siti Rahma',
      status: 'REGISTERED',
    };

    (db.participant.findUnique as jest.Mock).mockResolvedValue(mockParticipant);
    (db.participant.update as jest.Mock).mockResolvedValue({
      ...mockParticipant,
      status: 'CHECKED_IN',
    })

    const result = await processManualCheckIn('p999')

    expect(result.status).toBe('CHECKED_IN')
    expect(db.participant.update).toHaveBeenCalledWith({
      where: { id: 'p999' },
      data: expect.objectContaining({ status: 'CHECKED_IN' }),
    })
  })
})
