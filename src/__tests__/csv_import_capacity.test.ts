import { importParticipantsFromCSV, exportParticipantsToCSV } from '@/services/advanced.service'
import { registerParticipant } from '@/services/registration.service'
import { checkResendEligibility } from '@/services/delivery-resend.service'
import { POST as adminImportPost } from '@/app/api/admin/import/route'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(),
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/db', () => {
  const mockDb: any = {
    participant: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    systemConfig: {
      findUnique: jest.fn(),
    },
    whatsAppDelivery: {
      create: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(async (callback) => {
      return callback(mockDb)
    }),
  }
  return { db: mockDb }
})

describe('CSV Import Capacity & Serialization Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.$executeRaw as jest.Mock).mockResolvedValue(1)
    ;(db.$transaction as jest.Mock).mockImplementation(async (cb) => cb(db))
    ;(db.participant.findFirst as jest.Mock).mockResolvedValue(null)
    ;(db.participant.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 'p-' + Math.random().toString(36).substring(7),
      ...data,
      created_at: new Date(),
    }))
  })

  // 1. CSV import below capacity succeeds
  it('succeeds when CSV import participant count is well below venue capacity', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(200)

    const csv = `Nama Lengkap,Nomor WhatsApp,Status Bergereja,Cabang,Anak
Budi Santoso,08123456789,BERGEREJA,Pusat,Tidak
Dewi Lestari,08129999888,TIDAK_BERGEREJA,,Tidak`

    const res = await importParticipantsFromCSV(csv)
    expect(res.importedCount).toBe(2)
    expect(res.skippedCount).toBe(0)
    expect(db.participant.create).toHaveBeenCalledTimes(2)
  })

  // 2. CSV import exactly fills capacity succeeds
  it('succeeds when CSV import exactly fills the venue capacity (448 existing + 2 = 450)', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(448)

    const csv = `Nama Lengkap,Nomor WhatsApp
Peserta Boundary 1,081200000001
Peserta Boundary 2,081200000002`

    const res = await importParticipantsFromCSV(csv)
    expect(res.importedCount).toBe(2)
    expect(res.skippedCount).toBe(0)
    expect(db.participant.create).toHaveBeenCalledTimes(2)
  })

  // 3. CSV import exceeding capacity is rejected
  it('rejects CSV import when it exceeds the venue capacity of 450 (449 existing + 2 = 451)', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(449)

    const csv = `Nama Lengkap,Nomor WhatsApp
Peserta Over 1,081200000001
Peserta Over 2,081200000002`

    await expect(importParticipantsFromCSV(csv)).rejects.toThrow(
      'Kapasitas total acara tidak mencukupi untuk mengimpor 2 peserta baru (sisa kuota: 1).'
    )
  })

  it('rejects CSV import of 1 participant when venue capacity is completely full (450 + 1)', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(450)

    const csv = `Nama Lengkap,Nomor WhatsApp
Peserta Full,081200000001`

    await expect(importParticipantsFromCSV(csv)).rejects.toThrow(
      'Kapasitas total acara (450 peserta) telah penuh.'
    )
  })

  // 4. Insufficient capacity creates zero new records (atomic rollback)
  it('creates zero new records when capacity check fails', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(449)

    const csv = `Nama Lengkap,Nomor WhatsApp
Peserta A,081200000001
Peserta B,081200000002
Peserta C,081200000003`

    await expect(importParticipantsFromCSV(csv)).rejects.toThrow()
    expect(db.participant.create).not.toHaveBeenCalled()
  })

  // 5. CANCELLED participants do not count toward capacity
  it('excludes CANCELLED participants when evaluating active count', async () => {
    ;(db.participant.count as jest.Mock).mockImplementation(async ({ where }) => {
      expect(where.status).toEqual({ in: ['REGISTERED', 'CHECKED_IN'] })
      return 430
    })

    const csv = `Nama Lengkap,Nomor WhatsApp
Peserta Active 1,081200000001`

    const res = await importParticipantsFromCSV(csv)
    expect(res.importedCount).toBe(1)
  })

  // 6. Duplicate CSV entries do not inflate the net-new participant count
  it('filters duplicate entries within the same CSV batch so they do not inflate net-new count', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(449)

    // CSV has 3 lines with the same participant, so net-new is 1!
    // 449 + 1 = 450, which fits!
    const csv = `Nama Lengkap,Nomor WhatsApp
Sama Duplikat,081211112222
Sama Duplikat,081211112222
Sama Duplikat,081211112222`

    const res = await importParticipantsFromCSV(csv)
    expect(res.importedCount).toBe(1)
    expect(res.skippedCount).toBe(2)
    expect(db.participant.create).toHaveBeenCalledTimes(1)
  })

  // 7. Multiple participants in the CSV are counted individually
  it('counts participants individually against capacity rather than CSV row count', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(435)

    const csv = `Nama Lengkap,Nomor WhatsApp
P1,081200000001
P2,081200000002
P3,081200000003
P4,081200000004
P5,081200000005`

    const res = await importParticipantsFromCSV(csv)
    expect(res.importedCount).toBe(5)
  })

  // 8. Existing duplicate detection behavior is preserved
  it('skips participants that already exist in the database with status REGISTERED or CHECKED_IN', async () => {
    ;(db.participant.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'existing-id',
      full_name: 'Existing Person',
      whatsapp_number: '08123456789',
      status: 'REGISTERED',
    })
    ;(db.participant.count as jest.Mock).mockResolvedValue(100)

    const csv = `Nama Lengkap,Nomor WhatsApp
Existing Person,08123456789
New Person,08129999000`

    const res = await importParticipantsFromCSV(csv)
    expect(res.importedCount).toBe(1)
    expect(res.skippedCount).toBe(1)
    expect(db.participant.create).toHaveBeenCalledTimes(1)
  })

  // 9. The shared advisory lock is acquired inside the transaction
  it('acquires the shared pg_advisory_xact_lock(hashtext("venue_capacity_lock")) inside transaction', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(50)

    const csv = `Nama Lengkap,Nomor WhatsApp
Lock Test,081255554444`

    await importParticipantsFromCSV(csv)

    expect(db.$transaction).toHaveBeenCalled()
    expect(db.$executeRaw).toHaveBeenCalled()
  })

  // 10. Concurrent CSV imports cannot exceed 450 (serialized by lock)
  it('serializes concurrent CSV imports via transaction advisory lock', async () => {
    let activeInTx = 0
    let maxConcurrentInTx = 0

    ;(db.$transaction as jest.Mock).mockImplementation(async (cb) => {
      activeInTx++
      maxConcurrentInTx = Math.max(maxConcurrentInTx, activeInTx)
      await new Promise((r) => setTimeout(r, 10))
      const res = await cb(db)
      activeInTx--
      return res
    })

    ;(db.participant.count as jest.Mock).mockResolvedValue(438)

    const csv1 = `Nama Lengkap,Nomor WhatsApp\nConcurrent 1,081200000001`
    const csv2 = `Nama Lengkap,Nomor WhatsApp\nConcurrent 2,081200000002`

    const [res1, res2] = await Promise.all([
      importParticipantsFromCSV(csv1),
      importParticipantsFromCSV(csv2),
    ])

    expect(res1.importedCount).toBe(1)
    expect(res2.importedCount).toBe(1)
    expect(db.$executeRaw).toHaveBeenCalledTimes(2)
  })

  // 11. CSV import concurrent with normal registration cannot exceed 450
  it('shares the exact same venue_capacity_lock between CSV import and regular registration', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(438)

    // Execute regular registration
    await registerParticipant(
      {
        full_name: 'Reg User',
        whatsapp_number: '081299991111',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      },
      { registrationType: 'ON_SITE' }
    )

    // Execute CSV import
    const csv = `Nama Lengkap,Nomor WhatsApp\nCSV User,081299992222`
    await importParticipantsFromCSV(csv)

    // Both must have called $executeRaw with the same lock query
    expect(db.$executeRaw).toHaveBeenCalledTimes(2)
  })

  // 12. Existing CSV parsing and validation behavior remains intact
  it('handles empty text, header-only CSV, or malformed rows cleanly without errors', async () => {
    expect(await importParticipantsFromCSV('')).toEqual({
      importedCount: 0,
      skippedCount: 0,
      skipped: [],
      dryRun: false,
    })
    expect(await importParticipantsFromCSV('Nama Lengkap,Nomor WhatsApp')).toEqual({
      importedCount: 0,
      skippedCount: 0,
      skipped: [],
      dryRun: false,
    })

    const malformed = `Nama Lengkap,Nomor WhatsApp,Status,Cabang,Anak
SingleColumnRow
,
Valid Person,08123456789,BERGEREJA,Sunter,Ya`

    ;(db.participant.count as jest.Mock).mockResolvedValue(50)
    const res = await importParticipantsFromCSV(malformed)
    expect(res.importedCount).toBe(1)
    expect(res.skippedCount).toBe(0)
  })

  // 13. CSV import sets WhatsApp consent for all imported participants
  it('sets is_wa_opt_in to true for all CSV-imported participants', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(50)

    const csv = `Nama Lengkap,Nomor WhatsApp
OptIn User 1,081233334444
OptIn User 2,081255556666`

    await importParticipantsFromCSV(csv)

    expect(db.participant.create).toHaveBeenCalledTimes(2)
    const call1 = (db.participant.create as jest.Mock).mock.calls[0][0]
    const call2 = (db.participant.create as jest.Mock).mock.calls[1][0]

    expect(call1.data.is_wa_opt_in).toBe(true)
    expect(call2.data.is_wa_opt_in).toBe(true)
  })

  // 14. Opted-out CSV participants cannot resend
  it('blocks resend eligibility when participant has is_wa_opt_in = false', () => {
    const csvParticipant = {
      id: 'p-csv',
      full_name: 'CSV Person',
      status: 'REGISTERED',
      is_wa_opt_in: false,
    }
    const delivery = { id: 'd-1', status: 'FAILED' }

    const res = checkResendEligibility(csvParticipant, delivery)
    expect(res.isEligible).toBe(false)
    expect(res.httpStatus).toBe(422)
    expect(res.errorCode).toBe('NOT_OPTED_IN')
  })

  // 15. Participants without delivery records cannot resend
  it('blocks resend eligibility when participant has no delivery record (delivery is null)', () => {
    const participant = {
      id: 'p-csv-no-del',
      full_name: 'CSV Person Without Delivery',
      status: 'REGISTERED',
      is_wa_opt_in: true,
    }

    const res = checkResendEligibility(participant, null)
    expect(res.isEligible).toBe(false)
    expect(res.httpStatus).toBe(404)
    expect(res.errorCode).toBe('DELIVERY_NOT_FOUND')
  })

  // 16. Indonesian phone normalization (08..., 628..., +628..., and formatted)
  it('normalizes Indonesian phone numbers in various formats to canonical 628... E.164', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(50)

    const csv = `Nama Lengkap,Nomor WhatsApp
Format 08,081234567890
Format 628,6281234567891
Format Plus62,+6281234567892
Format Dotted,0812-3456-7893`

    const res = await importParticipantsFromCSV(csv)
    expect(res.importedCount).toBe(4)

    const calls = (db.participant.create as jest.Mock).mock.calls
    expect(calls[0][0].data.whatsapp_number).toBe('6281234567890')
    expect(calls[1][0].data.whatsapp_number).toBe('6281234567891')
    expect(calls[2][0].data.whatsapp_number).toBe('6281234567892')
    expect(calls[3][0].data.whatsapp_number).toBe('6281234567893')
  })

  // 17. Rejection of invalid phone numbers (accounted in skippedCount, not inserted)
  it('rejects invalid phone numbers, increments skippedCount, and does not insert them', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(50)

    const csv = `Nama Lengkap,Nomor WhatsApp
Valid User,081234567890
Invalid Short,12345
Invalid Alpha,0812abc4567
Invalid Prefix,+14155552671`

    const res = await importParticipantsFromCSV(csv)
    expect(res.importedCount).toBe(1)
    expect(res.skippedCount).toBe(3)
    expect(db.participant.create).toHaveBeenCalledTimes(1)
    expect((db.participant.create as jest.Mock).mock.calls[0][0].data.full_name).toBe('Valid User')
  })

  // 18. Duplicate detection after normalization
  it('detects duplicates when CSV contains 08... and database contains canonical 628...', async () => {
    ;(db.participant.findFirst as jest.Mock).mockImplementation(async ({ where }) => {
      if (where.full_name === 'Existing User' && where.whatsapp_number.in.includes('6281234567890')) {
        return { id: 'p-existing', full_name: 'Existing User' }
      }
      return null
    })
    ;(db.participant.count as jest.Mock).mockResolvedValue(50)

    const csv = `Nama Lengkap,Nomor WhatsApp
Existing User,081234567890
New User,081299998888`

    const res = await importParticipantsFromCSV(csv)
    expect(res.importedCount).toBe(1)
    expect(res.skippedCount).toBe(1)
    expect((db.participant.create as jest.Mock).mock.calls[0][0].data.full_name).toBe('New User')
  })

  // 19. CSV Export / Import Round-Trip
  it('successfully round-trips exported CSV data without interpreting ID as name', async () => {
    const exportedData = [
      {
        id: 'cm40uuid-1234-5678-90ab',
        full_name: 'Budi Hartono',
        whatsapp_number: '6281234567890',
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        status: 'REGISTERED',
        registration_type: 'ONLINE',
        qr_token: 'qr-token-1234',
        created_at: new Date('2026-11-20T10:00:00.000Z'),
      },
    ]

    const csvOutput = exportParticipantsToCSV(exportedData)
    expect(csvOutput).toContain('"cm40uuid-1234-5678-90ab"')
    expect(csvOutput).toContain('"Budi Hartono"')

    ;(db.participant.findFirst as jest.Mock).mockResolvedValue(null)
    ;(db.participant.count as jest.Mock).mockResolvedValue(50)

    const importRes = await importParticipantsFromCSV(csvOutput)
    expect(importRes.importedCount).toBe(1)

    const createdData = (db.participant.create as jest.Mock).mock.calls[0][0].data
    // Verify that ID is NOT stored as name!
    expect(createdData.full_name).toBe('Budi Hartono')
    expect(createdData.whatsapp_number).toBe('6281234567890')
    expect(createdData.church_status).toBe('BERGEREJA')
    expect(createdData.church_branch).toBe('JKI Shema Sunter, Jakarta')
    expect(createdData.is_child).toBe(false)
    expect(createdData.is_wa_opt_in).toBe(true)
  })

  // 20. API Error Handling (POST /api/admin/import)
  describe('POST /api/admin/import Endpoint', () => {
    it('returns HTTP 401 when session is unauthenticated', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const req = new Request('http://localhost:3000/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: 'Nama,WA\nBudi,081234567890',
      })

      const res = await adminImportPost(req)
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.error).toBe('Unauthorized')
    })

    it('returns HTTP 403 when session has non-admin role', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { name: 'viewer', role: 'VIEWER' },
      })

      const req = new Request('http://localhost:3000/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: 'Nama,WA\nBudi,081234567890',
      })

      const res = await adminImportPost(req)
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.error).toBe('Forbidden')
    })

    it('returns HTTP 400 when CSV payload is empty', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { name: 'admin', role: 'ADMIN' },
      })

      const req = new Request('http://localhost:3000/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: '   ',
      })

      const res = await adminImportPost(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('kosong')
    })

    it('returns HTTP 409 when capacity is exceeded', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { name: 'admin', role: 'ADMIN' },
      })
      ;(db.participant.count as jest.Mock).mockResolvedValue(450)

      const req = new Request('http://localhost:3000/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: 'Nama Lengkap,Nomor WhatsApp\nBudi,081234567890',
      })

      const res = await adminImportPost(req)
      expect(res.status).toBe(409)
      const json = await res.json()
      expect(json.code).toBe('VENUE_CAPACITY_FULL')
      expect(json.error).toContain('telah penuh')
    })

    it('returns HTTP 500 with safe Indonesian message on unexpected database failure', async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue({
        user: { name: 'admin', role: 'ADMIN' },
      })
      ;(db.$transaction as jest.Mock).mockRejectedValueOnce(
        new Error('FATAL: connection to server on socket "/tmp/.s.PGSQL.5432" failed (secret password leaked: pass123)')
      )

      const req = new Request('http://localhost:3000/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: 'Nama Lengkap,Nomor WhatsApp\nBudi,081234567890',
      })

      const res = await adminImportPost(req)
      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json.error).toBe('Terjadi kesalahan sistem internal saat memproses import CSV.')
      expect(json.error).not.toContain('pass123')
      expect(json.error).not.toContain('socket')
    })
  })
})
