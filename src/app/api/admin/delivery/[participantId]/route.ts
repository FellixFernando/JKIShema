import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ participantId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as any).role
  if (role !== 'ADMIN' && role !== 'MASTER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { participantId } = await context.params
  if (!participantId) {
    return NextResponse.json({ error: 'Invalid participant ID' }, { status: 400 })
  }

  const delivery = await db.whatsAppDelivery.findUnique({
    where: { participant_id: participantId },
    include: {
      attempts: {
        orderBy: { attempt_number: 'desc' },
      },
      reconciliations: {
        orderBy: { created_at: 'desc' },
      },
    },
  })

  if (!delivery) {
    return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
  }

  return NextResponse.json(delivery)
}
