import { defineConfig, devices } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
// @ts-ignore - scripts/e2e-env-guard is CommonJS guard
import { validateE2EEnvironment } from './scripts/e2e-env-guard'

// Explicitly load .env.e2e.local so direct Playwright CLI invocations
// always target the local E2E database and cannot silently fall back to Supabase in .env.
const e2eEnvPath = path.resolve(__dirname, '.env.e2e.local')
if (fs.existsSync(e2eEnvPath)) {
  dotenv.config({ path: e2eEnvPath, override: true })
}

// Validate effective environment fail-closed before Playwright starts
if (process.env.APP_ENV === 'e2e' || fs.existsSync(e2eEnvPath)) {
  try {
    validateE2EEnvironment(process.env)
  } catch (err: any) {
    // Purge database credentials to prevent any fallback to Supabase
    delete process.env.DATABASE_URL
    delete process.env.DIRECT_URL
    throw err
  }
}

/**
 * Playwright E2E Configuration for JKI Shema Christmas Concert Registration System.
 *
 * Safety & Isolation Guarantees:
 * - Dedicated test directory: ./e2e/
 * - Dedicated isolated port: 3100 (never collides with standard dev server on 3000)
 * - reuseExistingServer: false (Playwright will never bind to an existing dev server)
 * - Dedicated E2E webServer running APP_ENV=e2e and WHATSAPP_MOCK_MODE=true
 * - Mandatory local database: jkishema_e2e (never Supabase)
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/helpers/global-setup.ts',
  globalTeardown: './e2e/helpers/global-teardown.ts',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
})
