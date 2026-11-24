# End-to-End (E2E) Browser & Integration Testing Guide

This directory (`e2e/`) contains browser-level End-to-End (E2E) and integration test suites for the JKI Shema Christmas Concert Registration System powered by [Playwright](https://playwright.dev/).

---

## 1. Safety & Environment Invariants

> [!CAUTION]
> **STRICT TARGET RESTRICTION:**
> E2E test execution is **strictly restricted to local PostgreSQL `jkishema_e2e`** running on `localhost:5432`.
> **Targeting Supabase (direct or pooler) or sending live Meta WhatsApp requests is forbidden and blocked fail-closed.**

All E2E processes enforce:
1. `APP_ENV=e2e`
2. `WHATSAPP_MOCK_MODE=true`
3. Dedicated isolated port `3100` (`http://localhost:3100`), preventing any collision with standard dev servers on port `3000`.
4. `reuseExistingServer: false` in `playwright.config.ts`, ensuring Playwright never binds to an existing dev server running in another mode.

---

## 2. Local Prerequisites & Setup

### 2.1 Dependencies
- Node.js (v20+)
- Local PostgreSQL server on `localhost:5432` with user `tiffany` and database `jkishema_e2e`
- Playwright Chromium browser binary:
  ```bash
  npx playwright install chromium
  ```

### 2.2 `.env.e2e.local` Configuration
Create `.env.e2e.local` in the project root (never committed to git, patterned after `.env.e2e.example`):

```bash
APP_ENV=e2e
PORT=3100
NEXT_PUBLIC_APP_URL=http://localhost:3100

# Local PostgreSQL database (never Supabase)
DATABASE_URL=postgresql://tiffany:<local-password>@localhost:5432/jkishema_e2e
DIRECT_URL=postgresql://tiffany:<local-password>@localhost:5432/jkishema_e2e

# NextAuth secrets for E2E
NEXTAUTH_URL=http://localhost:3100
NEXTAUTH_SECRET=<32-char-random-secret>

# Mock WhatsApp Engine
WHATSAPP_MOCK_MODE=true
WHATSAPP_PHONE_NUMBER_ID=mock_phone_id
WHATSAPP_APP_SECRET=<mock-secret>
CRON_SECRET=<mock-cron-secret>
```

### 2.3 Local Database Preparation
Deploy migrations to the local E2E database:
```bash
npm run db:migrate:e2e
npm run db:status:e2e
```

---

## 3. Running E2E Tests

All execution commands use the pre-execution environment guard (`scripts/e2e-env-guard.js`) to validate environment safety before child process spawn.

### 3.1 Full E2E Test Suite
Runs all specs across 5 parallel workers:
```bash
npm run test:e2e
```

### 3.2 Interactive UI Mode
```bash
npm run test:e2e:ui
```

### 3.3 Headed Browser Execution
```bash
npm run test:e2e:headed
```

### 3.4 Running Focused Specs
Run individual spec files by passing their path:
```bash
# Registration smoke & flow
node --env-file=.env.e2e.local ./scripts/e2e-env-guard.js ./node_modules/.bin/playwright test e2e/specs/registration-flow.spec.ts

# QR ticket rendering & download
node --env-file=.env.e2e.local ./scripts/e2e-env-guard.js ./node_modules/.bin/playwright test e2e/specs/qr-ticket.spec.ts

# WhatsApp mock dispatch
node --env-file=.env.e2e.local ./scripts/e2e-env-guard.js ./node_modules/.bin/playwright test e2e/specs/whatsapp-mock-dispatch.spec.ts

# Webhook worker pipeline
node --env-file=.env.e2e.local ./scripts/e2e-env-guard.js ./node_modules/.bin/playwright test e2e/specs/webhook-worker.spec.ts

# Admin operations
node --env-file=.env.e2e.local ./scripts/e2e-env-guard.js ./node_modules/.bin/playwright test e2e/specs/admin-operations.spec.ts

# Inbound WhatsApp RSVP suite
node --env-file=.env.e2e.local ./scripts/e2e-env-guard.js ./node_modules/.bin/playwright test e2e/specs/inbound-rsvp.spec.ts
```

---

## 4. Multi-Worker Parallel Isolation Architecture

Playwright executes tests across up to 5 concurrent worker processes (`workers: process.env.CI ? 1 : undefined`).

### 4.1 Cryptographic `runId` Contract
Each test receives an isolated, cryptographically generated `runId`:
`e2e_run_${crypto.randomUUID()}_w${workerIndex}`
- Random UUIDv4 provides 122 bits of cryptographic entropy.
- `_w<index>` tags the worker index.
- Mathematical collision probability: $p < 10^{-36}$.

### 4.2 Entity Ownership Markers
Every entity created during an E2E test must include the current `runId` marker:
- **Participant:** `full_name` contains `[${runId}]` (e.g. `E2E Primary [e2e_run_..._w0]`).
- **User (Admin):** `username` starts with `admin_${sanitizedRunId}_` (where `sanitizedRunId = runId.replace(/[^a-zA-Z0-9_]/g, '_')`).
- **Delivery Attempt:** `meta_message_id` starts with `wamid.mock_${runId}_`.
- **Webhook Batch:** `raw_payload` contains `waba_${runId}`.
- **Webhook Event:** `event_identity` starts with `status:wamid.mock_${runId}_` or `message:wamid.mock_inbound_${runId}_`.
- **Reconciliation Log:** `participant_name` contains `[${runId}]`.
- **Delivery:** Referenced by owned participant or owned attempt.

### 4.3 Database Locking & Worker Isolation
- **Advisory Transaction Lock:**
  `SELECT pg_advisory_xact_lock(hashtext('e2e_cleanup_' || runId))`
  Because `runId` is unique per test, workers execute database cleanup in non-interfering parallel lock spaces.
- **Row-Level Locking:**
  Cleanup queries acquire `FOR UPDATE` exclusively on records matching the test's own `runId`.
- **Fail-Closed Cross-Worker Validation:**
  If a worker's cleanup query ever locked a record lacking its `runId` marker, Step C immediately throws `[SECURITY VIOLATION]` and rolls back the transaction. Workers can never delete or alter another worker's records.

---

## 5. Teardown Lifecycle & Safety Facilities

### 5.1 `MockWhatsAppGate` Request Draining
Before database cleanup begins:
1. `mockGate.closeAndDrain(5000)` closes the mock gate to reject new requests.
2. It polls active webhook and worker triggers until active counts reach 0.
3. If requests fail to drain within 5000ms, teardown throws `[MOCK GATE DRAIN TIMEOUT]` (fail-closed).

### 5.2 Worker Quiescence Polling
Teardown polls for active webhook events in `RECEIVED`, `PROCESSING`, or `RETRY` matching the current `runId`. If events remain active after 5000ms, teardown throws `[WORKER QUIESCENCE TIMEOUT]`.

### 5.3 Deterministic Cleanup Transaction
1. **Target Authorization:** Verifies `current_database() === 'jkishema_e2e'` and `current_user === 'tiffany'`.
2. **Pre-Deleted Verification:** Checks that entities marked pre-deleted no longer exist.
3. **Lock & Verify (C.1 - C.7):** Locks records `FOR UPDATE` and verifies ownership markers.
4. **Bottom-Up Deletion (D):** Events -> Batches -> ReconciliationLogs -> Attempts -> Deliveries -> Participants -> Users.
5. **Survivor Verification (E):** Queries all 7 tables for remaining records matching `runId`. If count > 0, throws `[SURVIVOR DETECTED]`.
6. **Deadlock / Serialization Retry:** Retries up to 3 times on PostgreSQL `40001` or `40P01` with exponential backoff and jitter.

### 5.4 Orphan Recovery
If a test creates an entity (e.g. an admin User) but fails before registering its ID in `cleanupTracker`, Step 2 multi-table probe detects the run-owned records, logs `[ORPHAN RECOVERY]`, and seamlessly transitions to transactional cleanup to discover, validate, and delete the orphan records.

### 5.5 Global Pre-Suite & Post-Suite Cleanliness Verification
- **`globalSetup` (`e2e/helpers/global-setup.ts`):** Queries all 7 tables before tests run. If any non-zero records exist, throws `[PRE-SUITE CLEANLINESS FAILURE]`.
- **`globalTeardown` (`e2e/helpers/global-teardown.ts`):** Queries all 7 tables after the full suite finishes. If any surviving records exist, throws `[POST-SUITE SURVIVOR FAILURE]`.
- Automatic database truncation is forbidden; dirty database state requires manual inspection to preserve forensic data.

---

## 6. Troubleshooting Common Cleanup & Guard Errors

| Error Message | Cause | Resolution |
| :--- | :--- | :--- |
| `[SECURITY BLOCKED] Disallowed DATABASE_URL host` | `DATABASE_URL` points to Supabase or a remote IP instead of `localhost`. | Ensure `.env.e2e.local` uses `localhost:5432` and `APP_ENV=e2e`. |
| `[PRE-SUITE CLEANLINESS FAILURE] Detected non-zero records` | Previous test run was terminated forcefully (`SIGKILL`) or local database contains dirty records. | Inspect records in `jkishema_e2e`, investigate why teardown did not run, and clean orphaned test records. |
| `[WORKER QUIESCENCE TIMEOUT] Active webhook events remain` | An asynchronous webhook event was left in `RECEIVED` or `PROCESSING`. | Ensure the spec triggers the worker to drain events to `PROCESSED` or `FAILED` before teardown. |
| `[SECURITY VIOLATION] User lacks runId username prefix` | An admin user was created without using `admin_${sanitizedRunId}_` convention. | Use `createAdminUser(runId, cleanupTracker)` helper. |
| `[COMPLETENESS VIOLATION] Tracked record missing from DB` | A record registered in `cleanupTracker` was unexpectedly deleted before teardown. | Use `tracker.markPreDeleted(...)` if the test legitimately deletes a record during its scenario. |
