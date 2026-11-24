import sharp from 'sharp'
import { GET } from '@/app/api/ticket/[token]/image/route'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: {
    participant: {
      findUnique: jest.fn(),
    },
  },
}))

describe('GET /api/ticket/[token]/image', () => {
  const validToken = '550e8400-e29b-41d4-a716-446655440000'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns HTTP 200 with 1024x768 PNG image for valid registered participant token', async () => {
    ;(db.participant.findUnique as jest.Mock).mockResolvedValue({
      id: 'p-valid-1',
      qr_token: validToken,
    })

    const req = new Request(`http://localhost/api/ticket/${validToken}/image`)
    const res = await GET(req, { params: Promise.resolve({ token: validToken }) })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('content-disposition')).toBe(
      `inline; filename="tiket-jki-shema-${validToken}.png"`
    )

    const rawBody =
      typeof (res as any).arrayBuffer === 'function'
        ? await res.arrayBuffer()
        : (res as any).body
    const buffer = Buffer.from(rawBody)

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)

    const metadata = await sharp(buffer).metadata()
    expect(metadata.width).toBe(1024)
    expect(metadata.height).toBe(768)
    expect(metadata.format).toBe('png')

    // Verify database query only queried id and qr_token, no personal data
    expect(db.participant.findUnique).toHaveBeenCalledWith({
      where: { qr_token: validToken },
      select: { id: true, qr_token: true },
    })
  })

  it('supports synchronous params object context in testing environment', async () => {
    ;(db.participant.findUnique as jest.Mock).mockResolvedValue({
      id: 'p-valid-1',
      qr_token: validToken,
    })

    const req = new Request(`http://localhost/api/ticket/${validToken}/image`)
    const res = await GET(req, { params: { token: validToken } } as any)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
  })

  it('returns HTTP 400 with client error for invalid token format (spaces/special characters)', async () => {
    const invalidTokens = [
      'token with spaces',
      'invalid!token',
      '../traversal',
      '<script>alert(1)</script>',
      'ab', // too short (< 4 chars)
    ]

    for (const invalid of invalidTokens) {
      const req = new Request(`http://localhost/api/ticket/${encodeURIComponent(invalid)}/image`)
      const res = await GET(req, { params: Promise.resolve({ token: invalid }) })

      expect(res.status).toBe(400)
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      const body = await res.json()
      expect(body.error).toBe('Invalid ticket token format')
      expect(db.participant.findUnique).not.toHaveBeenCalled()
    }
  })

  it('returns HTTP 400 when token param is missing or empty', async () => {
    const req = new Request('http://localhost/api/ticket//image')
    const res = await GET(req, { params: Promise.resolve({ token: '' }) })

    expect(res.status).toBe(400)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.error).toBe('Token is required')
    expect(db.participant.findUnique).not.toHaveBeenCalled()
  })

  it('returns HTTP 404 when valid-format token is not found in database', async () => {
    ;(db.participant.findUnique as jest.Mock).mockResolvedValue(null)

    const nonexistentToken = '00000000-0000-0000-0000-000000000000'
    const req = new Request(`http://localhost/api/ticket/${nonexistentToken}/image`)
    const res = await GET(req, { params: Promise.resolve({ token: nonexistentToken }) })

    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.error).toBe('Ticket not found')
  })

  it('returns safe HTTP 500 when database lookup fails without leaking details', async () => {
    ;(db.participant.findUnique as jest.Mock).mockRejectedValue(
      new Error('PostgreSQL database connection timeout')
    )

    const req = new Request(`http://localhost/api/ticket/${validToken}/image`)
    const res = await GET(req, { params: Promise.resolve({ token: validToken }) })

    expect(res.status).toBe(500)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.error).toBe('Internal Server Error')
    // Ensure no sensitive or internal details leaked
    expect(JSON.stringify(body)).not.toContain('PostgreSQL')
    expect(JSON.stringify(body)).not.toContain('connection timeout')
  })

  it('does not expose participant personal data through headers or body', async () => {
    ;(db.participant.findUnique as jest.Mock).mockResolvedValue({
      id: 'p-secret-1',
      qr_token: validToken,
    })

    const req = new Request(`http://localhost/api/ticket/${validToken}/image`)
    const res = await GET(req, { params: Promise.resolve({ token: validToken }) })

    expect(res.status).toBe(200)
    expect(res.headers.get('x-participant-name')).toBeNull()
    expect(res.headers.get('x-participant-phone')).toBeNull()
    expect(res.headers.get('x-phone')).toBeNull()
    expect(res.headers.get('x-name')).toBeNull()
  })
})
