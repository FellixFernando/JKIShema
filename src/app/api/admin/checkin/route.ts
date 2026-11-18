import { NextResponse } from 'next/server'
import { processCheckInByToken, processManualCheckIn } from '@/services/checkin.service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { qr_token } = await req.json()
    if (!qr_token) {
      return NextResponse.json({ error: 'QR Token wajib diisi.' }, { status: 400 })
    }

    const result = await processCheckInByToken(qr_token)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { participant_id } = await req.json()
    if (!participant_id) {
      return NextResponse.json({ error: 'Participant ID wajib diisi.' }, { status: 400 })
    }

    const updated = await processManualCheckIn(participant_id)
    return NextResponse.json({ success: true, participant: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
