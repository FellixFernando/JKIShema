import { test, expect } from '../fixtures/test-context'
import { db } from '@/lib/db'
import crypto from 'crypto'

/**
 * Constructs a canonical Meta WhatsApp inbound message webhook payload.
 * Strictly injects runId into entry ID and wamid to satisfy cleanup ownership rules.
 */
function createInboundMessagePayload(params: {
  runId: string
  wamid?: string
  senderPhone: string
  textBody?: string
  timestampSec: number
  messageType?: string
  rawMessageOverride?: any
}) {
  const messageObj: any = {
    from: params.senderPhone,
    timestamp: String(params.timestampSec),
    type: params.messageType || 'text',
  }

  if (params.wamid) {
    messageObj.id = params.wamid
  }

  if (params.textBody !== undefined) {
    messageObj.text = { body: params.textBody }
  }

  if (params.rawMessageOverride) {
    Object.assign(messageObj, params.rawMessageOverride)
  }

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
              contacts: [
                {
                  profile: { name: 'E2E Inbound User' },
                  wa_id: params.senderPhone,
                },
              ],
              messages: [messageObj],
            },
          },
        ],
      },
    ],
  }
}

/**
 * Helper to seed a valid registered participant with delivery record in local PostgreSQL jkishema_e2e.
 */
async function seedParticipantWithDelivery(params: {
  runId: string
  label: string
  cleanupTracker: any
  customPhone?: string
}) {
  const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000).toString()
  const participantName = `E2E ${params.label} [${params.runId}]`
  const phone = params.customPhone || `62812${uniqueDigits}`
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
      wa_delivery_status: 'NOT_SENT',
    },
  })
  params.cleanupTracker.participantIds.add(participant.id)

  const delivery = await db.whatsAppDelivery.create({
    data: {
      participant_id: participant.id,
      participant_name: participant.full_name,
      qr_token_snapshot: qrToken,
      recipient_phone: phone,
      status: 'NOT_SENT',
      total_attempts: 0,
      created_at: t0,
    },
  })
  params.cleanupTracker.deliveryIds.add(delivery.id)

  return { participant, delivery, phone, qrToken }
}

