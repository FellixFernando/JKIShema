import { NextResponse } from 'next/server'
import { registerParticipant } from '@/services/registration.service'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const participant = await registerParticipant(body)
    return NextResponse.json({ success: true, data: participant }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
}
