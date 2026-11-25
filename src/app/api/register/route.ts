import { NextResponse } from 'next/server'
import { registerBatchParticipants, registerParticipant } from '@/services/registration.service'
import { checkRateLimit } from '@/lib/rate-limit'
import { normalizeWhatsAppNumber } from '@/lib/phone'

const MAX_BODY_BYTES = 32 * 1024
const MAX_BATCH = 8
const USER_ERROR_PREFIXES = [
  'Peserta',
  'Nomor',
  'Persetujuan',
  'Pendaftaran',
  'Kapasitas',
  'Kuota',
  'Data peserta',
]

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

function rateLimited(retryAfterMs: number) {
  return new NextResponse(
    JSON.stringify({ success: false, error: 'Terlalu banyak permintaan. Silakan coba lagi nanti.' }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
      },
    }
  )
}

export async function POST(req: Request) {
  const ipLimit = checkRateLimit(`register:ip:${getClientIp(req)}`, {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  })
  if (!ipLimit.allowed) return rateLimited(ipLimit.retryAfterMs)

  const raw = await req.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ success: false, error: 'Permintaan terlalu besar.' }, { status: 413 })
  }

  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ success: false, error: 'Format permintaan tidak valid.' }, { status: 400 })
  }

  if (Array.isArray(body) && body.length > MAX_BATCH) {
    return NextResponse.json({ success: false, error: 'Maksimal 8 peserta per pendaftaran.' }, { status: 400 })
  }

  const first = Array.isArray(body) ? body[0] : body
  const rawPhone = first?.whatsapp_number
  if (typeof rawPhone === 'string') {
    try {
      const canonical = normalizeWhatsAppNumber(rawPhone)
      const phoneLimit = checkRateLimit(`register:phone:${canonical}`, {
        limit: 5,
        windowMs: 60 * 60 * 1000,
      })
      if (!phoneLimit.allowed) return rateLimited(phoneLimit.retryAfterMs)
    } catch {
      // Invalid number: leave the user-facing error to the service.
    }
  }

  try {
    const participants = Array.isArray(body)
      ? await registerBatchParticipants(body)
      : [await registerParticipant(body)]

    if (participants.length > 0 && participants.every((p: any) => p.status === 'WAITLISTED')) {
      return NextResponse.json({ success: true, status: 'WAITLISTED', data: [] }, { status: 201 })
    }

    return NextResponse.json({ success: true, data: participants }, { status: 201 })
  } catch (err: any) {
    const message = err?.message ?? ''
    if (USER_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix))) {
      return NextResponse.json({ success: false, error: message }, { status: 400 })
    }
    console.error('[REGISTER] Unexpected failure:', { name: err?.name, code: err?.code })
    return NextResponse.json(
      { success: false, error: 'Pendaftaran gagal diproses. Silakan coba lagi.' },
      { status: 500 }
    )
  }
}
