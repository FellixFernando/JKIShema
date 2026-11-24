import { NextResponse } from 'next/server'
import { getParticipants, cancelParticipant, VALID_WA_DELIVERY_STATUSES } from '@/services/dashboard.service'
import { registerBatchParticipants } from '@/services/registration.service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as any).role
  if (role !== 'ADMIN' && role !== 'MASTER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || undefined
  const status = (searchParams.get('status') as any) || 'ALL'
  const waStatus = searchParams.get('wa_status') || undefined
  const regType = searchParams.get('registration_type') || undefined

  if (regType && !['ALL', 'ONLINE', 'ON_SITE'].includes(regType)) {
    return NextResponse.json(
      { error: 'INVALID_REGISTRATION_TYPE', message: 'Nilai filter registration_type tidak valid.' },
      { status: 400 }
    )
  }

  if (waStatus && waStatus !== 'ALL' && waStatus !== 'NO_DELIVERY') {
    if (!VALID_WA_DELIVERY_STATUSES.includes(waStatus as any)) {
      return NextResponse.json(
        {
          error: 'INVALID_WA_STATUS',
          message: `Nilai filter wa_status "${waStatus}" tidak valid. Pilihan yang valid: ${[
            'ALL',
            'NO_DELIVERY',
            ...VALID_WA_DELIVERY_STATUSES,
          ].join(', ')}`,
        },
        { status: 400 }
      )
    }
  }

  const list = await getParticipants({
    search,
    status,
    waStatus: (waStatus as any) || 'ALL',
    registrationType: (regType as any) || 'ALL',
  })
  return NextResponse.json(list)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as any).role
  if (role !== 'ADMIN' && role !== 'MASTER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    let inputs: any[]
    let immediateCheckIn = false

    if (body && typeof body === 'object' && 'participants' in body && Array.isArray(body.participants)) {
      inputs = body.participants
      const rawCheckin = body.immediate_checkin !== undefined ? body.immediate_checkin : body.immediateCheckIn
      if (rawCheckin !== undefined && typeof rawCheckin !== 'boolean') {
        return NextResponse.json(
          { error: 'Nilai immediate_checkin harus berupa boolean (true atau false).' },
          { status: 400 }
        )
      }
      immediateCheckIn = rawCheckin === true
    } else if (Array.isArray(body)) {
      inputs = body
      immediateCheckIn = false
    } else if (body && typeof body === 'object') {
      const { immediate_checkin, immediateCheckIn: camelCheckin, ...rest } = body
      const rawCheckin = immediate_checkin !== undefined ? immediate_checkin : camelCheckin
      if (rawCheckin !== undefined && typeof rawCheckin !== 'boolean') {
        return NextResponse.json(
          { error: 'Nilai immediate_checkin harus berupa boolean (true atau false).' },
          { status: 400 }
        )
      }
      immediateCheckIn = rawCheckin === true
      inputs = [rest]
    } else {
      return NextResponse.json({ error: 'Format data pendaftaran tidak valid.' }, { status: 400 })
    }

    if (!inputs || inputs.length === 0) {
      return NextResponse.json({ error: 'Data peserta wajib diisi.' }, { status: 400 })
    }

    // Server-side validation
    for (let i = 0; i < inputs.length; i++) {
      const p = inputs[i]
      if (!p.full_name || typeof p.full_name !== 'string' || !p.full_name.trim()) {
        return NextResponse.json({ error: `Nama lengkap untuk peserta ke-${i + 1} wajib diisi.` }, { status: 400 })
      }
      if (i === 0 && (!p.whatsapp_number || typeof p.whatsapp_number !== 'string' || !p.whatsapp_number.trim())) {
        return NextResponse.json({ error: 'Nomor WhatsApp pendaftar utama wajib diisi.' }, { status: 400 })
      }
      if (!p.is_child && (!p.whatsapp_number || typeof p.whatsapp_number !== 'string' || !p.whatsapp_number.trim())) {
        return NextResponse.json({ error: `Nomor WhatsApp untuk peserta ke-${i + 1} (${p.full_name}) wajib diisi.` }, { status: 400 })
      }
      if (p.is_wa_opt_in !== true) {
        return NextResponse.json({ error: `Persetujuan WhatsApp wajib dicentang untuk peserta ${p.full_name}.` }, { status: 400 })
      }
    }

    const created = await registerBatchParticipants(inputs, {
      registrationType: 'ON_SITE',
      immediateCheckIn,
    })

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Gagal mendaftarkan peserta on-site.' }, { status: 400 })
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { participant_id } = await req.json()
    if (!participant_id) {
      return NextResponse.json({ error: 'Participant ID wajib diisi.' }, { status: 400 })
    }

    const updated = await cancelParticipant(participant_id)
    return NextResponse.json({ success: true, participant: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
