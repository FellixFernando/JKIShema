import { NextResponse } from 'next/server'
import { importParticipantsFromCSV } from '@/services/advanced.service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const csvText = await req.text()
    const result = await importParticipantsFromCSV(csvText)
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
