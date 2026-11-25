jest.mock('@/lib/db', () => ({ db: {} }))

import { db } from '@/lib/db'
import { importParticipantsFromCSV } from '@/services/advanced.service'

let participants: any[] = []
let deliveries: any[] = []
let capacity = 450

const fakeDb: any = {
  systemConfig: {
    findMany: async () =>
      [{ key: 'total_venue_capacity', value: String(capacity) }],
  },
  participant: {
    count: async ({ where }: any) =>
      participants.filter((p) =>
        where?.status?.in ? where.status.in.includes(p.status) : true
      ).length,
    findFirst: async ({ where }: any) =>
      participants.find((p) => {
        if (where.full_name && p.full_name !== where.full_name) return false
        if (where.whatsapp_number?.in && !where.whatsapp_number.in.includes(p.whatsapp_number)) {
          return false
        }
        return true
      }) ?? null,
    create: async ({ data }: any) => {
      const row = { id: `p-${participants.length + 1}`, ...data }
      participants.push(row)
      return row
    },
  },
  whatsAppDelivery: {
    create: async ({ data }: any) => {
      const row = { id: `d-${deliveries.length + 1}`, ...data }
      deliveries.push(row)
      return row
    },
  },
  $executeRaw: async () => 1,
  $transaction: async (fn: any) => fn(fakeDb),
}

const csv = `Nama Lengkap,No. Telp,Apakah sudah bergereja?,Anda berjemaat di JKI Cabang?,Timestamp
Budi Santoso,0812-3456-7890,Sudah bergereja,"JKI Shema Sunter, Jakarta",2026/11/20 10:00:00
Sari Santoso,081234567890,"Belum berjemaat, rindu untuk dijangkau",Gereja Lain,2026/11/20 10:01:00
Anak Mandiri,081298765432,Sudah bergereja,JKI Shema Pontianak,2026/11/20 10:02:00`

beforeEach(() => {
  participants = []
  deliveries = []
  capacity = 450
  Object.assign(db as any, fakeDb)
})

describe('raw Google Forms import', () => {
  it('maps the four headers and infers children from a shared phone', async () => {
    const result = await importParticipantsFromCSV(csv)

    expect(result).toMatchObject({ importedCount: 3, skippedCount: 0 })
    expect(participants).toHaveLength(3)

    const budi = participants.find((p) => p.full_name === 'Budi Santoso')
    expect(budi).toMatchObject({
      whatsapp_number: '6281234567890',
      church_status: 'BERGEREJA',
      church_branch: 'JKI Shema Sunter, Jakarta',
      is_child: false,
      is_wa_opt_in: true,
      status: 'REGISTERED',
    })

    const sari = participants.find((p) => p.full_name === 'Sari Santoso')
    expect(sari).toMatchObject({
      whatsapp_number: '6281234567890',
      church_status: 'TIDAK_BERGEREJA',
      church_branch: 'Gereja Lain',
      is_child: true,
    })

    const anak = participants.find((p) => p.full_name === 'Anak Mandiri')
    expect(anak).toMatchObject({
      whatsapp_number: '6281298765432',
      is_child: false,
    })

    expect(deliveries).toHaveLength(3)
    expect(deliveries.every((d) => d.status === 'PENDING')).toBe(true)
  })

  it('strips a UTF-8 BOM from the header', async () => {
    const result = await importParticipantsFromCSV('\uFEFF' + csv)

    expect(result).toMatchObject({ importedCount: 3, skippedCount: 0 })
  })

  it('skips a duplicate name and phone inside the file', async () => {
    const withDuplicate = `${csv}
Budi Santoso,081234567890,Sudah bergereja,JKI Shema Sunter Jakarta,2026/11/20 10:03:00`

    const result = await importParticipantsFromCSV(withDuplicate)

    expect(result).toMatchObject({ importedCount: 3, skippedCount: 1 })
    expect(result.skipped[0].reason).toMatch(/duplicate/i)
  })

  it('does not write anything in dry-run mode', async () => {
    const result = await importParticipantsFromCSV(csv, { dryRun: true })

    expect(result).toMatchObject({ importedCount: 3, skippedCount: 0, dryRun: true })
    expect(participants).toHaveLength(0)
    expect(deliveries).toHaveLength(0)
  })

  it('imports only the first N rows when a limit is set', async () => {
    const result = await importParticipantsFromCSV(csv, { limit: 2 })

    expect(result.importedCount).toBe(2)
    expect(participants.map((p) => p.full_name)).toEqual(['Budi Santoso', 'Sari Santoso'])
  })

  it('enforces the configured capacity', async () => {
    capacity = 2

    await expect(importParticipantsFromCSV(csv)).rejects.toThrow(/Kapasitas/)
    expect(participants).toHaveLength(0)
  })
})
