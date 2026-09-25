import { processRSVPWebhook, exportParticipantsToCSV, importParticipantsFromCSV } from '@/services/advanced.service'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: {
    participant: {
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))

describe('Advanced Admin Tools & RSVP Webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should update participant status to CANCELLED if RSVP reply is "Tidak Hadir"', async () => {
    const mockParticipant = {
      id: 'p1',
      full_name: 'Dewi Lestari',
      whatsapp_number: '08123456789',
      status: 'REGISTERED',
    };

    (db.participant.findFirst as jest.Mock).mockResolvedValue(mockParticipant);
    (db.participant.update as jest.Mock).mockResolvedValue({
      ...mockParticipant,
      status: 'CANCELLED',
    })

    const result = await processRSVPWebhook('08123456789', 'Maaf saya tidak hadir')

    expect(result.action).toBe('CANCELLED')
    expect(db.participant.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'CANCELLED' },
    })
  })

  it('should keep participant status if RSVP reply is "Hadir"', async () => {
    const mockParticipant = {
      id: 'p1',
      full_name: 'Dewi Lestari',
      whatsapp_number: '08123456789',
      status: 'REGISTERED',
    };

    (db.participant.findFirst as jest.Mock).mockResolvedValue(mockParticipant)

    const result = await processRSVPWebhook('08123456789', 'Saya akan Hadir')

    expect(result.action).toBe('CONFIRMED')
    expect(db.participant.update).not.toHaveBeenCalled()
  })

  it('should export participant array into valid CSV string', () => {
    const mockData = [
      {
        id: 'p1',
        full_name: 'Budi Santoso',
        whatsapp_number: '08123456789',
        church_status: 'BERGEREJA',
        church_branch: 'Pusat',
        is_child: false,
        qr_token: 'qr123',
        status: 'REGISTERED',
        registration_type: 'ONLINE',
        created_at: new Date('2026-12-01T10:00:00Z'),
      },
    ]

    const csv = exportParticipantsToCSV(mockData as any)

    expect(csv).toContain('Nama Lengkap,Nomor WhatsApp')
    expect(csv).toContain('"Budi Santoso","08123456789"')
  })
})
