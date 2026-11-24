import { NextResponse } from 'next/server'
import { importParticipantsFromCSV } from '@/services/advanced.service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

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
    const csvText = await req.text()
    if (!csvText || typeof csvText !== 'string' || csvText.trim() === '') {
      return NextResponse.json(
        { error: 'File CSV kosong atau tidak valid.', code: 'INVALID_CSV' },
        { status: 400 }
      )
    }

    const result = await importParticipantsFromCSV(csvText)
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    const errMsg = err?.message || ''

    // Capacity error -> Client error (HTTP 409 Conflict)
    if (errMsg.includes('Kapasitas total acara') || errMsg.includes('telah penuh')) {
      return NextResponse.json(
        { error: errMsg, code: 'VENUE_CAPACITY_FULL' },
        { status: 409 }
      )
    }

    // Invalid CSV structure or validation -> Client error (HTTP 400)
    if (errMsg.includes('format') || errMsg.includes('tidak valid') || errMsg.includes('kolom')) {
      return NextResponse.json(
        { error: errMsg, code: 'INVALID_CSV' },
        { status: 400 }
      )
    }

    // Unexpected internal error -> Server error (HTTP 500)
    console.error('[CSV IMPORT] Unexpected internal failure:', errMsg)
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem internal saat memproses import CSV.', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    )
  }
}
