import { test, expect } from '../fixtures/test-context'
import { db } from '@/lib/db'
import crypto from 'crypto'
import { deliverParticipantTicket } from '@/services/whatsapp.service'

/**
 * E2E & Service-Level WhatsApp Mock Dispatch Test Suite
 *
 * Verifies the three distinct execution paths in the WhatsApp mock engine:
 * 1. Scenario A (Browser-Driven): Default Mock Mode Isolation (NOT_SENT, 0 attempts, no fake WAMID).
 * 2. Scenario B (Service-Level): Simulated Failure (FAILED, total_attempts=1, SIMULATED_FAILURE, no WAMID).
 * 3. Scenario C (Service-Level): Simulated Success (SENT, total_attempts=1, wamid.mock_..., SUCCESS attempt).
 *
 * Runs serially to guarantee environment variable overrides in Scenarios B and C
 * do not interfere with other scenarios.
 */
test.describe.serial('E2E WhatsApp Mock Dispatch Suite', () => {
  // Scenario A: Default Mock Isolation (Browser E2E)
  test('Scenario A: public browser registration executes default mock isolation path', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    // 1. Confirm mock mode is strictly active
    expect(
      process.env.WHATSAPP_MOCK_MODE,
      'WHATSAPP_MOCK_MODE must be enabled in E2E'
    ).toBe('true')

    // 2. Setup Meta network request interceptor
    const metaRequests: string[] = []
    const consoleErrors: string[] = []
    const pageErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    page.on('pageerror', (err) => {
      pageErrors.push(err.message)
    })

    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('graph.facebook.com') || url.includes('facebook.com')) {
        metaRequests.push(url)
      }
    })

    // 3. Register via public browser UI with unique run marker
    const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000).toString()
    const participantName = `E2E Mock Default [${runId}]`
    const rawWhatsApp = `0812${uniqueDigits}`
    const expectedNormalizedWhatsApp = `62812${uniqueDigits}`
    const selectedBranch = 'JKI Shema Sunter, Jakarta'

    const navResponse = await page.goto('/register', { waitUntil: 'networkidle' })
    expect(navResponse, 'Expected navigation response').not.toBeNull()
    expect(navResponse!.status()).toBe(200)

    const nameInput = page.getByPlaceholder('Masukkan nama lengkap')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill(participantName)
    await expect(nameInput).toHaveValue(participantName)

    const phoneInput = page.getByPlaceholder('Contoh: 081234567890')
    await expect(phoneInput).toBeVisible({ timeout: 5000 })
    await phoneInput.fill(rawWhatsApp)
    await expect(phoneInput).toHaveValue(rawWhatsApp)

    const branchSelect = page.locator('select').filter({
      has: page.locator('option', { hasText: 'Pilih gereja / cabang' }),
    })
    await expect(branchSelect).toBeVisible({ timeout: 5000 })
    await branchSelect.selectOption(selectedBranch)

    const consentCheckbox = page.locator('#optin-0')
    await expect(consentCheckbox).toBeChecked()

    // Ensure inputs retain values before submitting
    if ((await nameInput.inputValue()) !== participantName) {
      await nameInput.fill(participantName)
      await expect(nameInput).toHaveValue(participantName)
    }
    if ((await phoneInput.inputValue()) !== rawWhatsApp) {
      await phoneInput.fill(rawWhatsApp)
      await expect(phoneInput).toHaveValue(rawWhatsApp)
    }

    const submitButton = page.getByRole('button', { name: /Kirim Pendaftaran/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // 4. Verify browser registration succeeds and TicketCard appears
    const successHeading = page.getByRole('heading', { name: /Pendaftaran Berhasil!/i })
    await expect(successHeading).toBeVisible({ timeout: 15000 })

    const ticketCardName = page.locator('h3', { hasText: participantName })
    await expect(ticketCardName).toBeVisible({ timeout: 5000 })

    // 5. Query local E2E database to verify default mock isolation transitions
    const participant = await db.participant.findFirst({
      where: { full_name: participantName },
    })
    expect(participant, 'Participant record must be persisted in local database').not.toBeNull()
    cleanupTracker.participantIds.add(participant!.id)

    const delivery = await db.whatsAppDelivery.findFirst({
      where: { participant_id: participant!.id },
    })
    expect(delivery, 'WhatsAppDelivery record must exist').not.toBeNull()
    cleanupTracker.deliveryIds.add(delivery!.id)

    // Under default Section 2.D mock isolation:
    // PENDING -> NOT_SENT, total_attempts=0, 0 attempts created, wa_message_id=null
    expect(delivery!.status).toBe('NOT_SENT')
    expect(participant!.wa_delivery_status).toBe('NOT_SENT')
    expect(delivery!.total_attempts).toBe(0)
    expect(participant!.wa_message_id).toBeNull()
    expect(delivery!.sent_at).toBeNull()
    expect(delivery!.failed_at).toBeNull()
    expect(delivery!.last_error_code).toBeNull()
    expect(delivery!.last_error_message).toBeNull()

    const attempts = await db.whatsAppDeliveryAttempt.findMany({
      where: { delivery_id: delivery!.id },
    })
    expect(attempts, 'No attempts should be created under default mock isolation').toHaveLength(0)

    // 6. Network isolation: zero requests to Meta Graph API
    expect(metaRequests, 'Zero requests to Meta Graph API').toEqual([])
    expect(consoleErrors, 'Zero browser console errors').toEqual([])
    expect(pageErrors, 'Zero uncaught page errors').toEqual([])
  })

  // Scenario B: Simulated Failure (Service-Level Integration)
  test('Scenario B: simulated dispatch failure transitions delivery to FAILED with SIMULATED_FAILURE error', async ({
    runId,
    cleanupTracker,
  }) => {
    // 1. Confirm mock mode is active
    expect(
      process.env.WHATSAPP_MOCK_MODE,
      'WHATSAPP_MOCK_MODE must be enabled in E2E'
    ).toBe('true')

    // 2. Create a dedicated valid fixture in initial PENDING state in local jkishema_e2e
    const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000).toString()
    const participantName = `E2E Mock Failure [${runId}]`
    const phone = `62812${uniqueDigits}`
    const qrToken = crypto.randomUUID()

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
        wa_delivery_status: 'PENDING',
      },
    })
    cleanupTracker.participantIds.add(participant.id)

    const delivery = await db.whatsAppDelivery.create({
      data: {
        participant_id: participant.id,
        participant_name: participant.full_name,
        qr_token_snapshot: qrToken,
        recipient_phone: phone,
        status: 'PENDING',
        total_attempts: 0,
      },
    })
    cleanupTracker.deliveryIds.add(delivery.id)

    // 3. Set WHATSAPP_SIMULATE_DISPATCH_FAILURE=true strictly for this scenario
    const prevOutcome = process.env.WHATSAPP_MOCK_DISPATCH_OUTCOME
    const prevSimulate = process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE

    let dispatchResult: any
    try {
      delete process.env.WHATSAPP_MOCK_DISPATCH_OUTCOME
      process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE = 'true'

      // Execute dispatch directly via domain service
      dispatchResult = await deliverParticipantTicket(participant.id)
    } finally {
      // Restore original environment values
      if (prevOutcome !== undefined) {
        process.env.WHATSAPP_MOCK_DISPATCH_OUTCOME = prevOutcome
      } else {
        delete process.env.WHATSAPP_MOCK_DISPATCH_OUTCOME
      }

      if (prevSimulate !== undefined) {
        process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE = prevSimulate
      } else {
        delete process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE
      }
    }

    // 4. Verify service dispatch outcome
    expect(dispatchResult.success).toBe(false)
    expect(dispatchResult.outcome).toBe('DISPATCH_REJECTED')
    expect(dispatchResult.error).toBe('Simulated registration dispatch failure for E2E testing')

    // 5. Verify local database records transitioned to FAILED
    const updatedDelivery = await db.whatsAppDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    })
    expect(updatedDelivery.status).toBe('FAILED')
    expect(updatedDelivery.total_attempts).toBe(1)
    expect(updatedDelivery.failed_at).not.toBeNull()
    expect(updatedDelivery.last_error_code).toBe('SIMULATED_FAILURE')
    expect(updatedDelivery.last_error_message).toBe(
      'Simulated registration dispatch failure for E2E testing'
    )

    // 6. Verify delivery attempt record
    const attempts = await db.whatsAppDeliveryAttempt.findMany({
      where: { delivery_id: delivery.id },
    })
    expect(attempts).toHaveLength(1)
    expect(attempts[0].attempt_number).toBe(1)
    expect(attempts[0].status).toBe('FAILED')
    expect(attempts[0].error_code).toBe('SIMULATED_FAILURE')
    expect(attempts[0].error_message).toBe(
      'Simulated registration dispatch failure for E2E testing'
    )
    expect(attempts[0].meta_message_id).toBeNull()
    cleanupTracker.attemptIds.add(attempts[0].id)

    // 7. Verify participant fields are synchronized and no fake WAMID exists
    const updatedParticipant = await db.participant.findUniqueOrThrow({
      where: { id: participant.id },
    })
    expect(updatedParticipant.wa_delivery_status).toBe('FAILED')
    expect(updatedParticipant.wa_error_code).toBe('SIMULATED_FAILURE')
    expect(updatedParticipant.wa_error_message).toBe(
      'Simulated registration dispatch failure for E2E testing'
    )
    expect(updatedParticipant.wa_message_id).toBeNull()
  })

  // Scenario C: Simulated Success (Service-Level Integration)
  test('Scenario C: simulated dispatch success transitions delivery to SENT with wamid.mock_... and attempt record', async ({
    runId,
    cleanupTracker,
  }) => {
    // 1. Confirm mock mode is active
    expect(
      process.env.WHATSAPP_MOCK_MODE,
      'WHATSAPP_MOCK_MODE must be enabled in E2E'
    ).toBe('true')

    // 2. Create a dedicated valid fixture in initial PENDING state in local jkishema_e2e
    const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000).toString()
    const participantName = `E2E Mock Success [${runId}]`
    const phone = `62812${uniqueDigits}`
    const qrToken = crypto.randomUUID()

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
        wa_delivery_status: 'PENDING',
      },
    })
    cleanupTracker.participantIds.add(participant.id)

    const delivery = await db.whatsAppDelivery.create({
      data: {
        participant_id: participant.id,
        participant_name: participant.full_name,
        qr_token_snapshot: qrToken,
        recipient_phone: phone,
        status: 'PENDING',
        total_attempts: 0,
      },
    })
    cleanupTracker.deliveryIds.add(delivery.id)

    // 3. Set WHATSAPP_MOCK_DISPATCH_OUTCOME=SENT strictly for this scenario
    const prevOutcome = process.env.WHATSAPP_MOCK_DISPATCH_OUTCOME
    const prevSimulate = process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE

    let dispatchResult: any
    try {
      delete process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE
      process.env.WHATSAPP_MOCK_DISPATCH_OUTCOME = 'SENT'

      // Execute dispatch directly via domain service
      dispatchResult = await deliverParticipantTicket(participant.id)
    } finally {
      // Restore original environment values
      if (prevOutcome !== undefined) {
        process.env.WHATSAPP_MOCK_DISPATCH_OUTCOME = prevOutcome
      } else {
        delete process.env.WHATSAPP_MOCK_DISPATCH_OUTCOME
      }

      if (prevSimulate !== undefined) {
        process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE = prevSimulate
      } else {
        delete process.env.WHATSAPP_SIMULATE_DISPATCH_FAILURE
      }
    }

    // 4. Verify service dispatch outcome
    expect(dispatchResult.success).toBe(true)
    expect(dispatchResult.outcome).toBe('MOCK_SUCCESS')
    expect(dispatchResult.metaMessageId).toMatch(/^wamid\.mock_/i)

    const expectedWamid = dispatchResult.metaMessageId!

    // 5. Verify local database records transitioned to SENT
    const updatedDelivery = await db.whatsAppDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    })
    expect(updatedDelivery.status).toBe('SENT')
    expect(updatedDelivery.total_attempts).toBe(1)
    expect(updatedDelivery.sent_at).not.toBeNull()
    expect(updatedDelivery.last_error_code).toBeNull()
    expect(updatedDelivery.last_error_message).toBeNull()

    // 6. Verify delivery attempt record
    const attempts = await db.whatsAppDeliveryAttempt.findMany({
      where: { delivery_id: delivery.id },
    })
    expect(attempts).toHaveLength(1)
    expect(attempts[0].attempt_number).toBe(1)
    expect(attempts[0].status).toBe('SUCCESS')
    expect(attempts[0].meta_message_id).toBe(expectedWamid)
    expect(attempts[0].meta_message_id).toMatch(/^wamid\.mock_/i)
    cleanupTracker.attemptIds.add(attempts[0].id)

    // 7. Verify participant fields are synchronized with the generated mock WAMID
    const updatedParticipant = await db.participant.findUniqueOrThrow({
      where: { id: participant.id },
    })
    expect(updatedParticipant.wa_delivery_status).toBe('SENT')
    expect(updatedParticipant.wa_message_id).toBe(expectedWamid)
    expect(updatedParticipant.wa_message_id).toBe(attempts[0].meta_message_id)
    expect(updatedParticipant.wa_error_code).toBeNull()
    expect(updatedParticipant.wa_error_message).toBeNull()
  })
})
