import { NextResponse } from 'next/server'
import { processRSVPWebhook } from '@/services/advanced.service'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { whatsapp_number, message } = body

    if (!whatsapp_number || !message) {
      return NextResponse.json({ error: 'whatsapp_number dan message wajib diisi.' }, { status: 400 })
    }

    const result = await processRSVPWebhook(whatsapp_number, message)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
