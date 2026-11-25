import { db } from '@/lib/db'
import { registerBatchParticipants } from '@/services/registration.service'
import { deliverParticipantTicket } from '@/services/whatsapp.service'

jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/services/whatsapp.service', () => ({
  deliverParticipantTicket: jest.fn(),
}))

interface FakeParticipant {
  id: string
  full_name: string
  whatsapp_number: string
  status: string
  qr_token?: string
  created_at: Date
  [key: string]: unknown
}

let participants: FakeParticipant[] = []
let deliveries: any[] = []
let config: Record<string, string> = {}

const activeStatuses = ['REGISTERED', 'CHECKED_IN']

function matchesStatus(row: any, where: any): boolean {
  const statusFilter = where?.status
  if (!statusFilter) return true
  if (typeof statusFilter === 'string') return row.status === statusFilter
  if (statusFilter.in) return statusFilter.in.includes(row.status)
  return true
}

const fakeDb: any = {
  systemConfig: {
    findMany: async ({ where }: any) => {
      const keys: string[] = where?.key?.in ?? Object.keys(config)
      return keys.filter((key) => key in config).map((key) => ({ key, value: config[key] }))
    },
  },
  participant: {
    count: async ({ where }: any) =>
      participants.filter((p) => matchesStatus(p, where)).length,
    findFirst: async ({ where }: any) =>
      participants.find((p) => {
        if (where.full_name && p.full_name !== where.full_name) return false
        if (where.whatsapp_number?.in && !where.whatsapp_number.in.includes(p.whatsapp_number)) {
          return false
        }
        return matchesStatus(p, where)
      }) ?? null,
    create: async ({ data }: any) => {
      const row: FakeParticipant = {
        id: `p-${participants.length + 1}`,
        status: 'REGISTERED',
        created_at: new Date(),
        ...data,
      }
      participants.push(row)
      return row
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0
      for (const p of participants) {
        if (where.id && p.id !== where.id) continue
        if (!matchesStatus(p, where)) continue
        Object.assign(p, data)
        count++
      }
      return { count }
    },
  },
  whatsAppDelivery: {
    create: async ({ data }: any) => {
      deliveries.push(data)
      return data
    },
    updateMany: async () => ({ count: 0 }),
  },
  $executeRaw: async () => 1,
  $transaction: async (fn: any) => fn(fakeDb),
}

const person = (name: string, phone = '081234567890') => ({
  full_name: name,
  whatsapp_number: phone,
  church_status: 'BERGEREJA' as const,
  church_branch: 'JKI Shema Sunter, Jakarta',
  is_wa_opt_in: true,
})

function seedActive(count: number) {
  participants = Array.from({ length: count }, (_, i) => ({
    id: `active-${i}`,
    full_name: `Active ${i}`,
    whatsapp_number: `62812345${String(i).padStart(5, '0')}`,
    status: 'REGISTERED',
    created_at: new Date(2026, 0, 1, 0, i),
  }))
}

beforeEach(() => {
  participants = []
  deliveries = []
  config = {
    total_venue_capacity: '450',
    max_online_quota: '450',
    is_registration_open: 'true',
    auto_promote_waitlist: 'true',
  }
  Object.assign(db as any, fakeDb)
  ;(deliverParticipantTicket as jest.Mock).mockReset()
})

describe('registration at the capacity boundary', () => {
  it('registers a batch that fits and queues one delivery per person', async () => {
    seedActive(449)
    ;(deliverParticipantTicket as jest.Mock).mockResolvedValue({ success: true })

    const created = await registerBatchParticipants([person('Test Fits')])

    expect(created).toHaveLength(1)
    expect(created[0].status).toBe('REGISTERED')
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].status).toBe('PENDING')
    expect(deliverParticipantTicket).not.toHaveBeenCalled()
  })

  it('waitlists the whole batch when it does not fit, with no delivery rows', async () => {
    seedActive(449)

    const created = await registerBatchParticipants([person('Test A'), person('Test B')])

    expect(created.map((p) => p.status)).toEqual(['WAITLISTED', 'WAITLISTED'])
    expect(created.every((p) => typeof p.qr_token === 'string' && p.qr_token.length > 0)).toBe(true)
    expect(deliveries).toHaveLength(0)
    expect(deliverParticipantTicket).not.toHaveBeenCalled()
  })

  it('never splits a family at the boundary', async () => {
    seedActive(449)

    const created = await registerBatchParticipants([
      person('Test Parent'),
      person('Test Child'),
      person('Test Child Two'),
    ])

    expect(created.every((p) => p.status === 'WAITLISTED')).toBe(true)
    expect(deliveries).toHaveLength(0)
  })

  it('rejects an on-site registration when full with the walk-in message', async () => {
    seedActive(450)

    await expect(
      registerBatchParticipants([person('Test Walk In')], { registrationType: 'ON_SITE' })
    ).rejects.toThrow('Kapasitas penuh. Batalkan peserta yang tidak hadir terlebih dahulu.')
  })

  it('does not enforce the unused online quota split', async () => {
    config.max_online_quota = '1'
    seedActive(449)

    const created = await registerBatchParticipants([person('Test Online')])

    expect(created[0].status).toBe('REGISTERED')
  })

  it('refuses an online registration when the operator closed registration', async () => {
    config.is_registration_open = 'false'

    await expect(registerBatchParticipants([person('Test Closed')])).rejects.toThrow(/ditutup/i)
  })

  it('still allows on-site registration when online registration is closed', async () => {
    config.is_registration_open = 'false'

    const created = await registerBatchParticipants([person('Test On Site')], {
      registrationType: 'ON_SITE',
    })

    expect(created[0].status).toBe('REGISTERED')
  })

  it('treats a waitlisted person as already registered on a second attempt', async () => {
    seedActive(450)
    await registerBatchParticipants([person('Test Waiting')])

    await expect(registerBatchParticipants([person('Test Waiting')])).rejects.toThrow(/sudah terdaftar/)
  })
})
