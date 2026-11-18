import { processWebhookInboxBatch } from '@/services/whatsapp-webhook-worker.service'

/**
 * Protected internal endpoint for scheduled worker execution (cron invocation).
 * Accepts: POST /api/internal/webhook-worker
 * Headers: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: Request) {
  try {
    const rawCronSecret = process.env.CRON_SECRET
    const cronSecret = typeof rawCronSecret === 'string' ? rawCronSecret.trim() : ''

    // Fail closed: reject immediately if CRON_SECRET is missing, empty, or whitespace-only
    if (!cronSecret) {
      return new Response(
        JSON.stringify({ error: 'Worker authentication is unconfigured' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
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

    // Optional query parameter overrides
    const url = new URL(req.url)
    const batchSizeParam = url.searchParams.get('batchSize')
    const batchSize = batchSizeParam ? parseInt(batchSizeParam, 10) : undefined

    const result = await processWebhookInboxBatch({
      batchSize: Number.isSafeInteger(batchSize) && batchSize! > 0 ? batchSize : undefined,
    })

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Internal server error in webhook worker',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