test.describe.serial('E2E Inbound WhatsApp RSVP Suite', () => {
  // ---------------------------------------------------------------------------
  // Scenario A — Valid HADIR Message
  // ---------------------------------------------------------------------------
  test('Scenario A: valid HADIR message confirms attendance without corrupting registration state', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    // 1. Seed primary test participant and control participant
    const { participant, delivery, phone } = await seedParticipantWithDelivery({
      runId,
      label: 'Hadir-Primary',
      cleanupTracker,
    })
    const control = await seedParticipantWithDelivery({
      runId,
      label: 'Hadir-Control',
      cleanupTracker,
    })

    // Capture original state
    const originalParticipant = await db.participant.findUniqueOrThrow({ where: { id: participant.id } })
    const originalDelivery = await db.whatsAppDelivery.findUniqueOrThrow({ where: { id: delivery.id } })

    // 2. Dispatch valid HADIR webhook payload
    const wamid = `wamid.mock_inbound_${runId}_hadir_${Date.now()}`
    const nowSec = Math.floor(Date.now() / 1000)
    const payload = createInboundMessagePayload({
      runId,
      wamid,
      senderPhone: phone,
      textBody: 'HADIR',
      timestampSec: nowSec,
    })
    const rawBody = JSON.stringify(payload)
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')

    const res = await mockGate.dispatchSyntheticWebhook(request, payload)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.duplicate).toBe(false)
    expect(body.eventsCount).toBe(1)

    // 3. Verify durable inbox event persistence
    const batch = await db.whatsAppWebhookBatch.findUniqueOrThrow({
      where: { payload_hash: payloadHash },
    })
    cleanupTracker.webhookBatchIds.add(batch.id)

    const event = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid },
    })
    cleanupTracker.webhookEventIds.add(event.id)
    expect(event.event_type).toBe('INBOUND_MESSAGE')
    expect(event.processing_state).toBe('PROCESSED')
    expect(event.failure_reason).toBeNull()

    // 4. Verify participant remains REGISTERED and fields are uncorrupted
    const updatedParticipant = await db.participant.findUniqueOrThrow({ where: { id: participant.id } })
    expect(updatedParticipant.status).toBe('REGISTERED')
    expect(updatedParticipant.qr_token).toBe(originalParticipant.qr_token)
    expect(updatedParticipant.whatsapp_number).toBe(originalParticipant.whatsapp_number)
    expect(updatedParticipant.church_status).toBe(originalParticipant.church_status)
    expect(updatedParticipant.church_branch).toBe(originalParticipant.church_branch)

    // 5. Verify delivery and QR token snapshot are unchanged
    const updatedDelivery = await db.whatsAppDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
    expect(updatedDelivery.status).toBe(originalDelivery.status)
    expect(updatedDelivery.qr_token_snapshot).toBe(originalDelivery.qr_token_snapshot)
    expect(updatedDelivery.total_attempts).toBe(originalDelivery.total_attempts)

    // 6. Verify unrelated control participant is untouched
    const updatedControl = await db.participant.findUniqueOrThrow({ where: { id: control.participant.id } })
    expect(updatedControl.status).toBe('REGISTERED')
  })

  // ---------------------------------------------------------------------------
  // Scenario B — Valid BATAL Message
  // ---------------------------------------------------------------------------
  test('Scenario B: valid BATAL message cancels only the intended participant', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    // 1. Seed participant to cancel and unrelated control participant
    const { participant, delivery, phone } = await seedParticipantWithDelivery({
      runId,
      label: 'Batal-Target',
      cleanupTracker,
    })
    const control = await seedParticipantWithDelivery({
      runId,
      label: 'Batal-Control',
      cleanupTracker,
    })

    // 2. Dispatch inbound cancellation message
    const wamid = `wamid.mock_inbound_${runId}_batal_${Date.now()}`
    const nowSec = Math.floor(Date.now() / 1000)
    const payload = createInboundMessagePayload({
      runId,
      wamid,
      senderPhone: phone,
      textBody: 'Maaf saya batal hadir, ada keperluan mendadak',
      timestampSec: nowSec,
    })
    const rawBody = JSON.stringify(payload)
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')

    const res = await mockGate.dispatchSyntheticWebhook(request, payload)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.duplicate).toBe(false)

    // 3. Verify event is PROCESSED in database
    const batch = await db.whatsAppWebhookBatch.findUniqueOrThrow({
      where: { payload_hash: payloadHash },
    })
    cleanupTracker.webhookBatchIds.add(batch.id)

    const event = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid },
    })
    cleanupTracker.webhookEventIds.add(event.id)
    expect(event.event_type).toBe('INBOUND_MESSAGE')
    expect(event.processing_state).toBe('PROCESSED')

    // 4. Verify intended participant transitioned to CANCELLED
    const updatedParticipant = await db.participant.findUniqueOrThrow({ where: { id: participant.id } })
    expect(updatedParticipant.status).toBe('CANCELLED')
    expect(updatedParticipant.qr_token).toBe(delivery.qr_token_snapshot)

    // 5. Verify unrelated control participant remains REGISTERED
    const updatedControl = await db.participant.findUniqueOrThrow({ where: { id: control.participant.id } })
    expect(updatedControl.status).toBe('REGISTERED')
  })

  // ---------------------------------------------------------------------------
  // Scenario C — Duplicate Inbound Message
  // ---------------------------------------------------------------------------
  test('Scenario C: duplicate inbound message is deduplicated idempotently', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    const { participant, phone } = await seedParticipantWithDelivery({
      runId,
      label: 'Dedup-User',
      cleanupTracker,
    })

    const wamid = `wamid.mock_inbound_${runId}_dedup_${Date.now()}`
    const nowSec = Math.floor(Date.now() / 1000)
    const payload = createInboundMessagePayload({
      runId,
      wamid,
      senderPhone: phone,
      textBody: 'Batal',
      timestampSec: nowSec,
    })
    const rawBody = JSON.stringify(payload)
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')

    // 1. First dispatch: initial receipt
    const res1 = await mockGate.dispatchSyntheticWebhook(request, payload)
    expect(res1.status()).toBe(200)
    const body1 = await res1.json()
    expect(body1.success).toBe(true)
    expect(body1.duplicate).toBe(false)

    const batch = await db.whatsAppWebhookBatch.findUniqueOrThrow({
      where: { payload_hash: payloadHash },
    })
    cleanupTracker.webhookBatchIds.add(batch.id)

    const event = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid },
    })
    cleanupTracker.webhookEventIds.add(event.id)

    // 2. Second dispatch: identical payload
    const res2 = await mockGate.dispatchSyntheticWebhook(request, payload)
    expect(res2.status()).toBe(200)
    const body2 = await res2.json()
    expect(body2.success).toBe(true)
    expect(body2.duplicate).toBe(true)

    // 3. Verify exactly 1 batch and 1 event persist in database
    const batchCount = await db.whatsAppWebhookBatch.count({
      where: { payload_hash: payloadHash },
    })
    expect(batchCount).toBe(1)

    const eventCount = await db.whatsAppWebhookEvent.count({
      where: { meta_message_id: wamid },
    })
    expect(eventCount).toBe(1)

    // Participant state remains CANCELLED without double execution errors
    const updatedParticipant = await db.participant.findUniqueOrThrow({ where: { id: participant.id } })
    expect(updatedParticipant.status).toBe('CANCELLED')
  })

  // ---------------------------------------------------------------------------
  // Scenario D — Unknown Sender
  // ---------------------------------------------------------------------------
  test('Scenario D: message from unknown sender completes safely without modifying any participant', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    // Seed an existing control participant
    const control = await seedParticipantWithDelivery({
      runId,
      label: 'Unknown-Control',
      cleanupTracker,
    })

    const initialTotalParticipants = await db.participant.count({
      where: { full_name: { contains: runId } },
    })

    // Dispatch message from unregistered phone number
    const unknownPhone = '6289999999999'
    const wamid = `wamid.mock_inbound_${runId}_unknown_${Date.now()}`
    const nowSec = Math.floor(Date.now() / 1000)
    const payload = createInboundMessagePayload({
      runId,
      wamid,
      senderPhone: unknownPhone,
      textBody: 'Batal hadir',
      timestampSec: nowSec,
    })
    const rawBody = JSON.stringify(payload)
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')

    const res = await mockGate.dispatchSyntheticWebhook(request, payload)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    // Event is persisted and reaches PROCESSED with no participant found
    const batch = await db.whatsAppWebhookBatch.findUniqueOrThrow({
      where: { payload_hash: payloadHash },
    })
    cleanupTracker.webhookBatchIds.add(batch.id)

    const event = await db.whatsAppWebhookEvent.findFirstOrThrow({
      where: { meta_message_id: wamid },
    })
    cleanupTracker.webhookEventIds.add(event.id)
    expect(event.processing_state).toBe('PROCESSED')

    // Verify zero participants created or modified for this run
    const currentTotalParticipants = await db.participant.count({
      where: { full_name: { contains: runId } },
    })
    expect(currentTotalParticipants).toBe(initialTotalParticipants)

    const controlParticipant = await db.participant.findUniqueOrThrow({ where: { id: control.participant.id } })
    expect(controlParticipant.status).toBe('REGISTERED')
  })

  // ---------------------------------------------------------------------------
  // Scenario E — Invalid Webhook Signature
  // ---------------------------------------------------------------------------
  test('Scenario E: invalid webhook signature is rejected with HTTP 401', async ({
    request,
    runId,
    cleanupTracker,
  }) => {
    const { participant, phone } = await seedParticipantWithDelivery({
      runId,
      label: 'InvalidSig-User',
      cleanupTracker,
    })

    const wamid = `wamid.mock_inbound_${runId}_invalidsig_${Date.now()}`
    const nowSec = Math.floor(Date.now() / 1000)
    const payload = createInboundMessagePayload({
      runId,
      wamid,
      senderPhone: phone,
      textBody: 'Batal',
      timestampSec: nowSec,
    })
    const rawBody = JSON.stringify(payload)
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')

    // Dispatch directly with forged signature
    const res = await request.post('/api/whatsapp/webhook', {
      data: rawBody,
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
      },
    })
    expect(res.status()).toBe(401)

    // Verify no batch or event was persisted
    const batch = await db.whatsAppWebhookBatch.findUnique({
      where: { payload_hash: payloadHash },
    })
    expect(batch).toBeNull()

    const event = await db.whatsAppWebhookEvent.findFirst({
      where: { meta_message_id: wamid },
    })
    expect(event).toBeNull()

    // Verify participant was not mutated
    const currentParticipant = await db.participant.findUniqueOrThrow({ where: { id: participant.id } })
    expect(currentParticipant.status).toBe('REGISTERED')
  })

  // ---------------------------------------------------------------------------
  // Scenario F — Unsupported or Unrecognized Inbound Message
  // ---------------------------------------------------------------------------
  test('Scenario F: unsupported non-text or unrecognized messages do not trigger unintended mutations', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    const { participant, phone } = await seedParticipantWithDelivery({
      runId,
      label: 'Unsupported-User',
      cleanupTracker,
    })

    // Sub-test 1: Unsupported media/non-text message (e.g. image without text.body)
    const wamidNonText = `wamid.mock_inbound_${runId}_nontext_${Date.now()}`
    const nowSec = Math.floor(Date.now() / 1000)
    const nonTextPayload = createInboundMessagePayload({
      runId,
      wamid: wamidNonText,
      senderPhone: phone,
      timestampSec: nowSec,
      messageType: 'image',
      rawMessageOverride: {
        image: { id: 'media_123', mime_type: 'image/jpeg' },
      },
    })
    const rawNonText = JSON.stringify(nonTextPayload)
    const hashNonText = crypto.createHash('sha256').update(rawNonText).digest('hex')

    const res1 = await mockGate.dispatchSyntheticWebhook(request, nonTextPayload)
    expect(res1.status()).toBe(200)

    const batch1 = await db.whatsAppWebhookBatch.findUniqueOrThrow({ where: { payload_hash: hashNonText } })
    cleanupTracker.webhookBatchIds.add(batch1.id)

    const event1 = await db.whatsAppWebhookEvent.findFirstOrThrow({ where: { meta_message_id: wamidNonText } })
    cleanupTracker.webhookEventIds.add(event1.id)
    expect(event1.event_type).toBe('INBOUND_MESSAGE')
    expect(event1.processing_state).toBe('RECEIVED')

    // Non-text messages are safely bypassed during synchronous RSVP ingestion and left in RECEIVED.
    // Trigger worker to asynchronously process the queue and verify it transitions to terminal IGNORED.
    const workerRes = await mockGate.triggerWorker(request)
    expect(workerRes.status()).toBe(200)

    const updatedEvent1 = await db.whatsAppWebhookEvent.findUniqueOrThrow({ where: { id: event1.id } })
    expect(updatedEvent1.processing_state).toBe('IGNORED')
    expect(updatedEvent1.failure_reason).toBe('MISSING_PHONE_OR_TEXT')

    // Sub-test 2: Unrecognized conversational text (does not contain cancellation keywords)
    const wamidChat = `wamid.mock_inbound_${runId}_chat_${Date.now()}`
    const chatPayload = createInboundMessagePayload({
      runId,
      wamid: wamidChat,
      senderPhone: phone,
      textBody: 'Terima kasih banyak panitia, sampai jumpa di konser!',
      timestampSec: nowSec + 1,
    })
    const rawChat = JSON.stringify(chatPayload)
    const hashChat = crypto.createHash('sha256').update(rawChat).digest('hex')

    const res2 = await mockGate.dispatchSyntheticWebhook(request, chatPayload)
    expect(res2.status()).toBe(200)

    const batch2 = await db.whatsAppWebhookBatch.findUniqueOrThrow({ where: { payload_hash: hashChat } })
    cleanupTracker.webhookBatchIds.add(batch2.id)

    const event2 = await db.whatsAppWebhookEvent.findFirstOrThrow({ where: { meta_message_id: wamidChat } })
    cleanupTracker.webhookEventIds.add(event2.id)
    expect(event2.processing_state).toBe('PROCESSED')

    // Verify participant status remains REGISTERED through both messages
    const finalParticipant = await db.participant.findUniqueOrThrow({ where: { id: participant.id } })
    expect(finalParticipant.status).toBe('REGISTERED')
  })

  // ---------------------------------------------------------------------------
  // Scenario G — Data Integrity Across RSVP Lifecycle
  // ---------------------------------------------------------------------------
  test('Scenario G: verifies complete data integrity and non-corruption across RSVP lifecycle', async ({
    request,
    runId,
    mockGate,
    cleanupTracker,
  }) => {
    // 1. Seed participant with delivery and attempt
    const { participant, delivery, phone, qrToken } = await seedParticipantWithDelivery({
      runId,
      label: 'Integrity-User',
      cleanupTracker,
    })

    const attempt = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: delivery.id,
        attempt_number: 1,
        status: 'SUCCESS',
        meta_message_id: `wamid.mock_${runId}_integrity_att`,
      },
    })
    cleanupTracker.attemptIds.add(attempt.id)

    // Capture baseline snapshot
    const baselineParticipant = await db.participant.findUniqueOrThrow({ where: { id: participant.id } })
    const baselineDelivery = await db.whatsAppDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
    const baselineAttempt = await db.whatsAppDeliveryAttempt.findUniqueOrThrow({ where: { id: attempt.id } })

    // 2. Dispatch valid HADIR message
    const wamid = `wamid.mock_inbound_${runId}_integrity_${Date.now()}`
    const nowSec = Math.floor(Date.now() / 1000)
    const payload = createInboundMessagePayload({
      runId,
      wamid,
      senderPhone: phone,
      textBody: 'HADIR',
      timestampSec: nowSec,
    })
    const rawBody = JSON.stringify(payload)
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex')

    const res = await mockGate.dispatchSyntheticWebhook(request, payload)
    expect(res.status()).toBe(200)

    const batch = await db.whatsAppWebhookBatch.findUniqueOrThrow({ where: { payload_hash: payloadHash } })
    cleanupTracker.webhookBatchIds.add(batch.id)

    const event = await db.whatsAppWebhookEvent.findFirstOrThrow({ where: { meta_message_id: wamid } })
    cleanupTracker.webhookEventIds.add(event.id)
    expect(event.processing_state).toBe('PROCESSED')

    // 3. Field-by-field non-corruption assertions
    const postParticipant = await db.participant.findUniqueOrThrow({ where: { id: participant.id } })
    expect(postParticipant.qr_token).toBe(baselineParticipant.qr_token)
    expect(postParticipant.whatsapp_number).toBe(baselineParticipant.whatsapp_number)
    expect(postParticipant.church_status).toBe(baselineParticipant.church_status)
    expect(postParticipant.church_branch).toBe(baselineParticipant.church_branch)
    expect(postParticipant.status).toBe(baselineParticipant.status)
    expect(postParticipant.registration_type).toBe(baselineParticipant.registration_type)

    const postDelivery = await db.whatsAppDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
    expect(postDelivery.qr_token_snapshot).toBe(baselineDelivery.qr_token_snapshot)
    expect(postDelivery.qr_token_snapshot).toBe(qrToken)
    expect(postDelivery.status).toBe(baselineDelivery.status)
    expect(postDelivery.total_attempts).toBe(baselineDelivery.total_attempts)

    const postAttempt = await db.whatsAppDeliveryAttempt.findUniqueOrThrow({ where: { id: attempt.id } })
    expect(postAttempt.meta_message_id).toBe(baselineAttempt.meta_message_id)
    expect(postAttempt.status).toBe(baselineAttempt.status)
    expect(postAttempt.attempt_number).toBe(baselineAttempt.attempt_number)
  })
})
