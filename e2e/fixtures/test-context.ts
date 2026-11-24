import { test as baseTest, expect } from '@playwright/test'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { CleanupTracker, executeDeterministicE2ECleanup, RUN_ID_REGEX } from '../helpers/e2e-cleanup'
import { MockWhatsAppGate } from './mock-whatsapp-gate'

export interface E2ETestFixtures {
  runId: string
  cleanupTracker: CleanupTracker
  mockGate: MockWhatsAppGate
}

/**
 * Custom Playwright test fixture for JKI Shema E2E suites.
 *
 * Provides:
 * - `runId`: A unique, validated runId contract (e2e_run_<UUIDv4>_w<workerIndex>)
 * - `cleanupTracker`: Typed tracker for registering participant, delivery, attempt, and webhook entities
 * - `mockGate`: Gated dispatcher for synthetic webhooks and worker triggers
 *
 * Teardown Sequence (automatic via fixture lifecycle):
 * 1. Closes the mock gate and waits for all active webhook and worker requests to drain.
 * 2. If draining times out, aborts and fails teardown immediately (never silent).
 * 3. Executes deterministic database cleanup inside a transaction with advisory locking.
 * 4. Verifies zero owned survivors across all 6 entity tables.
 */
export const test = baseTest.extend<E2ETestFixtures & { _e2eLifecycle: void }>({
  runId: async ({}, use, testInfo) => {
    const rawUuid = crypto.randomUUID()
    const workerIndex = testInfo.workerIndex
    const runId = `e2e_run_${rawUuid}_w${workerIndex}`
    if (!RUN_ID_REGEX.test(runId)) {
      throw new Error(`[FIXTURE ERROR] Generated runId "${runId}" failed regex validation.`)
    }
    await use(runId)
  },

  cleanupTracker: async ({ runId }, use) => {
    const tracker = new CleanupTracker(runId)
    await use(tracker)
  },

  mockGate: async ({ runId }, use) => {
    const gate = new MockWhatsAppGate(runId)
    await use(gate)
  },

  _e2eLifecycle: [
    async ({ cleanupTracker, mockGate }, use) => {
      // 1. Yield to the test body
      await use()

      // 2. Teardown Step A: Close mock gate and wait for in-flight requests to drain
      await mockGate.closeAndDrain(5000)

      // 3. Teardown Step B: Execute deterministic database cleanup & survivor verification
      await executeDeterministicE2ECleanup(db, cleanupTracker)
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
