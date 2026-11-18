import { NextResponse } from 'next/server'
import { getParticipants } from '@/services/dashboard.service'
import { exportParticipantsToCSV } from '@/services/advanced.service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const participants = await getParticipants({ status: 'ALL' })
  const csvText = exportParticipantsToCSV(participants)

  return new NextResponse(csvText, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="data_peserta_christmas.csv"',
    },
  })
}
