import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { executeManualResend } from '@/services/delivery-resend.service'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ participantId: string }> }
) {
  // 1. Authenticate Admin Session
  const session = await getServerSession(authOptions)
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as any).role
  if (role !== 'ADMIN' && role !== 'MASTER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { participantId } = await context.params
  if (!participantId || typeof participantId !== 'string') {
    return NextResponse.json({ error: 'Invalid participant ID' }, { status: 400 })
  }

  // 2. Parse & Validate Body
  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason || reason.length < 5) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        message: 'Alasan resend wajib diisi minimal 5 karakter.',
      },
      { status: 400 }
    )
  }

  const adminUsername = session.user.name || session.user.email || 'admin'

  // 3. Execute Resend via Domain Service
  const { status, body: resendResult } = await executeManualResend({
    participantId,
    adminUsername,
    reason,
  })

  return NextResponse.json(resendResult, { status })
}
