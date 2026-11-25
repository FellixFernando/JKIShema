jest.mock('@/services/registration.service', () => ({
  registerBatchParticipants: jest.fn(),
  registerParticipant: jest.fn(),
}))
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  resetRateLimitForTests: jest.fn(),
}))

import { POST } from '@/app/api/register/route'
import { registerBatchParticipants } from '@/services/registration.service'
import { checkRateLimit } from '@/lib/rate-limit'

const input = (name: string) => ({
  full_name: name,
  whatsapp_number: '081234567890',
  church_status: 'BERGEREJA',
  church_branch: 'JKI Shema Sunter, Jakarta',
  is_wa_opt_in: true,
})

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const allowed = { allowed: true, retryAfterMs: 0 }

beforeEach(() => {
  jest.clearAllMocks()
  ;(checkRateLimit as jest.Mock).mockReturnValue(allowed)
  ;(registerBatchParticipants as jest.Mock).mockResolvedValue([])
})

describe('POST /api/register guards', () => {
  it('rejects more than 8 participants', async () => {
    const response = await POST(request(Array.from({ length: 9 }, (_, i) => input(`Test ${i}`))))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toMatch(/Maksimal 8/)
    expect(registerBatchParticipants).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    const response = await POST(request('{not-json'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(registerBatchParticipants).not.toHaveBeenCalled()
  })

  it('rejects an oversized body', async () => {
    const response = await POST(request(JSON.stringify([input('Test')]) + 'x'.repeat(40 * 1024)))
    const json = await response.json()

    expect(response.status).toBe(413)
    expect(json.success).toBe(false)
    expect(registerBatchParticipants).not.toHaveBeenCalled()
  })

  it('returns 429 when the phone limit is exceeded', async () => {
    ;(checkRateLimit as jest.Mock).mockImplementation((key: string) =>
      key.startsWith('register:phone:') ? { allowed: false, retryAfterMs: 60_000 } : allowed
    )

    const response = await POST(request([input('Test')]))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(registerBatchParticipants).not.toHaveBeenCalled()
  })

  it('keys the limiter by IP and phone', async () => {
    await POST(request([input('Test')], { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))

    expect(checkRateLimit).toHaveBeenCalledWith('register:ip:1.2.3.4', expect.any(Object))
    expect(checkRateLimit).toHaveBeenCalledWith('register:phone:6281234567890', expect.any(Object))
  })

  it('returns a generic error for an unknown failure', async () => {
    ;(registerBatchParticipants as jest.Mock).mockRejectedValue(
      new Error('Prisma connection failed at db.internal')
    )

    const response = await POST(request([input('Test')]))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Pendaftaran gagal diproses. Silakan coba lagi.')
    expect(JSON.stringify(json)).not.toContain('Prisma')
  })

  it('keeps a user-facing validation error', async () => {
    ;(registerBatchParticipants as jest.Mock).mockRejectedValue(
      new Error('Peserta dengan Nama "Test" dan Nomor WhatsApp tersebut sudah terdaftar.')
    )

    const response = await POST(request([input('Test')]))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain('sudah terdaftar')
  })
})
