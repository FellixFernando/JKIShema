import { test, expect } from '../fixtures/test-context'

test.describe('E2E Registration Smoke Test', () => {
  test('successfully loads the registration page with form elements and zero critical errors', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    // 1. Capture browser console errors, page errors, and network traffic
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
      // Detect and flag any accidental outbound network call to Meta / Facebook Graph API
      if (url.includes('graph.facebook.com') || url.includes('facebook.com')) {
        metaRequests.push(url)
      }
    })

    page.on('requestfailed', (req) => {
      // Exclude harmless browser favicon misses if any
      if (!req.url().includes('favicon.ico')) {
        failedRequests.push({
          url: req.url(),
          error: req.failure()?.errorText || 'Unknown request failure',
        })
      }
    })

    page.on('response', (res) => {
      // Detect unexpected 4xx or 5xx application responses
      if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
        failedRequests.push({
          url: res.url(),
          status: res.status(),
        })
      }
    })

    // 2. Navigate to the actual registration page (/register)
    const response = await page.goto('/register', { waitUntil: 'domcontentloaded' })

    // 3. Verify page responds with HTTP 200
    expect(response, 'Expected navigation response').not.toBeNull()
    expect(response!.status()).toBe(200)

    // 4. Verify recognizable registration heading and form elements
    // Subheading uppercase badge
    const subHeading = page.locator('text=JKI SHEMA CHRISTMAS CONCERT')
    await expect(subHeading.first()).toBeVisible({ timeout: 10000 })

    // Main title
    const mainHeading = page.locator('h1', { hasText: 'Form Pendaftaran' })
    await expect(mainHeading).toBeVisible({ timeout: 10000 })

    // Section header for primary participant
    const primarySection = page.locator('text=👤 Pendaftar Utama')
    await expect(primarySection).toBeVisible({ timeout: 5000 })

    // Full name input
    const nameInput = page.locator('input[placeholder="Masukkan nama lengkap"]')
    await expect(nameInput).toBeVisible({ timeout: 5000 })

    // Event poster image
    const poster = page.locator('img[alt="JKI Shema Christmas Concert"]')
    await expect(poster).toBeVisible({ timeout: 5000 })

    // Submit button
    const submitButton = page.locator('button[type="submit"]')
    await expect(submitButton).toBeVisible({ timeout: 5000 })

    // 5. Verify zero real Meta WhatsApp requests
    expect(metaRequests, 'Outbound Meta Graph API requests must never be sent in E2E').toHaveLength(0)

    // 6. Verify zero uncaught page runtime exceptions
    expect(pageErrors, 'Uncaught page exceptions during registration page load').toEqual([])

    // 7. Verify zero failed network requests
    expect(failedRequests, 'Failed network requests during registration page load').toEqual([])

    // 8. Verify zero console error messages
    expect(consoleErrors, 'Console error messages logged during registration page load').toEqual([])
  })
})
