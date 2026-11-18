import { processWebhookInboxBatch } from '../src/services/whatsapp-webhook-worker.service'

async function main() {
  console.log('[WORKER CLI] Starting webhook inbox worker execution...')
  const start = Date.now()

  try {
    const result = await processWebhookInboxBatch()
    const elapsed = Date.now() - start

    console.log(
      `[WORKER CLI] Completed in ${elapsed}ms | Claimed: ${result.claimedCount} | Processed: ${result.processedCount} | Ignored: ${result.ignoredCount} | Retry: ${result.retryCount} | Unmatched: ${result.unmatchedCount} | Failed: ${result.failedCount}`
    )

    if (result.errors.length > 0) {
      console.warn('[WORKER CLI] Warnings/Errors:', result.errors)
    }

    process.exit(0)
  } catch (err: any) {
    console.error('[WORKER CLI] Fatal worker error:', err)
    process.exit(1)
  }
}

main()

