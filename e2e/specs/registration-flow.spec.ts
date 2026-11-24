import { test, expect } from '../fixtures/test-context'
import { db } from '@/lib/db'
import sharp from 'sharp'

test.describe('E2E Registration Flow Suite', () => {
  test('successfully registers a primary registrant through the browser UI and persists records in local DB', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    // 1. Generate unique, traceable test data matching runId security invariant
    const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000).toString()
    const participantName = `E2E Primary [${runId}]`
    const rawWhatsApp = `0812${uniqueDigits}`
    const expectedNormalizedWhatsApp = `62812${uniqueDigits}`
    const selectedBranch = 'JKI Shema Sunter, Jakarta'

    // 2. Set up request monitors to guarantee safety and catch errors
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const failedRequests: Array<{ url: string; status?: number; error?: string }> = []
    const metaRequests: string[] = []

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
      // Enforce zero real outbound requests to Meta WhatsApp Cloud API
      if (url.includes('graph.facebook.com') || url.includes('facebook.com')) {
        metaRequests.push(url)
      }
    })

    page.on('requestfailed', (req) => {
      if (!req.url().includes('favicon.ico')) {
        failedRequests.push({
          url: req.url(),
          error: req.failure()?.errorText || 'Unknown failure',
        })
      }
    })

    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
        failedRequests.push({
          url: res.url(),
          status: res.status(),
        })
      }
    })

    // 3. Step 1: Open /register and wait for client-side hydration
    const response = await page.goto('/register', { waitUntil: 'networkidle' })
    expect(response, 'Expected navigation response').not.toBeNull()
    expect(response!.status()).toBe(200)

    // Verify registration heading is visible
    const mainHeading = page.locator('h1', { hasText: 'Form Pendaftaran' })
    await expect(mainHeading).toBeVisible({ timeout: 10000 })

    // 4. Step 2: Fill in valid primary registrant information
    const nameInput = page.getByPlaceholder('Masukkan nama lengkap')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill(participantName)
    await expect(nameInput).toHaveValue(participantName)

    const phoneInput = page.getByPlaceholder('Contoh: 081234567890')
    await expect(phoneInput).toBeVisible({ timeout: 5000 })
    await phoneInput.fill(rawWhatsApp)
    await expect(phoneInput).toHaveValue(rawWhatsApp)

    // Select church branch (church status defaults to BERGEREJA)
    const branchSelect = page.locator('select').filter({
      has: page.locator('option', { hasText: 'Pilih gereja / cabang' }),
    })
    await expect(branchSelect).toBeVisible({ timeout: 5000 })
    await branchSelect.selectOption(selectedBranch)

    // Confirm WA opt-in consent checkbox is checked
    const consentCheckbox = page.locator('#optin-0')
    await expect(consentCheckbox).toBeChecked()

    // Ensure inputs retain values and were not cleared by late React hydration
    if ((await nameInput.inputValue()) !== participantName) {
      await nameInput.fill(participantName)
      await expect(nameInput).toHaveValue(participantName)
    }
    if ((await phoneInput.inputValue()) !== rawWhatsApp) {
      await phoneInput.fill(rawWhatsApp)
      await expect(phoneInput).toHaveValue(rawWhatsApp)
    }

    // 5. Step 3: Register expected participant name in tracker before async submission
    cleanupTracker.trackExpectedParticipantName(participantName)

    const submitButton = page.getByRole('button', { name: /Kirim Pendaftaran/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // 6. Step 4: Verify the actual success state shown by the application
    const successHeading = page.getByRole('heading', { name: /Pendaftaran Berhasil!/i })
    await expect(successHeading).toBeVisible({ timeout: 15000 })

    // Verify confirmation message
    const successCount = page.locator('strong', { hasText: '1 orang' })
    await expect(successCount).toBeVisible({ timeout: 5000 })

    // Verify participant name in TicketCard
    const ticketCardName = page.locator('h3', { hasText: participantName })
    await expect(ticketCardName).toBeVisible({ timeout: 5000 })

    // 7. Step 5 & 6: Verify participant persistence and QR token in local PostgreSQL jkishema_e2e
    const participant = await db.participant.findFirst({
      where: { full_name: participantName },
    })
    expect(participant, 'Participant record must be persisted in local database').not.toBeNull()

    // Register participant in cleanupTracker so fixture teardown tracks and deletes it
    cleanupTracker.participantIds.add(participant!.id)

    expect(participant!.qr_token, 'Participant must have a valid QR token').toBeTruthy()
    expect(participant!.qr_token.length).toBeGreaterThan(10)
    expect(participant!.whatsapp_number).toBe(expectedNormalizedWhatsApp)
    expect(participant!.church_status).toBe('BERGEREJA')
    expect(participant!.church_branch).toBe(selectedBranch)
    expect(participant!.is_child).toBe(false)
    expect(participant!.is_wa_opt_in).toBe(true)
    expect(participant!.status).toBe('REGISTERED')
    expect(participant!.registration_type).toBe('ONLINE')

    // 8. Step 7: Verify associated WhatsAppDelivery record and mock dispatch outcome
    const delivery = await db.whatsAppDelivery.findFirst({
      where: { participant_id: participant!.id },
    })
    expect(delivery, 'WhatsAppDelivery record must be created for the participant').not.toBeNull()

    // Register delivery in cleanupTracker
    cleanupTracker.deliveryIds.add(delivery!.id)

    expect(delivery!.participant_name).toBe(participantName)
    expect(delivery!.recipient_phone).toBe(expectedNormalizedWhatsApp)
    expect(delivery!.qr_token_snapshot).toBe(participant!.qr_token)

    // Under default WHATSAPP_MOCK_MODE=true, mock mode transitions PENDING -> NOT_SENT without fake attempts
    expect(delivery!.status).toBe('NOT_SENT')
    expect(participant!.wa_delivery_status).toBe('NOT_SENT')
    expect(delivery!.total_attempts).toBe(0)

    // 9. Step 8: Verify no real Meta API request was made
    expect(metaRequests, 'Zero outbound Meta Graph API requests').toEqual([])

    // 10. Verify zero browser errors
    expect(pageErrors, 'Zero uncaught page errors').toEqual([])
    expect(consoleErrors, 'Zero browser console errors').toEqual([])
    expect(failedRequests, 'Zero failed HTTP requests').toEqual([])
  })

  test('successfully registers a group (primary + 2 additional participants) through the browser UI and persists records in local DB', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    // 1. Generate unique, traceable test data matching runId security invariant
    const d1 = Math.floor(10000000 + Math.random() * 90000000).toString()
    const d2 = Math.floor(10000000 + Math.random() * 90000000).toString()

    const primaryName = `E2E Group Primary [${runId}]`
    const rawPrimaryWA = `0812${d1}`
    const expectedPrimaryWA = `62812${d1}`

    const member2Name = `E2E Group Member2 [${runId}]`
    const rawMember2WA = `0813${d2}`
    const expectedMember2WA = `62813${d2}`

    const child3Name = `E2E Group Child3 [${runId}]`
    // Child inherits primary WhatsApp number per application behavior

    const selectedBranch = 'JKI Shema Sunter, Jakarta'

    // 2. Setup monitors
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const failedRequests: Array<{ url: string; status?: number; error?: string }> = []
    const metaRequests: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
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
    page.on('requestfailed', (req) => {
      if (!req.url().includes('favicon.ico')) {
        failedRequests.push({ url: req.url(), error: req.failure()?.errorText || 'Unknown failure' })
      }
    })
    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
        failedRequests.push({ url: res.url(), status: res.status() })
      }
    })

    // 3. Step 1: Open /register and wait for client-side hydration
    const response = await page.goto('/register', { waitUntil: 'networkidle' })
    expect(response).not.toBeNull()
    expect(response!.status()).toBe(200)

    const mainHeading = page.locator('h1', { hasText: 'Form Pendaftaran' })
    await expect(mainHeading).toBeVisible({ timeout: 10000 })

    // Verify initial submit button participant counter
    const submitButton = page.getByRole('button', { name: /Kirim Pendaftaran/i })
    await expect(submitButton).toContainText('1 Peserta')

    // 4. Fill Primary Registrant (Participant #1)
    const primaryCard = page.locator('form > div').filter({
      has: page.locator('span', { hasText: '👤 Pendaftar Utama' }),
    })
    await expect(primaryCard).toBeVisible()

    const nameInput1 = primaryCard.getByPlaceholder('Masukkan nama lengkap')
    await nameInput1.fill(primaryName)

    const phoneInput1 = primaryCard.getByPlaceholder('Contoh: 081234567890')
    await phoneInput1.fill(rawPrimaryWA)

    const branchSelect1 = primaryCard.locator('select').filter({
      has: page.locator('option', { hasText: 'Pilih gereja / cabang' }),
    })
    await branchSelect1.selectOption(selectedBranch)

    // 5. Add Participant #2 (Adult Additional Member)
    const addBtn = page.getByRole('button', { name: /Tambah Peserta Lain/i })
    await expect(addBtn).toBeVisible()
    await addBtn.click()

    await expect(submitButton).toContainText('2 Peserta')

    const member2Card = page.locator('form > div').filter({
      has: page.locator('span', { hasText: '👥 Peserta Tambahan #2' }),
    })
    await expect(member2Card).toBeVisible({ timeout: 5000 })

    const nameInput2 = member2Card.getByPlaceholder('Masukkan nama lengkap')
    await nameInput2.fill(member2Name)

    const phoneInput2 = member2Card.getByPlaceholder('Contoh: 081234567890')
    await phoneInput2.fill(rawMember2WA)

    const branchSelect2 = member2Card.locator('select').filter({
      has: page.locator('option', { hasText: 'Pilih gereja / cabang' }),
    })
    await branchSelect2.selectOption('JKI Shema Pontianak')

    // 6. Add Participant #3 (Child Additional Member)
    await addBtn.click()
    await expect(submitButton).toContainText('3 Peserta')

    const child3Card = page.locator('form > div').filter({
      has: page.locator('span', { hasText: '👥 Peserta Tambahan #3' }),
    })
    await expect(child3Card).toBeVisible({ timeout: 5000 })

    // Check Child checkbox
    const childCheckbox = child3Card.locator('input[type="checkbox"][id^="child-"]')
    await childCheckbox.check()
    await expect(childCheckbox).toBeChecked()

    // Confirm WhatsApp phone input is hidden for child (WA disamakan dengan Pendaftar Utama)
    const phoneInput3 = child3Card.getByPlaceholder('Contoh: 081234567890')
    await expect(phoneInput3).toHaveCount(0)

    const nameInput3 = child3Card.getByPlaceholder('Masukkan nama lengkap')
    await nameInput3.fill(child3Name)

    const branchSelect3 = child3Card.locator('select').filter({
      has: page.locator('option', { hasText: 'Pilih gereja / cabang' }),
    })
    await branchSelect3.selectOption(selectedBranch)

    // React hydration guard: verify values retained
    if ((await nameInput1.inputValue()) !== primaryName) await nameInput1.fill(primaryName)
    if ((await phoneInput1.inputValue()) !== rawPrimaryWA) await phoneInput1.fill(rawPrimaryWA)
    if ((await nameInput2.inputValue()) !== member2Name) await nameInput2.fill(member2Name)
    if ((await phoneInput2.inputValue()) !== rawMember2WA) await phoneInput2.fill(rawMember2WA)
    if ((await nameInput3.inputValue()) !== child3Name) await nameInput3.fill(child3Name)

    // 7. CRITICAL CLEANUP PRE-REGISTRATION: Register all 3 expected participant names before submission!
    cleanupTracker.trackExpectedParticipantName(primaryName)
    cleanupTracker.trackExpectedParticipantName(member2Name)
    cleanupTracker.trackExpectedParticipantName(child3Name)

    // Submit group registration
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // 8. Verify confirmation screen
    const successHeading = page.getByRole('heading', { name: /Pendaftaran Berhasil!/i })
    await expect(successHeading).toBeVisible({ timeout: 15000 })

    const successCount = page.locator('strong', { hasText: '3 orang' })
    await expect(successCount).toBeVisible({ timeout: 5000 })

    // Verify all 3 TicketCards are present
    const card1 = page.locator('h3', { hasText: primaryName })
    const card2 = page.locator('h3', { hasText: member2Name })
    const card3 = page.locator('h3', { hasText: child3Name })
    await expect(card1).toBeVisible({ timeout: 5000 })
    await expect(card2).toBeVisible({ timeout: 5000 })
    await expect(card3).toBeVisible({ timeout: 5000 })

    // Verify distinct QR tokens across all 3 cards
    const tokenElements = page.locator('[data-testid="ticket-code-text"]')
    await expect(tokenElements).toHaveCount(3)
    const tokens = await tokenElements.allTextContents()
    const tokenSet = new Set(tokens)
    expect(tokenSet.size, 'All 3 ticket tokens must be distinct').toBe(3)

    // Verify all 3 QR images load successfully
    const qrImages = page.locator('[data-testid="qr-image"]')
    await expect(qrImages).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      const img = qrImages.nth(i)
      await expect(img).toBeVisible({ timeout: 10000 })
      const nw = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
      const nh = await img.evaluate((el: HTMLImageElement) => el.naturalHeight)
      expect(nw).toBeGreaterThan(0)
      expect(nh).toBeGreaterThan(0)
    }

    // Verify QR image response via API returns valid 1024x768 PNG
    const sampleToken = tokens[0]
    const qrResponse = await page.request.get(`/api/ticket/${sampleToken}/image`)
    expect(qrResponse.status()).toBe(200)
    expect(qrResponse.headers()['content-type']).toContain('image/png')
    const imgBuf = await qrResponse.body()
    const meta = await sharp(imgBuf).metadata()
    expect(meta.width).toBe(1024)
    expect(meta.height).toBe(768)
    expect(meta.format).toBe('png')

    // 9. Database verification
    const participants = await db.participant.findMany({
      where: { full_name: { in: [primaryName, member2Name, child3Name] } },
    })
    expect(participants).toHaveLength(3)

    const dbPrimary = participants.find((p) => p.full_name === primaryName)!
    const dbMember2 = participants.find((p) => p.full_name === member2Name)!
    const dbChild3 = participants.find((p) => p.full_name === child3Name)!
    expect(dbPrimary).toBeDefined()
    expect(dbMember2).toBeDefined()
    expect(dbChild3).toBeDefined()

    // Register all participant IDs into cleanupTracker
    for (const p of participants) {
      cleanupTracker.participantIds.add(p.id)
      expect(p.status).toBe('REGISTERED')
      expect(p.registration_type).toBe('ONLINE')
      expect(p.wa_delivery_status).toBe('NOT_SENT')
      expect(tokenSet.has(p.qr_token)).toBe(true)
    }

    // Verify primary participant attributes
    expect(dbPrimary.is_child).toBe(false)
    expect(dbPrimary.whatsapp_number).toBe(expectedPrimaryWA)
    expect(dbPrimary.church_branch).toBe(selectedBranch)

    // Verify member 2 attributes
    expect(dbMember2.is_child).toBe(false)
    expect(dbMember2.whatsapp_number).toBe(expectedMember2WA)
    expect(dbMember2.church_branch).toBe('JKI Shema Pontianak')

    // Verify child 3 attributes (inherits primary WhatsApp number!)
    expect(dbChild3.is_child).toBe(true)
    expect(dbChild3.whatsapp_number).toBe(expectedPrimaryWA)

    // Verify WhatsAppDelivery records for all 3 participants
    const deliveries = await db.whatsAppDelivery.findMany({
      where: { participant_id: { in: participants.map((p) => p.id) } },
    })
    expect(deliveries).toHaveLength(3)

    for (const d of deliveries) {
      cleanupTracker.deliveryIds.add(d.id)
      expect(d.status).toBe('NOT_SENT')
      expect(d.total_attempts).toBe(0)
      const matchingP = participants.find((p) => p.id === d.participant_id)!
      expect(d.participant_name).toBe(matchingP.full_name)
      expect(d.qr_token_snapshot).toBe(matchingP.qr_token)
      expect(d.recipient_phone).toBe(matchingP.whatsapp_number)
    }

    // Network & error checks
    expect(metaRequests, 'Zero outbound Meta Graph API requests').toEqual([])
    expect(pageErrors, 'Zero uncaught page errors').toEqual([])
    expect(consoleErrors, 'Zero browser console errors').toEqual([])
    expect(failedRequests, 'Zero failed HTTP requests').toEqual([])
  })
})
