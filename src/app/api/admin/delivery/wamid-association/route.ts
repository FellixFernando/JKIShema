import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * POST /api/admin/delivery/wamid-association
 *
 * Safely associates an unmatched WAMID with an unpersisted attempt.
 * Enforces:
 * - Admin/Master authorization
 * - Strict verification of (delivery_id, attempt_id, attempt_number)
 * - Atomic uniqueness on meta_message_id (P2002 -> 409 Conflict)
 * - Resetting matching WhatsAppWebhookEvent to 'RETRY' for worker evaluation
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as any).role
  if (role !== 'ADMIN' && role !== 'MASTER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { deliveryId, attemptId, attemptNumber, metaMessageId, reason } = body

  if (!deliveryId || !attemptId || typeof attemptNumber !== 'number' || !metaMessageId || !reason) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        message: 'deliveryId, attemptId, attemptNumber, metaMessageId, and reason are required',
      },
      { status: 400 }
    )
  }

  try {
    const adminUsername = session.user?.name || session.user?.email || 'admin'

    const result = await db.$transaction(async (tx: any) => {
      // 1. Verify Attempt exists and has NO existing WAMID
      const attempt = await tx.whatsAppDeliveryAttempt.findUnique({
        where: { id: attemptId },
      })

      if (!attempt) {
        throw new Error('ATTEMPT_NOT_FOUND')
      }

      if (attempt.delivery_id !== deliveryId || attempt.attempt_number !== attemptNumber) {
        throw new Error('ATTEMPT_MISMATCH')
      }

      if (attempt.meta_message_id) {
        throw new Error('ATTEMPT_ALREADY_HAS_WAMID')
      }

      // 2. Attach WAMID to Attempt
      const updatedAttempt = await tx.whatsAppDeliveryAttempt.update({
        where: { id: attemptId },
        data: {
          meta_message_id: metaMessageId,
          resend_reason: `[WAMID_LINKED]: ${reason}`,
          admin_username: adminUsername,
        },
      })

      // 3. Reset any matching UNMATCHED webhook event to RETRY
      let resetCount = 0
      if (tx.whatsAppWebhookEvent?.updateMany) {
        const updateRes = await tx.whatsAppWebhookEvent.updateMany({
          where: {
            meta_message_id: metaMessageId,
            processing_state: 'UNMATCHED',
          },
          data: {
            processing_state: 'RETRY',
            next_retry_at: new Date(),
          },
        })
        resetCount = updateRes.count
      }

      return {
        updatedAttempt,
        resetEventsCount: resetCount,
      }
    })

    return NextResponse.json({
      success: true,
      message: 'WAMID successfully associated with delivery attempt',
      data: result,
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        {
          success: false,
          error: 'WAMID_ALREADY_ASSOCIATED',
          message: 'WAMID sudah terhubung dengan percobaan pengiriman lain.',
        },
        { status: 409 }
      )
    }

    if (err?.message === 'ATTEMPT_NOT_FOUND') {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
    }

    if (err?.message === 'ATTEMPT_MISMATCH') {
      return NextResponse.json({ error: 'Attempt does not match delivery ID or attempt number' }, { status: 400 })
    }

    if (err?.message === 'ATTEMPT_ALREADY_HAS_WAMID') {
      return NextResponse.json({ error: 'Attempt already has an associated WAMID' }, { status: 409 })
    }

    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 })
  }
}
