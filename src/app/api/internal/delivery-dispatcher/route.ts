import { dispatchPendingTickets } from '@/services/delivery-dispatcher.service'

/**
 * Protected internal endpoint for scheduled ticket dispatch (cron invocation).
 * Accepts: POST /api/internal/delivery-dispatcher
 * Headers: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: Request) {
  try {
    const rawCronSecret = process.env.CRON_SECRET
    const cronSecret = typeof rawCronSecret === 'string' ? rawCronSecret.trim() : ''

    // Fail closed: reject immediately if CRON_SECRET is missing, empty, or whitespace-only
    if (!cronSecret) {
      return new Response(
        JSON.stringify({ error: 'Dispatcher authentication is unconfigured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Enforce Authorization Bearer header authentication only (query-string tokens strictly forbidden)
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const bearerToken = authHeader.slice(7).trim()
    if (!bearerToken || bearerToken !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await dispatchPendingTickets()

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Internal server error in delivery dispatcher',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
