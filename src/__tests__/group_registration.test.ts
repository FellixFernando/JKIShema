import { registerBatchParticipants } from '@/services/registration.service'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: {
    participant: {
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
    },
    systemConfig: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(db)),
  },
}))

describe('Group Registration Service (Multi-Participant)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should automatically assign primary registrant WA number to child participants', async () => {
    (db.systemConfig.findUnique as jest.Mock).mockResolvedValue({ value: '400' });
    (db.participant.count as jest.Mock).mockResolvedValue(0);
    (db.participant.findFirst as jest.Mock).mockResolvedValue(null);
    (db.participant.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({
      id: Math.random().toString(),
      ...data,
      qr_token: 'mock-qr-uuid-' + Math.random(),
      status: 'REGISTERED',
      registration_type: 'ONLINE',
      created_at: new Date(),
    }))

    const primaryWA = '081299998888'
    const results = await registerBatchParticipants([
      {
        full_name: 'Ayah Budi',
        whatsapp_number: primaryWA,
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      },
      {
        full_name: 'Anak Ani',
        whatsapp_number: '',
        church_status: 'BERGEREJA',
        is_child: true,
        is_wa_opt_in: true,
      },
    ])

    expect(results).toHaveLength(2)
    expect(results[0].whatsapp_number).toBe(primaryWA)
    expect(results[1].whatsapp_number).toBe(primaryWA)
    expect(results[1].is_child).toBe(true)
    expect(results[0].qr_token).not.toEqual(results[1].qr_token)
  })

  it('should reject batch if duplicate child name is registered under same parent WA', async () => {
    (db.systemConfig.findUnique as jest.Mock).mockResolvedValue({ value: '400' });
    (db.participant.count as jest.Mock).mockResolvedValue(0);
    
    // Smart mock for findFirst based on query params
    (db.participant.findFirst as jest.Mock).mockImplementation(({ where }) => {
      if (where.full_name === 'Anak Ani') {
        return Promise.resolve({
          id: 'c1',
          full_name: 'Anak Ani',
          whatsapp_number: '081299998888',
          status: 'REGISTERED',
        })
      }
      return Promise.resolve(null)
    })

    await expect(
      registerBatchParticipants([
        {
          full_name: 'Ayah Budi',
          whatsapp_number: '081299998888',
          church_status: 'BERGEREJA',
          is_wa_opt_in: true,
        },
        {
          full_name: 'Anak Ani',
          whatsapp_number: '',
          church_status: 'BERGEREJA',
          is_child: true,
          is_wa_opt_in: true,
        },
      ])
    ).rejects.toThrow('Peserta dengan Nama "Anak Ani" dan Nomor WhatsApp tersebut sudah terdaftar.')
  })
})
