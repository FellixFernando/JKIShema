import { registerParticipant, registerBatchParticipants } from '@/services/registration.service'
import { POST as adminParticipantsPost, GET as adminParticipantsGet } from '@/app/api/admin/participants/route'
import { POST as publicRegisterPost } from '@/app/api/register/route'
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

jest.mock('@/services/whatsapp.service', () => ({
  deliverParticipantTicket: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-wamid' }),
}))

jest.mock('@/lib/db', () => {
  const mockDb: any = {
    participant: {
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    whatsAppDelivery: {
      create: jest.fn().mockResolvedValue({ id: 'mock-del-id' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    systemConfig: {
      findUnique: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn((callback) => (typeof callback === 'function' ? callback(mockDb) : Promise.all(callback))),
  }
  return { db: mockDb }
})

describe('Admin On-Site Registration — Service & API Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.systemConfig.findUnique as jest.Mock).mockResolvedValue({ value: '400' })
    ;(db.participant.count as jest.Mock).mockResolvedValue(10)
    ;(db.participant.findFirst as jest.Mock).mockResolvedValue(null)
    ;(db.participant.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'p-' + Math.random().toString(36).substring(7),
        ...data,
        created_at: new Date(),
      })
    )
  })

  // 1. Authorization checks
  it('rejects unauthenticated requests to admin POST /api/admin/participants with HTTP 401', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const req = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Budi Santoso',
        whatsapp_number: '081234567890',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      }),
    })

    const res = await adminParticipantsPost(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('rejects unauthorized roles (non-admin/non-master) with HTTP 403', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'viewer', role: 'VIEWER' },
    })

    const req = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Budi Santoso',
        whatsapp_number: '081234567890',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      }),
    })

    const res = await adminParticipantsPost(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('Forbidden')
  })

  it('allows ADMIN role to register on-site with HTTP 201', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    const req = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Admin Registrant',
        whatsapp_number: '081234567890',
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_wa_opt_in: true,
      }),
    })

    const res = await adminParticipantsPost(req)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data[0].registration_type).toBe('ON_SITE')
  })

  it('allows MASTER role to register on-site with HTTP 201', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'master_user', role: 'MASTER' },
    })

    const req = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Master Registrant',
        whatsapp_number: '081234567891',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      }),
    })

    const res = await adminParticipantsPost(req)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data[0].registration_type).toBe('ON_SITE')
  })

  // 2. Registration types distinction
  it('explicitly creates ON_SITE registration type via admin API', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    const req = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'OnSite Walkin',
        whatsapp_number: '081234567892',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      }),
    })

    const res = await adminParticipantsPost(req)
    expect(res.status).toBe(201)
    expect(db.participant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          registration_type: 'ON_SITE',
        }),
      })
    )
  })

  it('public registration via POST /api/register still strictly defaults to ONLINE', async () => {
    const req = new Request('http://localhost:3000/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Public Registrant',
        whatsapp_number: '081234567893',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      }),
    })

    const res = await publicRegisterPost(req)
    expect(res.status).toBe(201)
    expect(db.participant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          registration_type: 'ONLINE',
        }),
      })
    )
  })

  // 3. Validation rules
  it('rejects registration with missing WhatsApp number', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    const req = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'No Phone User',
        whatsapp_number: '',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      }),
    })

    const res = await adminParticipantsPost(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Nomor WhatsApp pendaftar utama wajib diisi')
  })

  it('rejects registration when WhatsApp opt-in is false', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    const req = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'No OptIn User',
        whatsapp_number: '081234567894',
        church_status: 'BERGEREJA',
        is_wa_opt_in: false,
      }),
    })

    const res = await adminParticipantsPost(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Persetujuan WhatsApp wajib dicentang')
  })

  it('rejects registration when WhatsApp opt-in is missing/undefined in API', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    const req = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Missing OptIn User',
        whatsapp_number: '081234567894',
        church_status: 'BERGEREJA',
      }),
    })

    const res = await adminParticipantsPost(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Persetujuan WhatsApp wajib dicentang')
  })

  it('rejects registration when WhatsApp opt-in is non-boolean (e.g. string or null)', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    for (const invalidOptIn of ['false', 'true', null, 0, 1]) {
      const req = new Request('http://localhost:3000/api/admin/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: 'Invalid OptIn Type User',
          whatsapp_number: '081234567894',
          church_status: 'BERGEREJA',
          is_wa_opt_in: invalidOptIn,
        }),
      })

      const res = await adminParticipantsPost(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('Persetujuan WhatsApp wajib dicentang')
    }
  })

  it('rejects group registration in API when any participant lacks WhatsApp opt-in', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    const req = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participants: [
          {
            full_name: 'Parent Registrant',
            whatsapp_number: '081234567890',
            church_status: 'BERGEREJA',
            church_branch: 'JKI Shema Sunter, Jakarta',
            is_child: false,
            is_wa_opt_in: true,
          },
          {
            full_name: 'Child Registrant',
            whatsapp_number: '',
            church_status: 'BERGEREJA',
            church_branch: 'JKI Shema Sunter, Jakarta',
            is_child: true,
            is_wa_opt_in: false, // Child lacks opt-in
          },
        ],
      }),
    })

    const res = await adminParticipantsPost(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Persetujuan WhatsApp wajib dicentang')
  })

  it('rejects group registration in service when any participant lacks WhatsApp opt-in', async () => {
    await expect(
      registerBatchParticipants(
        [
          {
            full_name: 'Parent Member',
            whatsapp_number: '081299991111',
            church_status: 'BERGEREJA',
            is_wa_opt_in: true,
          },
          {
            full_name: 'Child Member',
            whatsapp_number: '081299991111',
            church_status: 'BERGEREJA',
            is_child: true,
            is_wa_opt_in: false as any,
          },
        ],
        { registrationType: 'ON_SITE' }
      )
    ).rejects.toThrow('Persetujuan WhatsApp wajib dicentang untuk peserta Child Member.')
  })

  it('verifies that public registration defaults to ONLINE even if input attempts ON_SITE', async () => {
    const created = await registerParticipant({
      full_name: 'Public Registrant',
      whatsapp_number: '081234567890',
      church_status: 'BERGEREJA',
      is_wa_opt_in: true,
      // Attempting to inject registration_type in payload
      ...({ registration_type: 'ON_SITE' } as any),
    })

    expect(created.registration_type).toBe('ONLINE')
  })

  it('rejects registration with invalid WhatsApp number', async () => {
    await expect(
      registerParticipant(
        {
          full_name: 'Invalid Phone User',
          whatsapp_number: '12345',
          church_status: 'BERGEREJA',
          is_wa_opt_in: true,
        },
        { registrationType: 'ON_SITE' }
      )
    ).rejects.toThrow('Only Indonesian phone numbers (08... or 628...) are supported')
  })

  it('rejects duplicate participant following existing duplicate rules', async () => {
    ;(db.participant.findFirst as jest.Mock).mockResolvedValue({
      id: 'existing-p1',
      full_name: 'Existing Person',
      whatsapp_number: '6281234567895',
      status: 'REGISTERED',
    })

    await expect(
      registerParticipant(
        {
          full_name: 'Existing Person',
          whatsapp_number: '081234567895',
          church_status: 'BERGEREJA',
          is_wa_opt_in: true,
        },
        { registrationType: 'ON_SITE' }
      )
    ).rejects.toThrow('sudah terdaftar')
  })

  // 4. Group / Family on-site registration
  it('supports group registration with unique QR token per participant and child WA inheritance', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    const req = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participants: [
          {
            full_name: 'Ayah Joko',
            whatsapp_number: '081211112222',
            church_status: 'BERGEREJA',
            is_wa_opt_in: true,
          },
          {
            full_name: 'Ibu Siti',
            whatsapp_number: '081233334444',
            church_status: 'BERGEREJA',
            is_wa_opt_in: true,
          },
          {
            full_name: 'Anak Dimas',
            whatsapp_number: '',
            church_status: 'BERGEREJA',
            is_child: true,
            is_wa_opt_in: true,
          },
        ],
      }),
    })

    const res = await adminParticipantsPost(req)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data).toHaveLength(3)

    // Child inherits parent's normalized phone number
    expect(json.data[2].whatsapp_number).toBe('6281211112222')
    expect(json.data[2].is_child).toBe(true)

    // Each participant receives an individual unique QR token
    const tokens = json.data.map((p: any) => p.qr_token)
    expect(new Set(tokens).size).toBe(3)
  })

  // 5. Total Venue Capacity & Concurrency Enforcement
  it('allows ON_SITE registration while seats remain below the total capacity (450)', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(400)

    const result = await registerParticipant(
      {
        full_name: 'Walkin 450',
        whatsapp_number: '081299990001',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      },
      { registrationType: 'ON_SITE' }
    )

    expect(result).toBeDefined()
    expect(result.registration_type).toBe('ON_SITE')
  })

  it('allows registration exactly at boundary: 449 existing + 1 registrant = 450', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(449)

    const result = await registerParticipant(
      {
        full_name: 'Seat 450 User',
        whatsapp_number: '081299990440',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      },
      { registrationType: 'ON_SITE' }
    )

    expect(result).toBeDefined()
  })

  it('rejects registration when venue capacity (450) is reached (450 + 1 = 451)', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(450)

    await expect(
      registerParticipant(
        {
          full_name: 'Over Capacity User',
          whatsapp_number: '081299990441',
          church_status: 'BERGEREJA',
          is_wa_opt_in: true,
        },
        { registrationType: 'ON_SITE' }
      )
    ).rejects.toThrow('Kapasitas penuh. Batalkan peserta yang tidak hadir terlebih dahulu.')
  })

  it('atomically rejects group registration exceeding capacity (e.g. 448 + 3 = 451)', async () => {
    ;(db.participant.count as jest.Mock).mockResolvedValue(448)

    await expect(
      registerBatchParticipants(
        [
          { full_name: 'Family 1', whatsapp_number: '081299990001', church_status: 'BERGEREJA', is_wa_opt_in: true },
          { full_name: 'Family 2', whatsapp_number: '081299990002', church_status: 'BERGEREJA', is_wa_opt_in: true },
          { full_name: 'Family 3', whatsapp_number: '081299990003', church_status: 'BERGEREJA', is_wa_opt_in: true },
        ],
        { registrationType: 'ON_SITE' }
      )
    ).rejects.toThrow('Kapasitas penuh. Batalkan peserta yang tidak hadir terlebih dahulu.')

    // Atomicity: zero records created
    expect(db.participant.create).not.toHaveBeenCalled()
  })

  it('serializes capacity check via advisory lock', async () => {
    await registerParticipant(
      {
        full_name: 'Lock Tested User',
        whatsapp_number: '081299998888',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      },
      { registrationType: 'ON_SITE' }
    )

    expect(db.$executeRaw).toHaveBeenCalled()
  })

  // 6. Optional Immediate Check-In
  it('marks participants as REGISTERED by default when immediateCheckIn is false', async () => {
    const result = await registerParticipant(
      {
        full_name: 'Standard Registrant',
        whatsapp_number: '081255556666',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      },
      { registrationType: 'ON_SITE', immediateCheckIn: false }
    )

    expect(result.status).toBe('REGISTERED')
    expect(result.checked_in_at).toBeNull()
  })

  it('marks participants as CHECKED_IN with timestamp when immediateCheckIn is true', async () => {
    const result = await registerParticipant(
      {
        full_name: 'Immediate CheckIn Registrant',
        whatsapp_number: '081277778888',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      },
      { registrationType: 'ON_SITE', immediateCheckIn: true }
    )

    expect(result.status).toBe('CHECKED_IN')
    expect(result.checked_in_at).not.toBeNull()
  })

  it('rejects POST /api/admin/participants when immediate_checkin is a string like "false" or "true"', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    for (const stringVal of ['false', 'true', '0', '1', '']) {
      const req = new Request('http://localhost:3000/api/admin/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: [
            {
              full_name: 'Budi Test',
              whatsapp_number: '081234567890',
              church_status: 'BERGEREJA',
              is_wa_opt_in: true,
            },
          ],
          immediate_checkin: stringVal,
        }),
      })

      const res = await adminParticipantsPost(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Nilai immediate_checkin harus berupa boolean (true atau false).')
    }
  })

  it('rejects POST /api/admin/participants when immediate_checkin is non-boolean (null, number, array, object)', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    for (const invalidVal of [null, 0, 1, [], {}]) {
      const req = new Request('http://localhost:3000/api/admin/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: [
            {
              full_name: 'Budi Test NonBool',
              whatsapp_number: '081234567890',
              church_status: 'BERGEREJA',
              is_wa_opt_in: true,
            },
          ],
          immediate_checkin: invalidVal,
        }),
      })

      const res = await adminParticipantsPost(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Nilai immediate_checkin harus berupa boolean (true atau false).')
    }
  })

  it('accepts POST /api/admin/participants with boolean immediate_checkin true, false, and missing', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })

    // 1. Missing immediate_checkin -> defaults to false (REGISTERED)
    const reqMissing = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participants: [
          {
            full_name: 'Missing Checkin User',
            whatsapp_number: '081211112222',
            church_status: 'BERGEREJA',
            is_wa_opt_in: true,
          },
        ],
      }),
    })
    const resMissing = await adminParticipantsPost(reqMissing)
    expect(resMissing.status).toBe(201)
    const jsonMissing = await resMissing.json()
    expect(jsonMissing.data[0].status).toBe('REGISTERED')
    expect(jsonMissing.data[0].checked_in_at).toBeNull()

    // 2. Explicit false -> REGISTERED
    const reqFalse = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participants: [
          {
            full_name: 'False Checkin User',
            whatsapp_number: '081211113333',
            church_status: 'BERGEREJA',
            is_wa_opt_in: true,
          },
        ],
        immediate_checkin: false,
      }),
    })
    const resFalse = await adminParticipantsPost(reqFalse)
    expect(resFalse.status).toBe(201)
    const jsonFalse = await resFalse.json()
    expect(jsonFalse.data[0].status).toBe('REGISTERED')
    expect(jsonFalse.data[0].checked_in_at).toBeNull()

    // 3. Explicit true -> CHECKED_IN with timestamp
    const reqTrue = new Request('http://localhost:3000/api/admin/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participants: [
          {
            full_name: 'True Checkin User',
            whatsapp_number: '081211114444',
            church_status: 'BERGEREJA',
            is_wa_opt_in: true,
          },
        ],
        immediate_checkin: true,
      }),
    })
    const resTrue = await adminParticipantsPost(reqTrue)
    expect(resTrue.status).toBe(201)
    const jsonTrue = await resTrue.json()
    expect(jsonTrue.data[0].status).toBe('CHECKED_IN')
    expect(jsonTrue.data[0].checked_in_at).not.toBeNull()
  })

  // 7. Delivery & Tracking Resilience
  it('creates PENDING WhatsAppDelivery tracking record for on-site registrant', async () => {
    await registerParticipant(
      {
        full_name: 'Delivery Tracked User',
        whatsapp_number: '081233332222',
        church_status: 'BERGEREJA',
        is_wa_opt_in: true,
      },
      { registrationType: 'ON_SITE' }
    )

    expect(db.whatsAppDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          recipient_phone: '6281233332222',
        }),
      })
    )
  })

  // 8. Admin GET filter for registration_type
  it('filters participants by registration_type (ON_SITE / ONLINE / ALL) via GET', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { name: 'admin_user', role: 'ADMIN' },
    })
    ;(db.participant.findMany as jest.Mock).mockResolvedValue([])

    const req = new Request('http://localhost:3000/api/admin/participants?registration_type=ON_SITE', {
      method: 'GET',
    })

    const res = await adminParticipantsGet(req)
    expect(res.status).toBe(200)
    expect(db.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          registration_type: 'ON_SITE',
        }),
      })
    )
  })
})
