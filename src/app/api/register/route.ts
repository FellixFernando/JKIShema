import { NextResponse } from 'next/server'
import { registerBatchParticipants, registerParticipant } from '@/services/registration.service'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (Array.isArray(body)) {
      const participants = await registerBatchParticipants(body)
      return NextResponse.json({ success: true, data: participants }, { status: 201 })
    }
    const participant = await registerParticipant(body)
    return NextResponse.json({ success: true, data: [participant] }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}
