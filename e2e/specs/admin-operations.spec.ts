import { test, expect } from '../fixtures/test-context'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

/**
 * Creates an isolated E2E admin user with bcrypt-hashed credentials
 * and registers it into cleanupTracker for unified deterministic teardown.
 */
async function createAdminUser(runId: string, cleanupTracker?: any) {
  const sanitizedRunId = runId.replace(/[^a-zA-Z0-9_]/g, '_')
  const username = `admin_${sanitizedRunId}_${Date.now()}`
  const password = `AdminSecret_${runId}_123!`
  const passwordHash = await bcrypt.hash(password, 10)

  const user = await db.user.create({
    data: {
      username,
      password_hash: passwordHash,
      role: 'ADMIN',
    },
  })
  if (cleanupTracker?.userIds) {
    cleanupTracker.userIds.add(user.id)
  }
  return { user, username, password }
}

/**
 * Helper to perform browser login via the actual NextAuth CredentialsProvider.
 */
async function loginAsAdmin(page: any, username: string, password: string) {
  await page.goto('/admin/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="text"]', username)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/admin', { waitUntil: 'networkidle' })
  await expect(page.locator('header')).toContainText('JKI SHEMA')
  await expect(page.locator('header')).toContainText('Admin Portal')
}

test.describe.serial('E2E Admin Operations Suite', () => {
  // ---------------------------------------------------------------------------
  // Scenario A — Authentication Guard & Login Lifecycle
  // ---------------------------------------------------------------------------
  test('Scenario A: verifies authentication guard, invalid login handling, valid login, and logout', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    // 1. Direct navigation without authentication redirects to /admin/login
    await page.goto('/admin', { waitUntil: 'networkidle' })
    await page.waitForURL((url: URL) => url.pathname.includes('/admin/login'), { timeout: 10000 })
    expect(page.url()).toContain('/admin/login')

    // 2. Submit invalid credentials -> error alert
    await page.fill('input[type="text"]', 'unregistered_admin_user')
    await page.fill('input[type="password"]', 'incorrect_password_123')
    await page.click('button[type="submit"]')

    const errorAlert = page.locator('text=Username atau Password salah.')
    await expect(errorAlert).toBeVisible({ timeout: 10000 })

    // 3. Create isolated admin user and log in via browser
    const { username, password } = await createAdminUser(runId, cleanupTracker)
    await page.fill('input[type="text"]', username)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')

    // 4. Verify successful redirection and dashboard rendering
    await page.waitForURL('/admin', { waitUntil: 'networkidle' })
    await expect(page.locator('header')).toContainText('JKI SHEMA')
    await expect(page.locator('header')).toContainText('Admin Portal')

    // 5. Test logout -> session cleared
    const logoutBtn = page.getByRole('button', { name: 'Logout' })
    await expect(logoutBtn).toBeVisible()
    await logoutBtn.click()

    // SignOut redirects away from protected /admin (either to /admin/login or home)
    await page.waitForURL((url: URL) => !url.pathname.endsWith('/admin'), { timeout: 10000 })

    // Verify navigating back to /admin without session is blocked
    await page.goto('/admin', { waitUntil: 'networkidle' })
    await page.waitForURL((url: URL) => url.pathname.includes('/admin/login'), { timeout: 10000 })
    expect(page.url()).toContain('/admin/login')
  })

  // ---------------------------------------------------------------------------
  // Scenario B — WhatsApp KPI Telemetry & Filtering Matrix
  // ---------------------------------------------------------------------------
  test('Scenario B: verifies WhatsApp KPI telemetry cards and delivery status filters', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    const now = new Date()

    // 1. Participant 1: DELIVERED
    const qr1 = crypto.randomUUID()
    const pDelivered = await db.participant.create({
      data: {
        full_name: `E2E Delivered [${runId}]`,
        whatsapp_number: `62812${Math.floor(10000000 + Math.random() * 90000000)}`,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        is_wa_opt_in: true,
        qr_token: qr1,
        status: 'REGISTERED',
        registration_type: 'ONLINE',
        wa_delivery_status: 'DELIVERED',
        wa_message_id: `wamid.mock_${runId}_del`,
        wa_sent_at: new Date(now.getTime() - 20000),
      },
    })
    cleanupTracker.participantIds.add(pDelivered.id)

    const dDelivered = await db.whatsAppDelivery.create({
      data: {
        participant_id: pDelivered.id,
        participant_name: pDelivered.full_name,
        qr_token_snapshot: qr1,
        recipient_phone: pDelivered.whatsapp_number,
        status: 'DELIVERED',
        total_attempts: 1,
        sent_at: new Date(now.getTime() - 20000),
        delivered_at: new Date(now.getTime() - 10000),
      },
    })
    cleanupTracker.deliveryIds.add(dDelivered.id)

    const attDelivered = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: dDelivered.id,
        attempt_number: 1,
        status: 'SUCCESS',
        meta_message_id: `wamid.mock_${runId}_del`,
      },
    })
    cleanupTracker.attemptIds.add(attDelivered.id)

    // 2. Participant 2: FAILED
    const qr2 = crypto.randomUUID()
    const pFailed = await db.participant.create({
      data: {
        full_name: `E2E Failed [${runId}]`,
        whatsapp_number: `62812${Math.floor(10000000 + Math.random() * 90000000)}`,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        is_wa_opt_in: true,
        qr_token: qr2,
        status: 'REGISTERED',
        registration_type: 'ONLINE',
        wa_delivery_status: 'FAILED',
        wa_error_code: 'SIMULATED_FAILURE',
        wa_error_message: 'Simulated failure for E2E testing',
      },
    })
    cleanupTracker.participantIds.add(pFailed.id)

    const dFailed = await db.whatsAppDelivery.create({
      data: {
        participant_id: pFailed.id,
        participant_name: pFailed.full_name,
        qr_token_snapshot: qr2,
        recipient_phone: pFailed.whatsapp_number,
        status: 'FAILED',
        total_attempts: 1,
        last_error_code: 'SIMULATED_FAILURE',
        last_error_message: 'Simulated failure for E2E testing',
        failed_at: new Date(now.getTime() - 15000),
      },
    })
    cleanupTracker.deliveryIds.add(dFailed.id)

    const attFailed = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: dFailed.id,
        attempt_number: 1,
        status: 'FAILED',
        error_code: 'SIMULATED_FAILURE',
        error_message: 'Simulated failure for E2E testing',
        meta_message_id: `wamid.mock_${runId}_fail`,
      },
    })
    cleanupTracker.attemptIds.add(attFailed.id)

    // 3. Participant 3: READ
    const qr3 = crypto.randomUUID()
    const pRead = await db.participant.create({
      data: {
        full_name: `E2E Read [${runId}]`,
        whatsapp_number: `62812${Math.floor(10000000 + Math.random() * 90000000)}`,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        is_wa_opt_in: true,
        qr_token: qr3,
        status: 'CHECKED_IN',
        registration_type: 'ONLINE',
        checked_in_at: now,
        wa_delivery_status: 'READ',
        wa_message_id: `wamid.mock_${runId}_read`,
        wa_sent_at: new Date(now.getTime() - 30000),
      },
    })
    cleanupTracker.participantIds.add(pRead.id)

    const dRead = await db.whatsAppDelivery.create({
      data: {
        participant_id: pRead.id,
        participant_name: pRead.full_name,
        qr_token_snapshot: qr3,
        recipient_phone: pRead.whatsapp_number,
        status: 'READ',
        total_attempts: 1,
        sent_at: new Date(now.getTime() - 30000),
        delivered_at: new Date(now.getTime() - 20000),
        read_at: new Date(now.getTime() - 10000),
      },
    })
    cleanupTracker.deliveryIds.add(dRead.id)

    const attRead = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: dRead.id,
        attempt_number: 1,
        status: 'SUCCESS',
        meta_message_id: `wamid.mock_${runId}_read`,
      },
    })
    cleanupTracker.attemptIds.add(attRead.id)

    // 4. Participant 4: NO_DELIVERY (Cancelled on-site without WhatsApp delivery)
    const pNoDelivery = await db.participant.create({
      data: {
        full_name: `E2E NoDelivery [${runId}]`,
        whatsapp_number: `62812${Math.floor(10000000 + Math.random() * 90000000)}`,
        church_status: 'TIDAK_BERGEREJA',
        is_child: false,
        is_wa_opt_in: false,
        qr_token: crypto.randomUUID(),
        status: 'CANCELLED',
        registration_type: 'ON_SITE',
      },
    })
    cleanupTracker.participantIds.add(pNoDelivery.id)

    // 5. Participant 5: CANCELLED (WhatsApp Delivery explicitly CANCELLED)
    const qr5 = crypto.randomUUID()
    const pCancelledWa = await db.participant.create({
      data: {
        full_name: `E2E CancelledWA [${runId}]`,
        whatsapp_number: `62812${Math.floor(10000000 + Math.random() * 90000000)}`,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        is_wa_opt_in: true,
        qr_token: qr5,
        status: 'CANCELLED',
        registration_type: 'ONLINE',
        wa_delivery_status: 'CANCELLED',
      },
    })
    cleanupTracker.participantIds.add(pCancelledWa.id)

    const dCancelledWa = await db.whatsAppDelivery.create({
      data: {
        participant_id: pCancelledWa.id,
        participant_name: pCancelledWa.full_name,
        qr_token_snapshot: qr5,
        recipient_phone: pCancelledWa.whatsapp_number,
        status: 'CANCELLED',
        total_attempts: 0,
      },
    })
    cleanupTracker.deliveryIds.add(dCancelledWa.id)

    // 6. Authenticate and open dashboard
    const { username, password } = await createAdminUser(runId, cleanupTracker)
    await loginAsAdmin(page, username, password)

    // 7. Verify WhatsApp Monitoring section expands and collapses
    const toggleWaBtn = page.locator('button', { hasText: /Statistik WA/i })
    await expect(toggleWaBtn).toBeVisible()
    await expect(toggleWaBtn).toContainText('Tampilkan Statistik WA')

    // Click to expand
    await toggleWaBtn.click()
    await expect(toggleWaBtn).toContainText('Sembunyikan Statistik WA')

    // Verify WhatsApp KPI cards are rendered with non-negative counts
    const deliveredCard = page.getByText('Diterima', { exact: true }).locator('..').locator('p.text-xl')
    await expect(deliveredCard).toBeVisible()
    const deliveredCount = Number(await deliveredCard.textContent())
    expect(deliveredCount).toBeGreaterThanOrEqual(1)

    const failedCard = page.getByText('Gagal', { exact: true }).locator('..').locator('p.text-xl')
    await expect(failedCard).toBeVisible()
    const failedCount = Number(await failedCard.textContent())
    expect(failedCount).toBeGreaterThanOrEqual(1)

    // Click to collapse
    await toggleWaBtn.click()
    await expect(toggleWaBtn).toContainText('Tampilkan Statistik WA')

    // 8. Verify WhatsApp Status Filter using semantic accessible label
    const waStatusSelect = page.getByLabel('Filter Status WhatsApp')
    await expect(waStatusSelect).toBeVisible()

    // 8a. Filter: FAILED
    await waStatusSelect.selectOption('FAILED')
    await expect(page.locator('tbody')).toContainText(pFailed.full_name)
    await expect(page.locator('tbody')).not.toContainText(pDelivered.full_name)
    await expect(page.locator('tbody')).not.toContainText(pCancelledWa.full_name)
    await expect(page.locator('tbody')).not.toContainText(pNoDelivery.full_name)

    // 8b. Filter: DELIVERED
    await waStatusSelect.selectOption('DELIVERED')
    await expect(page.locator('tbody')).toContainText(pDelivered.full_name)
    await expect(page.locator('tbody')).not.toContainText(pFailed.full_name)
    await expect(page.locator('tbody')).not.toContainText(pCancelledWa.full_name)
    await expect(page.locator('tbody')).not.toContainText(pNoDelivery.full_name)

    // 8c. Filter: CANCELLED
    await waStatusSelect.selectOption('CANCELLED')
    await expect(page.locator('tbody')).toContainText(pCancelledWa.full_name)
    await expect(page.locator('tbody')).not.toContainText(pDelivered.full_name)
    await expect(page.locator('tbody')).not.toContainText(pFailed.full_name)
    await expect(page.locator('tbody')).not.toContainText(pNoDelivery.full_name)

    // 8d. Filter: NO_DELIVERY
    await waStatusSelect.selectOption('NO_DELIVERY')
    await expect(page.locator('tbody')).toContainText(pNoDelivery.full_name)
    await expect(page.locator('tbody')).not.toContainText(pDelivered.full_name)
    await expect(page.locator('tbody')).not.toContainText(pFailed.full_name)
    await expect(page.locator('tbody')).not.toContainText(pCancelledWa.full_name)

    // 9. Reset filter to ALL and test dynamic search
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/admin/participants') && r.status() === 200),
      waStatusSelect.selectOption('ALL'),
    ])
    const searchInput = page.locator('input[placeholder*="Cari Nama"]')
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/admin/participants') && r.status() === 200),
      searchInput.fill(pRead.full_name),
    ])

    await expect(page.locator('tbody')).toContainText(pRead.full_name)
    await expect(page.locator('tbody')).not.toContainText(pDelivered.full_name)
    await expect(page.locator('tbody')).not.toContainText(pFailed.full_name)
    await expect(page.locator('tbody')).not.toContainText(pCancelledWa.full_name)
    await expect(page.locator('tbody')).not.toContainText(pNoDelivery.full_name)
  })

  // ---------------------------------------------------------------------------
  // Scenario C — Delivery Detail Drawer Inspection
  // ---------------------------------------------------------------------------
  test('Scenario C: opens delivery detail drawer and verifies attempt history, error codes, and escape handling', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    const qr = crypto.randomUUID()
    const participant = await db.participant.create({
      data: {
        full_name: `E2E Drawer [${runId}]`,
        whatsapp_number: `62812${Math.floor(10000000 + Math.random() * 90000000)}`,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        is_wa_opt_in: true,
        qr_token: qr,
        status: 'REGISTERED',
        registration_type: 'ONLINE',
        wa_delivery_status: 'FAILED',
        wa_error_code: 'SIMULATED_FAILURE',
        wa_error_message: 'Simulated initial failure',
      },
    })
    cleanupTracker.participantIds.add(participant.id)

    const delivery = await db.whatsAppDelivery.create({
      data: {
        participant_id: participant.id,
        participant_name: participant.full_name,
        qr_token_snapshot: qr,
        recipient_phone: participant.whatsapp_number,
        status: 'FAILED',
        total_attempts: 1,
        last_error_code: 'SIMULATED_FAILURE',
        last_error_message: 'Simulated initial failure',
        failed_at: new Date(),
      },
    })
    cleanupTracker.deliveryIds.add(delivery.id)

    const attempt = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: delivery.id,
        attempt_number: 1,
        status: 'FAILED',
        error_code: 'SIMULATED_FAILURE',
        error_message: 'Simulated initial failure',
        meta_message_id: `wamid.mock_${runId}_drawer_fail`,
      },
    })
    cleanupTracker.attemptIds.add(attempt.id)

    // Authenticate and open dashboard
    const { username, password } = await createAdminUser(runId, cleanupTracker)
    await loginAsAdmin(page, username, password)

    // Filter to this participant via search
    await page.fill('input[placeholder*="Cari Nama"]', participant.full_name)
    const row = page.locator('tbody tr', { hasText: participant.full_name })
    await expect(row).toBeVisible()

    // Click on the WhatsAppDeliveryBadge button to open drawer
    const badgeBtn = row.locator('button[title="Klik untuk inspeksi riwayat WhatsApp"]')
    await expect(badgeBtn).toBeVisible()
    await badgeBtn.click()

    // Drawer should open with title "Inspeksi WhatsApp Tiket"
    const drawer = page.locator('div[role="dialog"][aria-labelledby="drawer-title"]')
    const drawerTitle = drawer.locator('#drawer-title')
    await expect(drawerTitle).toBeVisible({ timeout: 5000 })
    await expect(drawerTitle).toHaveText('Inspeksi WhatsApp Tiket')

    // Verify drawer contents
    await expect(drawer.getByText(participant.whatsapp_number)).toBeVisible()
    await expect(drawer.getByText('Percobaan #1')).toBeVisible()
    await expect(drawer.getByText(/SIMULATED_FAILURE/).first()).toBeVisible()
    await expect(drawer.getByText(/Simulated initial failure/).first()).toBeVisible()
    await expect(drawer.getByText(attempt.meta_message_id!)).toBeVisible()

    // Press Escape to close drawer
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible({ timeout: 5000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario D — Controlled WhatsApp Resend Workflow
  // ---------------------------------------------------------------------------
  test('Scenario D: verifies controlled resend workflow, modal character validation, and database settlement', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    // 1. Seed eligible FAILED participant
    const qrFailed = crypto.randomUUID()
    const pFailed = await db.participant.create({
      data: {
        full_name: `E2E Resend Eligible [${runId}]`,
        whatsapp_number: `62812${Math.floor(10000000 + Math.random() * 90000000)}`,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        is_wa_opt_in: true,
        qr_token: qrFailed,
        status: 'REGISTERED',
        registration_type: 'ONLINE',
        wa_delivery_status: 'FAILED',
        wa_error_code: 'SIMULATED_FAILURE',
        wa_error_message: 'Initial dispatch simulated failure',
      },
    })
    cleanupTracker.participantIds.add(pFailed.id)

    const dFailed = await db.whatsAppDelivery.create({
      data: {
        participant_id: pFailed.id,
        participant_name: pFailed.full_name,
        qr_token_snapshot: qrFailed,
        recipient_phone: pFailed.whatsapp_number,
        status: 'FAILED',
        total_attempts: 1,
        last_error_code: 'SIMULATED_FAILURE',
        last_error_message: 'Initial dispatch simulated failure',
        failed_at: new Date(Date.now() - 30000),
      },
    })
    cleanupTracker.deliveryIds.add(dFailed.id)

    const att1 = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: dFailed.id,
        attempt_number: 1,
        status: 'FAILED',
        error_code: 'SIMULATED_FAILURE',
        error_message: 'Initial dispatch simulated failure',
        meta_message_id: `wamid.mock_${runId}_attempt1`,
        request_started_at: new Date(Date.now() - 31000),
        response_received_at: new Date(Date.now() - 30000),
      },
    })
    cleanupTracker.attemptIds.add(att1.id)

    // 2. Seed ineligible DELIVERED participant (to verify action button suppression)
    const qrDelivered = crypto.randomUUID()
    const pDelivered = await db.participant.create({
      data: {
        full_name: `E2E Resend Ineligible [${runId}]`,
        whatsapp_number: `62812${Math.floor(10000000 + Math.random() * 90000000)}`,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        is_wa_opt_in: true,
        qr_token: qrDelivered,
        status: 'REGISTERED',
        registration_type: 'ONLINE',
        wa_delivery_status: 'DELIVERED',
        wa_message_id: `wamid.mock_${runId}_del_seed`,
      },
    })
    cleanupTracker.participantIds.add(pDelivered.id)

    const dDelivered = await db.whatsAppDelivery.create({
      data: {
        participant_id: pDelivered.id,
        participant_name: pDelivered.full_name,
        qr_token_snapshot: qrDelivered,
        recipient_phone: pDelivered.whatsapp_number,
        status: 'DELIVERED',
        total_attempts: 1,
        sent_at: new Date(Date.now() - 20000),
        delivered_at: new Date(Date.now() - 10000),
      },
    })
    cleanupTracker.deliveryIds.add(dDelivered.id)

    const attDel = await db.whatsAppDeliveryAttempt.create({
      data: {
        delivery_id: dDelivered.id,
        attempt_number: 1,
        status: 'SUCCESS',
        meta_message_id: `wamid.mock_${runId}_del_seed`,
      },
    })
    cleanupTracker.attemptIds.add(attDel.id)

    // 3. Authenticate and open dashboard
    const { username, password } = await createAdminUser(runId, cleanupTracker)
    await loginAsAdmin(page, username, password)

    // 4. Click the gear icon to toggle WhatsApp actions
    const toggleWaActionsBtn = page.locator('button[aria-label*="Opsi WA"]')
    await expect(toggleWaActionsBtn).toBeVisible()
    await toggleWaActionsBtn.click()

    // 5. Verify Resend is available for eligible FAILED participant
    const rowFailed = page.locator('tbody tr', { hasText: pFailed.full_name })
    await expect(rowFailed).toBeVisible()
    const resendBtn = rowFailed.locator('button', { hasText: 'Resend' })
    await expect(resendBtn).toBeVisible()

    // 6. Verify Resend is ABSENT for ineligible DELIVERED participant (Inspect only)
    const rowDelivered = page.locator('tbody tr', { hasText: pDelivered.full_name })
    await expect(rowDelivered).toBeVisible()
    await expect(rowDelivered.locator('button', { hasText: 'Resend' })).toHaveCount(0)
    await expect(rowDelivered.locator('button', { hasText: 'Inspect' })).toBeVisible()

    // 7. Click Resend on FAILED participant -> Modal opens
    await resendBtn.click()
    const resendModal = page.locator('div[role="dialog"][aria-labelledby="resend-modal-title"]')
    const modalTitle = resendModal.locator('#resend-modal-title')
    await expect(modalTitle).toBeVisible({ timeout: 5000 })
    await expect(modalTitle).toHaveText('Kirim Ulang Tiket WhatsApp')

    // Verify quota indicator in modal
    await expect(resendModal.getByText('3x lagi')).toBeVisible()

    // 8. Verify character validation (< 5 chars disables submit)
    const reasonTextarea = resendModal.locator('#resend-reason')
    const confirmBtn = resendModal.locator('button[type="submit"]')

    await expect(confirmBtn).toBeDisabled()
    await reasonTextarea.fill('abc') // 3 chars
    await expect(resendModal.getByText('3 / 5')).toBeVisible()
    await expect(confirmBtn).toBeDisabled()

    // Fill valid reason >= 5 characters
    const validReason = 'Nomor telepon aktif terkonfirmasi via telepon langsung oleh admin'
    await reasonTextarea.fill(validReason)
    await expect(confirmBtn).toBeEnabled()

    // 9. Confirm resend
    await confirmBtn.click()

    // Modal should close and success banner should appear
    await expect(resendModal).not.toBeVisible({ timeout: 10000 })
    const successBanner = page.locator('text=Tiket WhatsApp berhasil dikirim ulang!')
    await expect(successBanner).toBeVisible({ timeout: 10000 })

    // Table badge updates to SENT
    await expect(rowFailed).toContainText('Terkirim')

    // 10. Verify local database persistence and state transitions
    const updatedDelivery = await db.whatsAppDelivery.findUniqueOrThrow({
      where: { id: dFailed.id },
    })
    expect(updatedDelivery.status).toBe('SENT')
    expect(updatedDelivery.total_attempts).toBe(2)
    expect(updatedDelivery.sent_at).not.toBeNull()

    // Discover and register attempt #2 in cleanup tracker
    const newAttempt = await db.whatsAppDeliveryAttempt.findFirstOrThrow({
      where: { delivery_id: dFailed.id, attempt_number: 2 },
    })
    cleanupTracker.attemptIds.add(newAttempt.id)

    expect(newAttempt.status).toBe('SUCCESS')
    expect(newAttempt.resend_reason).toBe(validReason)
    expect(newAttempt.admin_username).toBe(username)
    expect(newAttempt.meta_message_id).toMatch(/^wamid\.mock_/i)

    const updatedParticipant = await db.participant.findUniqueOrThrow({
      where: { id: pFailed.id },
    })
    expect(updatedParticipant.wa_delivery_status).toBe('SENT')
    expect(updatedParticipant.wa_message_id).toBe(newAttempt.meta_message_id)
  })

  // ---------------------------------------------------------------------------
  // Scenario E — Manual Check-In & Cancellation Lifecycle
  // ---------------------------------------------------------------------------
  test('Scenario E: verifies manual check-in and cancellation through confirmation modals', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    // 1. Seed Participant 1 (for Manual Check-in)
    const pCheckIn = await db.participant.create({
      data: {
        full_name: `E2E CheckIn [${runId}]`,
        whatsapp_number: `62812${Math.floor(10000000 + Math.random() * 90000000)}`,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        is_wa_opt_in: true,
        qr_token: crypto.randomUUID(),
        status: 'REGISTERED',
        registration_type: 'ONLINE',
      },
    })
    cleanupTracker.participantIds.add(pCheckIn.id)

    // 2. Seed Participant 2 (for Cancellation)
    const pCancel = await db.participant.create({
      data: {
        full_name: `E2E Cancel [${runId}]`,
        whatsapp_number: `62812${Math.floor(10000000 + Math.random() * 90000000)}`,
        church_status: 'BERGEREJA',
        church_branch: 'JKI Shema Sunter, Jakarta',
        is_child: false,
        is_wa_opt_in: true,
        qr_token: crypto.randomUUID(),
        status: 'REGISTERED',
        registration_type: 'ONLINE',
      },
    })
    cleanupTracker.participantIds.add(pCancel.id)

    // 3. Authenticate and open dashboard
    const { username, password } = await createAdminUser(runId, cleanupTracker)
    await loginAsAdmin(page, username, password)

    // 4. Manual Check-In on Participant 1
    const rowCheckIn = page.locator('tbody tr', { hasText: pCheckIn.full_name })
    await expect(rowCheckIn).toBeVisible()
    const checkInBtn = rowCheckIn.locator('button', { hasText: 'Check-In Manual' })
    await expect(checkInBtn).toBeVisible()
    await checkInBtn.click()

    // Confirm in modal
    const confirmCheckInBtn = page.getByRole('button', { name: 'Confirm Check-In' })
    await expect(confirmCheckInBtn).toBeVisible({ timeout: 5000 })
    await confirmCheckInBtn.click()

    // Verify success banner and status badge update
    await expect(page.locator('text=Manual Check-in berhasil')).toBeVisible({ timeout: 10000 })
    await expect(rowCheckIn).toContainText('Checked In')

    // Verify database state: status becomes CHECKED_IN and checked_in_at is set
    const dbCheckedIn = await db.participant.findUniqueOrThrow({
      where: { id: pCheckIn.id },
    })
    expect(dbCheckedIn.status).toBe('CHECKED_IN')
    expect(dbCheckedIn.checked_in_at).not.toBeNull()

    // 5. Cancellation on Participant 2
    const rowCancel = page.locator('tbody tr', { hasText: pCancel.full_name })
    await expect(rowCancel).toBeVisible()
    const cancelBtn = rowCancel.locator('button', { hasText: 'Batalkan' })
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()

    // Confirm in modal
    const confirmCancelBtn = page.getByRole('button', { name: 'Confirm Cancellation' })
    await expect(confirmCancelBtn).toBeVisible({ timeout: 5000 })
    await confirmCancelBtn.click()

    // Verify success banner and status badge update
    await expect(page.locator('text=berhasil dibatalkan!')).toBeVisible({ timeout: 10000 })
    await expect(rowCancel).toContainText('Batal')

    // Verify database state: status becomes CANCELLED
    const dbCancelled = await db.participant.findUniqueOrThrow({
      where: { id: pCancel.id },
    })
    expect(dbCancelled.status).toBe('CANCELLED')
  })

  // ---------------------------------------------------------------------------
  // Scenario F — Admin On-Site Registration & Filtering
  // ---------------------------------------------------------------------------
  test('Scenario F: verifies admin on-site registration modal, immediate check-in, and type filtering', async ({
    page,
    runId,
    cleanupTracker,
  }) => {
    const primaryName = `E2E OnSite Primary [${runId}]`
    const childName = `E2E OnSite Child [${runId}]`
    const phone = `62812${Math.floor(10000000 + Math.random() * 90000000)}`

    // Pre-register expected participant ownership markers
    cleanupTracker.expectedParticipantNames.add(primaryName)
    cleanupTracker.expectedParticipantNames.add(childName)

    // 1. Authenticate and open dashboard
    const { username, password } = await createAdminUser(runId, cleanupTracker)
    await loginAsAdmin(page, username, password)

    // 2. Click "+ Registrasi On-Site" button
    const onSiteBtn = page.getByRole('button', { name: '+ Registrasi On-Site' })
    await expect(onSiteBtn).toBeVisible()
    await onSiteBtn.click()

    // 3. Modal opens
    const modal = page.locator('div[role="dialog"][aria-labelledby="onsite-modal-title"]')
    await expect(modal).toBeVisible({ timeout: 5000 })
    await expect(modal.locator('#onsite-modal-title')).toHaveText('Registrasi Peserta On-Site')

    // 4. Fill Primary Registrant Details
    await modal.getByPlaceholder('Contoh: Budi Santoso').fill(primaryName)
    await modal.getByPlaceholder('Contoh: 081234567890').fill(phone)
    await modal.getByLabel('Gereja Cabang Peserta #1').selectOption('JKI Shema Sunter, Jakarta')
    await modal.getByLabel('Persetujuan WhatsApp Peserta #1').check()

    // 5. Add Additional Participant (Child)
    const addMemberBtn = modal.getByRole('button', { name: 'Tambah Anggota Keluarga' })
    await addMemberBtn.click()

    await modal.getByPlaceholder('Contoh: Budi Santoso').nth(1).fill(childName)
    const childCheckbox = modal.getByLabel(/Peserta ini adalah Anak/i)
    await childCheckbox.check()
    await modal.getByLabel('Gereja Cabang Peserta #2').selectOption('JKI Shema Sunter, Jakarta')
    await modal.getByLabel('Persetujuan WhatsApp Peserta #2').check()

    // 6. Check "Langsung Check-In di Tempat"
    const immediateCheckInToggle = modal.locator('#immediate-checkin')
    await immediateCheckInToggle.check()

    // 7. Submit registration
    const submitBtn = modal.getByRole('button', { name: /Daftarkan On-Site \(2 Peserta\)/i })
    await submitBtn.click()

    // 8. Verify success banner
    await expect(page.locator('text=Registrasi On-Site berhasil untuk 2 peserta!')).toBeVisible({ timeout: 10000 })

    // 9. Discover & verify created participants in database
    const dbPrimary = await db.participant.findFirstOrThrow({
      where: { full_name: primaryName },
      include: { delivery: true },
    })
    cleanupTracker.participantIds.add(dbPrimary.id)
    if (dbPrimary.delivery) {
      cleanupTracker.deliveryIds.add(dbPrimary.delivery.id)
    }

    const dbChild = await db.participant.findFirstOrThrow({
      where: { full_name: childName },
      include: { delivery: true },
    })
    cleanupTracker.participantIds.add(dbChild.id)
    if (dbChild.delivery) {
      cleanupTracker.deliveryIds.add(dbChild.delivery.id)
    }

    // Verify properties
    expect(dbPrimary.registration_type).toBe('ON_SITE')
    expect(dbPrimary.status).toBe('CHECKED_IN')
    expect(dbPrimary.checked_in_at).not.toBeNull()
    expect(dbPrimary.whatsapp_number).toBe(phone)

    expect(dbChild.registration_type).toBe('ON_SITE')
    expect(dbChild.status).toBe('CHECKED_IN')
    expect(dbChild.checked_in_at).not.toBeNull()
    expect(dbChild.whatsapp_number).toBe(phone) // Inherited
    expect(dbChild.is_child).toBe(true)
    expect(dbChild.qr_token).not.toBe(dbPrimary.qr_token)

    // 10. Test Registration Type Filter
    const regTypeFilter = page.getByLabel('Filter Tipe Pendaftaran')
    await expect(regTypeFilter).toBeVisible()

    // Filter to ON_SITE
    await regTypeFilter.selectOption('ON_SITE')
    await expect(page.locator('tbody tr', { hasText: primaryName })).toBeVisible({ timeout: 5000 })
    await expect(page.locator('tbody tr', { hasText: childName })).toBeVisible()

    // Filter to ONLINE -> on-site participants should be hidden
    await regTypeFilter.selectOption('ONLINE')
    await expect(page.locator('tbody tr', { hasText: primaryName })).toHaveCount(0, { timeout: 5000 })
    await expect(page.locator('tbody tr', { hasText: childName })).toHaveCount(0)

    // Reset filter to ALL
    await regTypeFilter.selectOption('ALL')
    await expect(page.locator('tbody tr', { hasText: primaryName })).toBeVisible({ timeout: 5000 })
  })
})
