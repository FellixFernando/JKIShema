import { db } from '@/lib/db'
import { generateFramedTicketQrBuffer } from '@/services/ticket-frame.service'

export const runtime = 'nodejs'

// Non-empty alphanumeric string with hyphens or underscores (e.g. UUID v4)
const TOKEN_FORMAT_REGEX = /^[a-zA-Z0-9_-]{4,128}$/

interface RouteContext {
  params: Promise<{ token: string }> | { token: string }
}

/**
 * GET /api/ticket/[token]/image
 *
 * Generates and serves the in-memory framed Christmas Concert ticket PNG (1024 x 768).
 * Validates token format and verifies participant existence before generating the image.
 * Never stores images on disk or exposes personal participant data.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const resolvedParams = await Promise.resolve(context?.params)
  const rawToken = resolvedParams?.token

  if (!rawToken || typeof rawToken !== 'string') {
    return new Response(JSON.stringify({ error: 'Token is required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    })
  }

  const token = rawToken.trim()

  if (!TOKEN_FORMAT_REGEX.test(token)) {
    return new Response(JSON.stringify({ error: 'Invalid ticket token format' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    })
  }

  // Verify participant token exists in the database
  let participant
  try {
    participant = await db.participant.findUnique({
      where: { qr_token: token },
      select: { id: true, qr_token: true, status: true },
    })
  } catch (dbErr: any) {
    console.error('[TICKET IMAGE API] Database lookup error:', dbErr?.message || dbErr)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    })
  }

  if (!participant || participant.status === 'CANCELLED') {
    return new Response(JSON.stringify({ error: 'Ticket not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    })
  }

  // Generate framed ticket PNG buffer entirely in-memory
  try {
    const buffer = await generateFramedTicketQrBuffer(token)

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="tiket-jki-shema-${token}.png"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (imgErr: any) {
    console.error('[TICKET IMAGE API] Error generating framed ticket:', imgErr?.message || imgErr)
    return new Response(JSON.stringify({ error: 'Failed to generate ticket image' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    })
  }
}
