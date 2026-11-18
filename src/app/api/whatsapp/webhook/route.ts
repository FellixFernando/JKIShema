import {
  MAX_WEBHOOK_BYTES,
  PayloadTooLargeError,
  readLimitedRawBody,
  verifyWebhookSignature,
  verifyGetHandshake,
  ingestWebhookPayload,
  getWebhookFutureSkewLimit,
} from '@/services/whatsapp-webhook.service'

/**
 * Meta WhatsApp Cloud API Webhook Verification (GET)
 * Validates hub.mode, hub.verify_token, and returns hub.challenge on success.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const result = verifyGetHandshake(
      url.searchParams,
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    )

    if (result.isValid && result.challenge) {
      return new Response(result.challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return new Response('Forbidden', { status: 403 })
  } catch (err: any) {
    return new Response('Forbidden', { status: 403 })
  }
}

/**
 * Meta WhatsApp Cloud API Webhook Event Ingestion (POST)
 * 1. Streams request body enforcing 256 KB cap (HTTP 413 on exceed).
 * 2. Cryptographically validates X-Hub-Signature-256 via timing-safe HMAC-SHA256 (HTTP 401 on failure).
 * 3. Parses JSON only after signature verification.
 * 4. Atomically persists batch and child events in the durable inbox before returning HTTP 200.
 * 5. Returns HTTP 500 on database failure to trigger Meta exponential retry.
 */
export async function POST(req: Request) {
  let rawBody: Buffer

  // Step 1: Read body stream with strict 256 KB limit
  try {
    rawBody = await readLimitedRawBody(req, MAX_WEBHOOK_BYTES)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return new Response(JSON.stringify({ error: 'Payload Too Large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ error: 'Bad Request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Reject empty payload
  if (!rawBody || rawBody.length === 0) {
    return new Response(JSON.stringify({ error: 'Bad Request: Empty body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Step 2: Validate X-Hub-Signature-256
  const signatureHeader = req.headers.get('x-hub-signature-256')
  const isValidSignature = verifyWebhookSignature(
    rawBody,
    signatureHeader,
    process.env.WHATSAPP_APP_SECRET
  )

  if (!isValidSignature) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Step 3: Parse JSON only after successful signature validation
  let parsedPayload: any
  try {
    parsedPayload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return new Response(JSON.stringify({ error: 'Bad Request: Malformed JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Step 4: Atomically persist batch and child events in durable inbox
  try {
    const maxFutureSkewSec = await getWebhookFutureSkewLimit()
    const result = await ingestWebhookPayload(rawBody, parsedPayload, { maxFutureSkewSec })
    return new Response(
      JSON.stringify({
        success: true,
        duplicate: result.isDuplicate,
        eventsCount: result.eventsCount,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (err: any) {
    // Database failure -> return 500 to trigger Meta exponential retry
    console.error('[WEBHOOK INGESTION] Database persistence error:', err?.message || err)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
