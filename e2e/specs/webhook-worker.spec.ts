import { test, expect } from '../fixtures/test-context'
import { db } from '@/lib/db'
import crypto from 'crypto'

/**
 * Helper to construct a canonical Meta WhatsApp status update webhook payload.
 * Injects runId into entry ID and wamid to satisfy cleanup ownership rules.
 */
function createStatusWebhookPayload(params: {
  runId: string
  wamid: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestampSec: number
  recipientPhone: string
  errors?: Array<{ code: number; message: string }>
}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: `waba_${params.runId}`,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '6281234567890',
                phone_number_id: 'mock_phone_id',
              },
              statuses: [
                {
                  id: params.wamid,
                  status: params.status,
                  timestamp: String(params.timestampSec),
                  recipient_id: params.recipientPhone,
                  ...(params.errors && params.errors.length > 0 ? { errors: params.errors } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

async function createParticipantWithAttempt(
  runId: string,
  label: string,
  wamid: string,
  cleanupTracker: any
) {
  const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000).toString()
  const participantName = `E2E ${label} [${runId}]`
  const phone = `62812${uniqueDigits}`
  const qrToken = crypto.randomUUID()
  const t0 = new Date(Date.now() - 30000)

  const participant = await db.participant.create({
    data: {
      full_name: participantName,
      whatsapp_number: phone,
      church_status: 'BERGEREJA',
      church_branch: 'JKI Shema Sunter, Jakarta',
      is_child: false,
      is_wa_opt_in: true,
      qr_token: qrToken,
      status: 'REGISTERED',
      registration_type: 'ONLINE',
      wa_delivery_status: 'SENT',
      wa_message_id: wamid,
      wa_sent_at: t0,
    },
  })
  cleanupTracker.participantIds.add(participant.id)

  const delivery = await db.whatsAppDelivery.create({
    data: {
      participant_id: participant.id,
      participant_name: participant.full_name,
      qr_token_snapshot: qrToken,
      recipient_phone: phone,
      status: 'SENT',
      total_attempts: 1,
      sent_at: t0,
    },
  })
  cleanupTracker.deliveryIds.add(delivery.id)

  const attempt = await db.whatsAppDeliveryAttempt.create({
    data: {
      delivery_id: delivery.id,
      meta_message_id: wamid,
      attempt_number: 1,
      status: 'SUCCESS',
    },
  })
  cleanupTracker.attemptIds.add(attempt.id)

  return { participant, delivery, attempt, phone }
}

test.describe.serial('E2E WhatsApp Webhook & Worker Suite', () => {
  // Scenario A: Webhook & Worker Authentication
  test('Scenario A: verifies webhook signature and worker bearer authentication', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    const wamid = `wamid.mock_${runId}_auth_${Date.now()}`
    // Pre-create matching delivery attempt to allow worker to achieve clean terminal quiescence
    await createParticipantWithAttempt(runId, 'auth-user', wamid, cleanupTracker)

    const payload = createStatusWebhookPayload({
      runId,
      wamid,
      status: 'delivered',
      timestampSec: Math.floor(Date.now() / 1000),
      recipientPhone: '6281234567890',
    })
    const rawBody = JSON.stringify(payload)
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')

    // 1. Webhook Auth: Valid HMAC signature -> HTTP 200
    const validWebhookRes = await mockGate.dispatchSyntheticWebhook(request, payload)
    expect(validWebhookRes.status()).toBe(200)
    const validBody = await validWebhookRes.json()
    expect(validBody.success).toBe(true)

    // Deterministically discover & register created batch/event for cleanup via exact payload_hash and wamid
    const batch = await db.whatsAppWebhookBatch.findUniqueOrThrow({
      where: { payload_hash: payloadHash },
    })
    cleanupTracker.webhookBatchIds.add(batch.id)

    const event = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid },
    })
    cleanupTracker.webhookEventIds.add(event.id)

    // 2. Webhook Auth: Invalid HMAC signature -> HTTP 401
    const invalidSigRes = await request.post('/api/whatsapp/webhook', {
      data: rawBody,
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
      },
    })
    expect(invalidSigRes.status()).toBe(401)

    // 3. Webhook Auth: Missing signature header -> HTTP 401
    const missingSigRes = await request.post('/api/whatsapp/webhook', {
      data: rawBody,
      headers: {
        'Content-Type': 'application/json',
      },
    })
    expect(missingSigRes.status()).toBe(401)

    // 4. Worker Auth: Valid Bearer CRON_SECRET -> HTTP 200
    const validWorkerRes = await mockGate.triggerWorker(request)
    expect(validWorkerRes.status()).toBe(200)
    const workerBody = await validWorkerRes.json()
    expect(workerBody.success).toBe(true)

    // 5. Worker Auth: Invalid Bearer token -> HTTP 401
    const invalidWorkerRes = await request.post('/api/internal/webhook-worker', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_cron_secret_token_123',
      },
    })
    expect(invalidWorkerRes.status()).toBe(401)

    // 6. Worker Auth: Missing Authorization header -> HTTP 401
    const missingWorkerRes = await request.post('/api/internal/webhook-worker', {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    expect(missingWorkerRes.status()).toBe(401)
  })

  // Scenario B: Durable Ingestion & Deduplication
  test('Scenario B: verifies durable batch/event ingestion, deduplication, and 256 KB limit', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    const wamid = `wamid.mock_${runId}_dedup_${Date.now()}`
    const payload = createStatusWebhookPayload({
      runId,
      wamid,
      status: 'delivered',
      timestampSec: Math.floor(Date.now() / 1000),
      recipientPhone: '6281234567890',
    })
    const rawBody = JSON.stringify(payload)
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')

    // 1. Initial valid ingestion -> duplicate: false
    const res1 = await mockGate.dispatchSyntheticWebhook(request, payload)
    expect(res1.status()).toBe(200)
    const body1 = await res1.json()
    expect(body1.success).toBe(true)
    expect(body1.duplicate).toBe(false)
    expect(body1.eventsCount).toBe(1)

    // Verify persistence in local database via exact payload_hash
    const batch = await db.whatsAppWebhookBatch.findUniqueOrThrow({
      where: { payload_hash: payloadHash },
    })
    cleanupTracker.webhookBatchIds.add(batch.id)
    expect(batch.status).toBe('RECEIVED')

    const event = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { batch_id: batch.id, meta_message_id: wamid },
    })
    cleanupTracker.webhookEventIds.add(event.id)
    expect(event.processing_state).toBe('RECEIVED')

    // 2. Duplicate submission with identical payload -> duplicate: true
    const res2 = await mockGate.dispatchSyntheticWebhook(request, payload)
    expect(res2.status()).toBe(200)
    const body2 = await res2.json()
    expect(body2.success).toBe(true)
    expect(body2.duplicate).toBe(true)
    expect(body2.eventsCount).toBe(1)

    // Confirm no additional batch or event was created for this exact payload and WAMID
    const countBatches = await db.whatsAppWebhookBatch.count({
      where: { payload_hash: payloadHash },
    })
    expect(countBatches, 'Exactly one matching batch should exist for this payload hash').toBe(1)

    const countEvents = await db.whatsAppWebhookEvent.count({
      where: { batch_id: batch.id, meta_message_id: wamid },
    })
    expect(countEvents, 'Exactly one matching event should exist for this batch and WAMID').toBe(1)

    // 3. Payload size limit: > 256 KB -> HTTP 413
    const oversizedPadding = 'A'.repeat(260 * 1024) // 260 KB
    const oversizedPayload = {
      ...payload,
      padding: oversizedPadding,
    }

    const appSecret = process.env.WHATSAPP_APP_SECRET || 'e2e_test_webhook_app_secret_32char'
    const oversizedRaw = JSON.stringify(oversizedPayload)
    const sig = crypto.createHmac('sha256', appSecret).update(oversizedRaw).digest('hex')

    const resOversized = await request.post('/api/whatsapp/webhook', {
      data: oversizedRaw,
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${sig}`,
      },
    })
    expect(resOversized.status()).toBe(413)
    const oversizedBody = await resOversized.json()
    expect(oversizedBody.error).toBe('Payload Too Large')

    // Drain the ingested event to achieve clean worker quiescence before teardown
    await createParticipantWithAttempt(runId, 'dedup-user', wamid, cleanupTracker)

    const drainWorkerRes = await mockGate.triggerWorker(request)
    expect(drainWorkerRes.status()).toBe(200)

    const finalizedEvent = await db.whatsAppWebhookEvent.findUniqueOrThrow({
      where: { id: event.id },
    })
    expect(finalizedEvent.processing_state).toBe('PROCESSED')
  })

  // Scenario C: Worker Status Advancement (SENT -> DELIVERED -> READ)
  test('Scenario C: advances delivery and participant status from SENT to DELIVERED and READ', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    // 1. Create a valid local fixture in initial SENT state
    const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000).toString()
    const participantName = `E2E Advance [${runId}]`
    const phone = `62812${uniqueDigits}`
    const qrToken = crypto.randomUUID()
    const wamid = `wamid.mock_${runId}_advance_${Date.now()}`
    const t0 = new Date(Date.now() - 30000)

    const participant = await db.participant.create({
      data: {
        full_name: participantName,
        whatsapp_number: phone,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        is_wa_opt_in: true,
        qr_token: qrToken,
        status: 'REGISTERED',
        registration_type: 'ONLINE',
        wa_delivery_status: 'SENT',
        wa_message_id: wamid,
        wa_sent_at: t0,
      },
    })
    cleanupTracker.participantIds.add(participant.id)

    const delivery = await db.whatsAppDelivery.create({
      data: {
        participant_id: participant.id,
        participant_name: participant.full_name,
        qr_token_snapshot: qrToken,
        recipient_phone: phone,
        status: 'SENT',
        total_attempts: 1,
        sent_at: t0,
      },
    })
    cleanupTracker.deliveryIds.add(delivery.id)

    const attempt = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: delivery.id,
        attempt_number: 1,
        status: 'SUCCESS',
        meta_message_id: wamid,
        request_started_at: t0,
        response_received_at: t0,
      },
    })
    cleanupTracker.attemptIds.add(attempt.id)

    // 2. Ingest DELIVERED webhook event with timestamp t1 > t0
    const t1Sec = Math.floor(t0.getTime() / 1000) + 10
    const deliveredPayload = createStatusWebhookPayload({
      runId,
      wamid,
      status: 'delivered',
      timestampSec: t1Sec,
      recipientPhone: phone,
    })

    const delRes = await mockGate.dispatchSyntheticWebhook(request, deliveredPayload)
    expect(delRes.status()).toBe(200)

    // Trigger worker to process DELIVERED event
    const workerRes1 = await mockGate.triggerWorker(request)
    expect(workerRes1.status()).toBe(200)

    // Verify delivery and participant advanced to DELIVERED
    const delDelivery = await db.whatsAppDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
    expect(delDelivery.status).toBe('DELIVERED')
    expect(delDelivery.delivered_at).not.toBeNull()

    const delParticipant = await db.participant.findUniqueOrThrow({ where: { id: participant.id } })
    expect(delParticipant.wa_delivery_status).toBe('DELIVERED')

    const delEvent = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid, event_status: 'delivered' },
    })
    cleanupTracker.webhookEventIds.add(delEvent.id)
    if (delEvent.batch_id) cleanupTracker.webhookBatchIds.add(delEvent.batch_id)
    expect(delEvent.processing_state).toBe('PROCESSED')

    // 3. Ingest READ webhook event with timestamp t2 > t1
    const t2Sec = t1Sec + 10
    const readPayload = createStatusWebhookPayload({
      runId,
      wamid,
      status: 'read',
      timestampSec: t2Sec,
      recipientPhone: phone,
    })

    const readRes = await mockGate.dispatchSyntheticWebhook(request, readPayload)
    expect(readRes.status()).toBe(200)

    // Trigger worker to process READ event
    const workerRes2 = await mockGate.triggerWorker(request)
    expect(workerRes2.status()).toBe(200)

    // Verify delivery and participant advanced to READ
    const readDelivery = await db.whatsAppDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
    expect(readDelivery.status).toBe('READ')
    expect(readDelivery.read_at).not.toBeNull()

    const readParticipant = await db.participant.findUniqueOrThrow({ where: { id: participant.id } })
    expect(readParticipant.wa_delivery_status).toBe('READ')

    const readEvent = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid, event_status: 'read' },
    })
    cleanupTracker.webhookEventIds.add(readEvent.id)
    if (readEvent.batch_id) cleanupTracker.webhookBatchIds.add(readEvent.batch_id)
    expect(readEvent.processing_state).toBe('PROCESSED')
  })

  // Scenario D: Precedence and Reversion Protection
  test('Scenario D: enforces precedence protection (stale SENT ignored, READ terminal, permanent failure protected)', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    // -------------------------------------------------------------------------
    // Sub-test 1: Delayed SENT cannot regress an already DELIVERED delivery
    // -------------------------------------------------------------------------
    const uniqueDigits1 = Math.floor(10000000 + Math.random() * 90000000).toString()
    const pName1 = `E2E Revert1 [${runId}]`
    const phone1 = `62812${uniqueDigits1}`
    const qr1 = crypto.randomUUID()
    const wamid1 = `wamid.mock_${runId}_rev1_${Date.now()}`
    const tDelivered = new Date(Date.now() - 10000)

    const participant1 = await db.participant.create({
      data: {
        full_name: pName1,
        whatsapp_number: phone1,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        qr_token: qr1,
        status: 'REGISTERED',
        wa_delivery_status: 'DELIVERED',
        wa_message_id: wamid1,
      },
    })
    cleanupTracker.participantIds.add(participant1.id)

    const delivery1 = await db.whatsAppDelivery.create({
      data: {
        participant_id: participant1.id,
        participant_name: participant1.full_name,
        qr_token_snapshot: qr1,
        recipient_phone: phone1,
        status: 'DELIVERED',
        total_attempts: 1,
        delivered_at: tDelivered,
      },
    })
    cleanupTracker.deliveryIds.add(delivery1.id)

    const attempt1 = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: delivery1.id,
        attempt_number: 1,
        status: 'SUCCESS',
        meta_message_id: wamid1,
      },
    })
    cleanupTracker.attemptIds.add(attempt1.id)

    // Send delayed SENT event with timestamp tSent < tDelivered
    const tSentSec = Math.floor(tDelivered.getTime() / 1000) - 10
    const sentPayload = createStatusWebhookPayload({
      runId,
      wamid: wamid1,
      status: 'sent',
      timestampSec: tSentSec,
      recipientPhone: phone1,
    })
    await mockGate.dispatchSyntheticWebhook(request, sentPayload)
    await mockGate.triggerWorker(request)

    // Assert delivery remains DELIVERED and event is IGNORED
    const del1After = await db.whatsAppDelivery.findUniqueOrThrow({ where: { id: delivery1.id } })
    expect(del1After.status).toBe('DELIVERED')

    const ev1 = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid1, event_status: 'sent' },
    })
    cleanupTracker.webhookEventIds.add(ev1.id)
    if (ev1.batch_id) cleanupTracker.webhookBatchIds.add(ev1.batch_id)
    expect(ev1.processing_state).toBe('IGNORED')
    expect(ev1.failure_reason).toMatch(/STALE_EVENT_OLDER_TIMESTAMP|CANNOT_REGRESS_TO_SENT/)

    // -------------------------------------------------------------------------
    // Sub-test 2: Event cannot regress a terminal READ delivery
    // -------------------------------------------------------------------------
    const uniqueDigits2 = Math.floor(10000000 + Math.random() * 90000000).toString()
    const pName2 = `E2E Revert2 [${runId}]`
    const phone2 = `62812${uniqueDigits2}`
    const qr2 = crypto.randomUUID()
    const wamid2 = `wamid.mock_${runId}_rev2_${Date.now()}`
    const tRead = new Date(Date.now() - 5000)

    const participant2 = await db.participant.create({
      data: {
        full_name: pName2,
        whatsapp_number: phone2,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        qr_token: qr2,
        status: 'REGISTERED',
        wa_delivery_status: 'READ',
        wa_message_id: wamid2,
      },
    })
    cleanupTracker.participantIds.add(participant2.id)

    const delivery2 = await db.whatsAppDelivery.create({
      data: {
        participant_id: participant2.id,
        participant_name: participant2.full_name,
        qr_token_snapshot: qr2,
        recipient_phone: phone2,
        status: 'READ',
        total_attempts: 1,
        read_at: tRead,
      },
    })
    cleanupTracker.deliveryIds.add(delivery2.id)

    const attempt2 = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: delivery2.id,
        attempt_number: 1,
        status: 'SUCCESS',
        meta_message_id: wamid2,
      },
    })
    cleanupTracker.attemptIds.add(attempt2.id)

    // Send DELIVERED event with newer timestamp
    const tDelSec2 = Math.floor(tRead.getTime() / 1000) + 10
    const delPayload2 = createStatusWebhookPayload({
      runId,
      wamid: wamid2,
      status: 'delivered',
      timestampSec: tDelSec2,
      recipientPhone: phone2,
    })
    await mockGate.dispatchSyntheticWebhook(request, delPayload2)
    await mockGate.triggerWorker(request)

    const del2After = await db.whatsAppDelivery.findUniqueOrThrow({ where: { id: delivery2.id } })
    expect(del2After.status).toBe('READ')

    const ev2 = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid2, event_status: 'delivered' },
    })
    cleanupTracker.webhookEventIds.add(ev2.id)
    if (ev2.batch_id) cleanupTracker.webhookBatchIds.add(ev2.batch_id)
    expect(ev2.processing_state).toBe('IGNORED')
    expect(ev2.failure_reason).toBe('READ_IS_TERMINAL')

    // -------------------------------------------------------------------------
    // Sub-test 3: Permanent recipient error code prevents later DELIVERED
    // -------------------------------------------------------------------------
    const uniqueDigits3 = Math.floor(10000000 + Math.random() * 90000000).toString()
    const pName3 = `E2E Revert3 [${runId}]`
    const phone3 = `62812${uniqueDigits3}`
    const qr3 = crypto.randomUUID()
    const wamid3 = `wamid.mock_${runId}_rev3_${Date.now()}`
    const tFailed = new Date(Date.now() - 5000)

    const participant3 = await db.participant.create({
      data: {
        full_name: pName3,
        whatsapp_number: phone3,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        qr_token: qr3,
        status: 'REGISTERED',
        wa_delivery_status: 'FAILED',
        wa_message_id: wamid3,
        wa_error_code: '131026',
      },
    })
    cleanupTracker.participantIds.add(participant3.id)

    const delivery3 = await db.whatsAppDelivery.create({
      data: {
        participant_id: participant3.id,
        participant_name: participant3.full_name,
        qr_token_snapshot: qr3,
        recipient_phone: phone3,
        status: 'FAILED',
        total_attempts: 1,
        failed_at: tFailed,
        last_error_code: '131026',
      },
    })
    cleanupTracker.deliveryIds.add(delivery3.id)

    const attempt3 = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: delivery3.id,
        attempt_number: 1,
        status: 'FAILED',
        meta_message_id: wamid3,
        error_code: '131026',
      },
    })
    cleanupTracker.attemptIds.add(attempt3.id)

    const tDelSec3 = Math.floor(tFailed.getTime() / 1000) + 10
    const delPayload3 = createStatusWebhookPayload({
      runId,
      wamid: wamid3,
      status: 'delivered',
      timestampSec: tDelSec3,
      recipientPhone: phone3,
    })
    await mockGate.dispatchSyntheticWebhook(request, delPayload3)
    await mockGate.triggerWorker(request)

    const del3After = await db.whatsAppDelivery.findUniqueOrThrow({ where: { id: delivery3.id } })
    expect(del3After.status).toBe('FAILED')

    const ev3 = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid3, event_status: 'delivered' },
    })
    cleanupTracker.webhookEventIds.add(ev3.id)
    if (ev3.batch_id) cleanupTracker.webhookBatchIds.add(ev3.batch_id)
    expect(ev3.processing_state).toBe('IGNORED')
    expect(ev3.failure_reason).toContain('INELIGIBLE_PREVIOUS_FAILURE_CATEGORY')
  })

  // Scenario E: Unmatched WAMID and Late Matching
  test('Scenario E: verifies unmatched WAMID backoff scheduling and late matching processing', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    // Extend test timeout to comfortably allow waiting for the real 15s retry backoff delay
    test.setTimeout(45000)

    const wamid = `wamid.mock_${runId}_unmatched_${Date.now()}`
    const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000).toString()
    const participantName = `E2E Unmatched [${runId}]`
    const phone = `62812${uniqueDigits}`
    const qrToken = crypto.randomUUID()
    const nowSec = Math.floor(Date.now() / 1000)

    // 1. Submit valid status webhook with WAMID that does NOT exist in WhatsAppDeliveryAttempt
    const payload = createStatusWebhookPayload({
      runId,
      wamid,
      status: 'delivered',
      timestampSec: nowSec,
      recipientPhone: phone,
    })

    const ingestRes = await mockGate.dispatchSyntheticWebhook(request, payload)
    expect(ingestRes.status()).toBe(200)

    const initialEvent = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid },
    })
    cleanupTracker.webhookEventIds.add(initialEvent.id)
    if (initialEvent.batch_id) cleanupTracker.webhookBatchIds.add(initialEvent.batch_id)
    expect(initialEvent.processing_state).toBe('RECEIVED')

    // 2. Trigger worker: no attempt exists -> event enters RETRY state with backoff
    await mockGate.triggerWorker(request)

    const retryEvent = await db.whatsAppWebhookEvent.findUniqueOrThrow({
      where: { id: initialEvent.id },
    })
    expect(retryEvent.processing_state).toBe('RETRY')
    expect(retryEvent.retry_count).toBe(1)
    expect(retryEvent.failure_reason).toBe('UNMATCHED_WAMID')
    expect(retryEvent.next_retry_at).not.toBeNull()
    expect(retryEvent.next_retry_at!.getTime()).toBeGreaterThan(Date.now())

    // 3. Create the matching Delivery and Attempt in the local database (simulating late delivery persistence)
    const participant = await db.participant.create({
      data: {
        full_name: participantName,
        whatsapp_number: phone,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        qr_token: qrToken,
        status: 'REGISTERED',
        wa_delivery_status: 'SENT',
        wa_message_id: wamid,
      },
    })
    cleanupTracker.participantIds.add(participant.id)

    const delivery = await db.whatsAppDelivery.create({
      data: {
        participant_id: participant.id,
        participant_name: participant.full_name,
        qr_token_snapshot: qrToken,
        recipient_phone: phone,
        status: 'SENT',
        total_attempts: 1,
        sent_at: new Date(nowSec * 1000 - 5000),
      },
    })
    cleanupTracker.deliveryIds.add(delivery.id)

    const attempt = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: delivery.id,
        attempt_number: 1,
        status: 'SUCCESS',
        meta_message_id: wamid,
      },
    })
    cleanupTracker.attemptIds.add(attempt.id)

    // 4. Wait for the real first-stage backoff delay (15s + positive jitter) without clock manipulation
    const delayMs = Math.max(0, retryEvent.next_retry_at!.getTime() - Date.now() + 1000)
    await new Promise((resolve) => setTimeout(resolve, delayMs))

    // 5. Trigger worker again: now attempt matches and next_retry_at <= now
    await mockGate.triggerWorker(request)

    // 6. Verify event was processed and delivery updated to DELIVERED
    const finalEvent = await db.whatsAppWebhookEvent.findUniqueOrThrow({
      where: { id: initialEvent.id },
    })
    expect(finalEvent.processing_state).toBe('PROCESSED')

    const finalDelivery = await db.whatsAppDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    })
    expect(finalDelivery.status).toBe('DELIVERED')

    const finalParticipant = await db.participant.findUniqueOrThrow({
      where: { id: participant.id },
    })
    expect(finalParticipant.wa_delivery_status).toBe('DELIVERED')
  })
})
