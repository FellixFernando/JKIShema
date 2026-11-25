import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRegistrationSettings } from '@/services/config.service'

export async function GET() {
  const { totalCapacity, isRegistrationOpen } = await getRegistrationSettings()

  const active = await db.participant.count({
    where: { status: { in: ['REGISTERED', 'CHECKED_IN'] } },
  })

  return NextResponse.json(
    { remaining: Math.max(0, totalCapacity - active), is_open: isRegistrationOpen },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
