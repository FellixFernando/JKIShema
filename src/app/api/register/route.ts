import { NextResponse } from 'next/server'
import { registerBatchParticipants, registerParticipant } from '@/services/registration.service'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const participants = Array.isArray(body)
      ? await registerBatchParticipants(body)
      : [await registerParticipant(body)]

    if (participants.length > 0 && participants.every((p: any) => p.status === 'WAITLISTED')) {
      return NextResponse.json({ success: true, status: 'WAITLISTED', data: [] }, { status: 201 })
    }

    return NextResponse.json({ success: true, data: participants }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}
