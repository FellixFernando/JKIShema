import crypto from 'crypto'
import type { APIRequestContext, APIResponse } from '@playwright/test'

/**
 * MockWhatsAppGate
 *
 * Manages the lifecycle of synthetic webhook dispatches and background worker invocations
 * during an E2E test run. Ensures that all active in-flight requests are tracked, new
 * requests can be gated during teardown, and all operations drain to zero before
 * database cleanup begins.
 *
 * Fail-Closed Security Guarantees:
 * - Requires non-empty WHATSAPP_APP_SECRET for webhook dispatches; throws before dispatch.
 * - Preserves exact configured secret bytes (does not trim the secret used in HMAC or Bearer).
 * - Cryptographically signs synthetic webhooks with HMAC-SHA256 over raw payload.
 * - Authoritative Content-Type: strips caller-supplied Content-Type case-insensitively and sets application/json.
 * - Strips any caller-supplied x-hub-signature-256 header (case-insensitively).
 * - Requires non-empty CRON_SECRET for worker triggers; throws before dispatch.
 * - Strips any caller-supplied authorization header (case-insensitively).
 * - Preserves unrelated caller-supplied headers.
 */
export class MockWhatsAppGate {
  private activeWebhooks = 0
  private activeWorkers = 0
  private closed = false
  readonly runId: string

  constructor(runId: string) {
    this.runId = runId
  }

  /**
   * Whether the gate has been closed to new synthetic webhook or worker requests.
   */
  get isClosed(): boolean {
    return this.closed
  }

  /**
   * Number of currently active in-flight requests.
   */
  get activeCounts(): { webhooks: number; workers: number } {
    return {
      webhooks: this.activeWebhooks,
      workers: this.activeWorkers,
    }
  }

  /**
   * Dispatches a synthetic WhatsApp webhook payload to /api/whatsapp/webhook.
   * Cryptographically signs the payload with X-Hub-Signature-256 using WHATSAPP_APP_SECRET.
   * Strips caller-supplied x-hub-signature-256 and content-type headers case-insensitively.
   * Preserves exact secret bytes (uses trim() only to check non-emptiness).
   * Fails closed if app secret is missing.
   */
  async dispatchSyntheticWebhook(
    request: APIRequestContext,
    payload: any,
    options?: {
      headers?: Record<string, string>
      appSecret?: string
    }
  ): Promise<APIResponse> {
    if (this.closed) {
      throw new Error(`[MOCK GATE BLOCKED] Cannot dispatch synthetic webhook: gate is closed for runId "${this.runId}".`)
    }

    const appSecret = options?.appSecret ?? process.env.WHATSAPP_APP_SECRET
    if (!appSecret || !appSecret.trim()) {
      throw new Error(
        `[MOCK GATE ERROR] Missing WHATSAPP_APP_SECRET for synthetic webhook dispatch on runId "${this.runId}". Unsigned dispatches are forbidden.`
      )
    }

    this.activeWebhooks++
    try {
      const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload)
      // Use exact secret bytes (do not trim secret) for HMAC calculation
      const signature = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')

      // Case-insensitively strip x-hub-signature-256 and content-type while preserving unrelated headers
      const sanitizedHeaders: Record<string, string> = {}
      if (options?.headers) {
        for (const [k, v] of Object.entries(options.headers)) {
          const lowerKey = k.toLowerCase()
          if (lowerKey !== 'x-hub-signature-256' && lowerKey !== 'content-type') {
            sanitizedHeaders[k] = v
          }
        }
      }

      sanitizedHeaders['Content-Type'] = 'application/json'
      sanitizedHeaders['x-hub-signature-256'] = `sha256=${signature}`

      return await request.post('/api/whatsapp/webhook', {
        data: rawBody,
        headers: sanitizedHeaders,
      })
    } finally {
      this.activeWebhooks--
    }
  }

  /**
   * Explicitly triggers the internal webhook inbox processing worker via /api/internal/webhook-worker.
   * Authenticates using CRON_SECRET via Bearer token with exact secret bytes.
   * Strips caller-supplied authorization and content-type headers case-insensitively.
   * Fails closed if cron secret is missing.
   */
  async triggerWorker(
    request: APIRequestContext,
    options?: {
      batchSize?: number
      headers?: Record<string, string>
      cronSecret?: string
    }
  ): Promise<APIResponse> {
    if (this.closed) {
      throw new Error(`[MOCK GATE BLOCKED] Cannot trigger webhook worker: gate is closed for runId "${this.runId}".`)
    }

    const cronSecret = options?.cronSecret ?? process.env.CRON_SECRET
    if (!cronSecret || !cronSecret.trim()) {
      throw new Error(
        `[MOCK GATE ERROR] Missing CRON_SECRET for worker trigger on runId "${this.runId}". Unauthenticated triggers are forbidden.`
      )
    }

    this.activeWorkers++
    try {
      // Case-insensitively strip authorization and content-type while preserving unrelated headers
      const sanitizedHeaders: Record<string, string> = {}
      if (options?.headers) {
        for (const [k, v] of Object.entries(options.headers)) {
          const lowerKey = k.toLowerCase()
          if (lowerKey !== 'authorization' && lowerKey !== 'content-type') {
            sanitizedHeaders[k] = v
          }
        }
      }

      sanitizedHeaders['Content-Type'] = 'application/json'
      // Use exact secret bytes (do not trim secret) for Bearer token
      sanitizedHeaders['Authorization'] = `Bearer ${cronSecret}`

      const url = options?.batchSize
        ? `/api/internal/webhook-worker?batchSize=${options.batchSize}`
        : '/api/internal/webhook-worker'

      return await request.post(url, { headers: sanitizedHeaders })
    } finally {
      this.activeWorkers--
    }
  }

  /**
   * Closes the gate to reject any new synthetic webhook or worker requests,
   * then polls until all in-flight requests have drained to zero.
   * Throws an error if draining exceeds timeoutMs.
   */
  async closeAndDrain(timeoutMs = 5000): Promise<void> {
    this.closed = true
    const start = Date.now()

    while (this.activeWebhooks > 0 || this.activeWorkers > 0) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `[MOCK GATE DRAIN TIMEOUT] Timed out after ${timeoutMs}ms waiting for mock requests to drain for runId "${this.runId}". Active webhooks: ${this.activeWebhooks}, active workers: ${this.activeWorkers}.`
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}
