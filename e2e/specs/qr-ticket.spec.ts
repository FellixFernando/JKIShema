import { test, expect } from '../fixtures/test-context'
import { db } from '@/lib/db'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { decodeQrFromPngBuffer } from '../helpers/qr-decoder'

test.describe('E2E QR Ticket Generation, Rendering, and Download', () => {
  test('successfully generates, renders, and downloads framed QR ticket with exact token match and dimensions', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    // 1. Generate unique test data matching runId security invariant
    const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000).toString()
    const participantName = `E2E QR Ticket [${runId}]`
    const rawWhatsApp = `0812${uniqueDigits}`
    const expectedNormalizedWhatsApp = `62812${uniqueDigits}`
    const selectedBranch = 'JKI Shema Sunter, Jakarta'

    // 2. Setup error, request, and response monitoring
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

    // Prepare to capture the QR image HTTP response when the browser requests it
    const qrImageResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/ticket/') && res.url().endsWith('/image'),
      { timeout: 20000 }
    )

    // 3. Navigate to /register and wait for client-side hydration
    const navResponse = await page.goto('/register', { waitUntil: 'networkidle' })
    expect(navResponse, 'Expected navigation response').not.toBeNull()
    expect(navResponse!.status()).toBe(200)

    const mainHeading = page.locator('h1', { hasText: 'Form Pendaftaran' })
    await expect(mainHeading).toBeVisible({ timeout: 10000 })

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

    // Ensure inputs retain values before submitting (guards against late React hydration resets)
    if ((await nameInput.inputValue()) !== participantName) {
      await nameInput.fill(participantName)
      await expect(nameInput).toHaveValue(participantName)
    }
    if ((await phoneInput.inputValue()) !== rawWhatsApp) {
      await phoneInput.fill(rawWhatsApp)
      await expect(phoneInput).toHaveValue(rawWhatsApp)
    }

    // Register expected participant name in tracker before async submission
    cleanupTracker.trackExpectedParticipantName(participantName)

    // Submit the registration
    const submitButton = page.getByRole('button', { name: /Kirim Pendaftaran/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()

    // 4. Verify registration succeeds and TicketCard appears
    const successHeading = page.getByRole('heading', { name: /Pendaftaran Berhasil!/i })
    await expect(successHeading).toBeVisible({ timeout: 15000 })

    const ticketCardName = page.locator('h3', { hasText: participantName })
    await expect(ticketCardName).toBeVisible({ timeout: 5000 })

    // 5. Query local PostgreSQL database to retrieve the persisted participant & delivery
    const participant = await db.participant.findFirst({
      where: { full_name: participantName },
    })
    expect(participant, 'Participant record must be persisted in database').not.toBeNull()
    cleanupTracker.participantIds.add(participant!.id)

    const delivery = await db.whatsAppDelivery.findFirst({
      where: { participant_id: participant!.id },
    })
    expect(delivery, 'WhatsAppDelivery record must exist').not.toBeNull()
    cleanupTracker.deliveryIds.add(delivery!.id)

    const expectedToken = participant!.qr_token
    expect(expectedToken, 'Participant must have non-empty QR token').toBeTruthy()

    // Verify readable ticket code displayed in TicketCard matches the database token
    const ticketCodeElement = page.locator('[data-testid="ticket-code-text"]')
    await expect(ticketCodeElement).toBeVisible({ timeout: 5000 })
    await expect(ticketCodeElement).toHaveText(expectedToken)

    // 6. Verify QR image HTTP request returns status 200 with Content-Type image/png
    const qrImageResponse = await qrImageResponsePromise
    expect(qrImageResponse.status(), 'QR ticket image request must return 200').toBe(200)

    const contentType = qrImageResponse.headers()['content-type'] || ''
    expect(contentType, 'Content-Type must be image/png').toContain('image/png')

    // 7. Verify rendered image dimensions are exactly 1024 x 768
    const imageBuffer = await qrImageResponse.body()
    const imageMetadata = await sharp(imageBuffer).metadata()
    expect(imageMetadata.width, 'Rendered image width must be 1024px').toBe(1024)
    expect(imageMetadata.height, 'Rendered image height must be 768px').toBe(768)
    expect(imageMetadata.format, 'Rendered image format must be png').toBe('png')

    // 8. Verify the displayed QR image element loads successfully in browser
    const qrImage = page.locator('[data-testid="qr-image"]')
    await expect(qrImage).toBeVisible({ timeout: 10000 })

    const naturalWidth = await qrImage.evaluate((img: HTMLImageElement) => img.naturalWidth)
    const naturalHeight = await qrImage.evaluate((img: HTMLImageElement) => img.naturalHeight)
    expect(naturalWidth, 'Image naturalWidth must be greater than 0').toBeGreaterThan(0)
    expect(naturalHeight, 'Image naturalHeight must be greater than 0').toBeGreaterThan(0)

    // Verify loading spinner is hidden and no error state is displayed
    await expect(page.locator('[data-testid="qr-loading"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="qr-error"]')).toHaveCount(0)

    // 9. Verify the download button downloads a valid PNG file with expected filename
    const downloadButton = page.locator('[data-testid="download-qr-btn"]')
    await expect(downloadButton).toBeVisible({ timeout: 5000 })

    const downloadPromise = page.waitForEvent('download')
    await downloadButton.click()
    const download = await downloadPromise

    const expectedFilename = `tiket-jki-shema-${expectedToken}.png`
    expect(download.suggestedFilename()).toBe(expectedFilename)

    // Read the downloaded file stream into an in-memory buffer
    const downloadStream = await download.createReadStream()
    expect(downloadStream, 'Download stream must be available').not.toBeNull()

    const chunks: Buffer[] = []
    for await (const chunk of downloadStream!) {
      chunks.push(Buffer.from(chunk))
    }
    const downloadedBuffer = Buffer.concat(chunks)
    expect(downloadedBuffer.length, 'Downloaded buffer must not be empty').toBeGreaterThan(1000)

    // 10. Verify downloaded PNG dimensions remain exactly 1024 x 768
    const downloadedMetadata = await sharp(downloadedBuffer).metadata()
    expect(downloadedMetadata.width, 'Downloaded image width must be 1024px').toBe(1024)
    expect(downloadedMetadata.height, 'Downloaded image height must be 768px').toBe(768)
    expect(downloadedMetadata.format, 'Downloaded image format must be png').toBe('png')

    // 11. Decode QR code from the downloaded image and verify exact match with participant token
    const decodedToken = await decodeQrFromPngBuffer(downloadedBuffer)
    expect(decodedToken, 'Decoded QR token must match participant QR token exactly').toBe(expectedToken)

    // 12. Confirm the QR token remains unchanged throughout the entire flow
    expect(decodedToken).toBe(participant!.qr_token)
    expect(decodedToken).toBe(delivery!.qr_token_snapshot)

    // 13. Security checks: Verify zero permanent runtime files written to disk
    const ticketDir = path.join(process.cwd(), 'public', 'images', 'ticket')
    const filesInTicketDir = fs.readdirSync(ticketDir).filter((f) => !f.startsWith('.'))
    expect(
      filesInTicketDir,
      'No runtime image files should be written to public/images/ticket; only static template'
    ).toEqual(['christmas-ticket-frame.png'])

    // Zero real Meta WhatsApp requests
    expect(metaRequests, 'Zero outbound Meta Graph API requests').toEqual([])

    // Zero browser console or page errors
    expect(pageErrors, 'Zero uncaught page errors').toEqual([])
    expect(consoleErrors, 'Zero browser console errors').toEqual([])
    expect(failedRequests, 'Zero failed HTTP requests').toEqual([])
  })
})
