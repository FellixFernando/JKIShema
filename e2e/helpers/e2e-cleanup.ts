import { PrismaClient, Prisma } from '@prisma/client'

export const RUN_ID_REGEX = /^e2e_run_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_w\d+$/i

export interface PreDeletedCollections {
  participants: Set<string>
  deliveries: Set<string>
  attempts: Set<string>
  webhookBatches: Set<string>
  webhookEvents: Set<string>
  detachedQrTokens: Set<string>
  users: Set<string>
}

/**
 * CleanupTracker
 *
 * Tracks entities created during an E2E test run to ensure strict ownership verification
 * and deterministic cleanup during teardown.
 *
 * Invariants:
 * - `hasTrackedEntities()`: True if any active entity is tracked.
 * - `hasPreDeletedEntities()`: True if any pre-deleted entity is tracked.
 * - `isEmpty()`: True ONLY when BOTH active and pre-deleted collections are empty.
 */
export class CleanupTracker {
  readonly runId: string
  readonly participantIds = new Set<string>()
  readonly deliveryIds = new Set<string>()
  readonly attemptIds = new Set<string>()
  readonly webhookBatchIds = new Set<string>()
  readonly webhookEventIds = new Set<string>()
  readonly detachedQrTokens = new Set<string>()
  readonly userIds = new Set<string>()
  readonly expectedParticipantNames = new Set<string>()

  readonly preDeleted: PreDeletedCollections = {
    participants: new Set<string>(),
    deliveries: new Set<string>(),
    attempts: new Set<string>(),
    webhookBatches: new Set<string>(),
    webhookEvents: new Set<string>(),
    detachedQrTokens: new Set<string>(),
    users: new Set<string>(),
  }

  constructor(runId: string) {
    if (!RUN_ID_REGEX.test(runId)) {
      throw new Error(`[TRACKER INITIALIZATION ERROR] Invalid runId format: "${runId}". Must match ${RUN_ID_REGEX}.`)
    }
    this.runId = runId
  }

  /**
   * Registers an expected participant name before an asynchronous action (such as browser submission).
   * Fails closed immediately if the name does not contain the current test runId.
   */
  trackExpectedParticipantName(fullName: string): void {
    const expectedMarker = `[${this.runId}]`
    if (!fullName.includes(expectedMarker)) {
      throw new Error(
        `[TRACKER ERROR] Cannot register expected participant name "${fullName}": missing required runId marker "${expectedMarker}".`
      )
    }
    this.expectedParticipantNames.add(fullName)
  }

  /**
   * Returns true if any active entity is tracked for cleanup.
   */
  hasTrackedEntities(): boolean {
    return (
      this.participantIds.size > 0 ||
      this.expectedParticipantNames.size > 0 ||
      this.deliveryIds.size > 0 ||
      this.attemptIds.size > 0 ||
      this.webhookBatchIds.size > 0 ||
      this.webhookEventIds.size > 0 ||
      this.detachedQrTokens.size > 0 ||
      this.userIds.size > 0
    )
  }

  /**
   * Returns true if any entity was marked as pre-deleted.
   */
  hasPreDeletedEntities(): boolean {
    return (
      this.preDeleted.participants.size > 0 ||
      this.preDeleted.deliveries.size > 0 ||
      this.preDeleted.attempts.size > 0 ||
      this.preDeleted.webhookBatches.size > 0 ||
      this.preDeleted.webhookEvents.size > 0 ||
      this.preDeleted.detachedQrTokens.size > 0 ||
      this.preDeleted.users.size > 0
    )
  }

  /**
   * Returns true ONLY if neither active tracked entities nor pre-deleted entities exist.
   * If pre-deleted entities exist, this returns false to force database absence verification.
   */
  isEmpty(): boolean {
    return !this.hasTrackedEntities() && !this.hasPreDeletedEntities()
  }
}

export interface CleanupResult {
  status: 'SUCCESS' | 'NO_OP'
  runId: string
  deletedCounts: {
    webhookEvents: number
    webhookBatches: number
    reconciliationLogs: number
    attempts: number
    deliveries: number
    participants: number
    users: number
  }
}

/**
 * Authorizes the database connection before any cleanup query is executed.
 *
 * Strict Security Rules:
 * - Requires `process.env.APP_ENV === 'e2e'`. Rejects NODE_ENV=test or NEXT_PUBLIC_APP_ENV.
 * - Parses and validates DATABASE_URL and DIRECT_URL against exact approved target tuples (host, port, user, path).
 * - Enforces port 5432 for local targets and port 6543 (pooler) / 5432 (direct) for Supabase targets.
 * - Inspects live PostgreSQL session: current_database() and current_user against explicit approved lists.
 * - Never prints database credentials or complete connection URLs in errors or logs.
 */
export async function authorizeCleanupTarget(prisma: PrismaClient): Promise<void> {
  if (process.env.APP_ENV !== 'e2e') {
    throw new Error('[SECURITY BLOCKED] Cleanup aborted: Application is not running with APP_ENV=e2e. NODE_ENV=test and NEXT_PUBLIC_APP_ENV are not permitted.')
  }

  const dbUrl = process.env.DATABASE_URL || ''
  const directUrl = process.env.DIRECT_URL || ''

  if (!dbUrl) {
    throw new Error('[SECURITY BLOCKED] Cleanup aborted: DATABASE_URL is missing.')
  }

  const parseEndpoint = (urlStr: string) => {
    try {
      const u = new URL(urlStr.replace(/^postgresql:\/\//i, 'http://'))
      return {
        host: u.hostname.toLowerCase(),
        port: u.port ? parseInt(u.port, 10) : 5432,
        user: decodeURIComponent(u.username).toLowerCase(),
        pathname: u.pathname.toLowerCase(),
      }
    } catch {
      throw new Error('[SECURITY BLOCKED] Cleanup aborted: Malformed database connection URL.')
    }
  }

  const dbEndpoint = parseEndpoint(dbUrl)
  const directEndpoint = directUrl ? parseEndpoint(directUrl) : null

  // Inspect live PostgreSQL session identity
  const session = await prisma.$queryRaw<Array<{ db: string; usr: string }>>`
    SELECT current_database() AS db, current_user AS usr;
  `
  const activeDb = session[0]?.db || ''
  const activeUser = session[0]?.usr || ''

  // STRICT LOCAL-ONLY AUTHORIZATION:
  // E2E is exclusively permitted on local database `jkishema_e2e` with user `tiffany` on port 5432.
  // Supabase, remote hosts, or any non-local targets are strictly forbidden.
  const ALLOWED_LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '']
  const ALLOWED_LOCAL_USERS = ['tiffany']
  const EXPECTED_DATABASE = 'jkishema_e2e'
  const EXPECTED_PATH = '/jkishema_e2e'
  const EXPECTED_PORT = 5432

  // 1. Validate DATABASE_URL host
  if (!ALLOWED_LOCAL_HOSTS.includes(dbEndpoint.host)) {
    throw new Error(
      `[SECURITY BLOCKED] Disallowed target host: "${dbEndpoint.host}". E2E cleanup is strictly restricted to local database on localhost/127.0.0.1. Remote and Supabase targets are strictly forbidden.`
    )
  }

  // 2. Validate DATABASE_URL port
  if (dbEndpoint.port !== EXPECTED_PORT) {
    throw new Error(
      `[SECURITY BLOCKED] Invalid local E2E database port: ${dbEndpoint.port}. Expected ${EXPECTED_PORT}.`
    )
  }

  // 3. Validate DATABASE_URL username
  if (!ALLOWED_LOCAL_USERS.includes(dbEndpoint.user)) {
    throw new Error(
      `[SECURITY BLOCKED] Unauthorized local E2E database username in DATABASE_URL: "${dbEndpoint.user}". Expected "${ALLOWED_LOCAL_USERS.join('", "')}".`
    )
  }

  // 4. Validate DATABASE_URL database path
  if (dbEndpoint.pathname !== EXPECTED_PATH) {
    throw new Error(
      `[SECURITY BLOCKED] Unauthorized local E2E database name in DATABASE_URL: "${dbEndpoint.pathname}". Expected "${EXPECTED_PATH}".`
    )
  }

  // 5. Validate DIRECT_URL if provided (must target the same local database)
  if (directEndpoint) {
    if (!ALLOWED_LOCAL_HOSTS.includes(directEndpoint.host)) {
      throw new Error(
        `[SECURITY BLOCKED] Disallowed DIRECT_URL host: "${directEndpoint.host}". DIRECT_URL must point to local E2E database on localhost/127.0.0.1.`
      )
    }
    if (directEndpoint.port !== EXPECTED_PORT) {
      throw new Error(
        `[SECURITY BLOCKED] Invalid local E2E direct port: ${directEndpoint.port}. Expected ${EXPECTED_PORT}.`
      )
    }
    if (!ALLOWED_LOCAL_USERS.includes(directEndpoint.user)) {
      throw new Error(
        `[SECURITY BLOCKED] Unauthorized local E2E database username in DIRECT_URL: "${directEndpoint.user}". Expected "${ALLOWED_LOCAL_USERS.join('", "')}".`
      )
    }
    if (directEndpoint.pathname !== EXPECTED_PATH) {
      throw new Error(
        `[SECURITY BLOCKED] DIRECT_URL database path "${directEndpoint.pathname}" does not match local E2E database "${EXPECTED_PATH}".`
      )
    }
  }

  // 6. Validate live runtime PostgreSQL session identity
  if (activeDb !== EXPECTED_DATABASE) {
    throw new Error(
      `[SECURITY BLOCKED] Disallowed target database session: db="${activeDb}". Cleanup permitted ONLY on verified local database "${EXPECTED_DATABASE}".`
    )
  }

  if (!ALLOWED_LOCAL_USERS.includes(activeUser)) {
    throw new Error(
      `[SECURITY BLOCKED] Unauthorized local E2E session username: "${activeUser}". Expected "${ALLOWED_LOCAL_USERS.join('", "')}".`
    )
  }
}

/**
 * Executes deterministic, transaction-safe cleanup of all test records generated by an E2E run.
 */
export async function executeDeterministicE2ECleanup(
  prisma: PrismaClient,
  tracker: CleanupTracker,
  maxRetries = 3,
  quiescenceTimeoutMs = 5000
): Promise<CleanupResult> {
  const { runId } = tracker

  // 1. STRICT TARGET AUTHORIZATION PREFLIGHT
  await authorizeCleanupTarget(prisma)

  // 2. MULTI-TABLE NO_OP PROBE (FAIL-CLOSED)
  // When tracker is genuinely empty (no active and no pre-deleted entities), probe for untracked records
  if (tracker.isEmpty()) {
    const sanitizedRunId = runId.replace(/[^a-zA-Z0-9_]/g, '_')
    const probe = await prisma.$queryRaw<Array<{ total_untracked: bigint }>>`
      SELECT (
        (SELECT COUNT(*) FROM "Participant"
         WHERE strpos(full_name, ${'[' + runId + ']'}) > 0) +
        (SELECT COUNT(*) FROM "WhatsAppWebhookEvent"
         WHERE starts_with(event_identity, ${'status:wamid.mock_' + runId + '_'})
            OR starts_with(event_identity, ${'message:wamid.mock_inbound_' + runId + '_'})) +
        (SELECT COUNT(*) FROM "WhatsAppWebhookBatch"
         WHERE strpos(raw_payload::TEXT, ${runId}) > 0) +
        (SELECT COUNT(*) FROM "WhatsAppReconciliationLog"
         WHERE strpos(participant_name, ${'[' + runId + ']'}) > 0) +
        (SELECT COUNT(*) FROM "WhatsAppDeliveryAttempt"
         WHERE starts_with(meta_message_id, ${'wamid.mock_' + runId + '_'})) +
        (SELECT COUNT(*) FROM "WhatsAppDelivery"
         WHERE participant_id IN (
           SELECT id FROM "Participant" WHERE strpos(full_name, ${'[' + runId + ']'}) > 0
         ) OR id IN (
           SELECT delivery_id FROM "WhatsAppDeliveryAttempt"
           WHERE starts_with(meta_message_id, ${'wamid.mock_' + runId + '_'})
         )) +
        (SELECT COUNT(*) FROM "User"
         WHERE starts_with(username, ${'admin_' + sanitizedRunId}))
      ) AS total_untracked;
    `
    const untrackedCount = Number(probe[0]?.total_untracked || 0)
    if (untrackedCount === 0) {
      return {
        status: 'NO_OP',
        runId,
        deletedCounts: {
          webhookEvents: 0,
          webhookBatches: 0,
          reconciliationLogs: 0,
          attempts: 0,
          deliveries: 0,
          participants: 0,
          users: 0,
        },
      }
    }

    console.warn(
      `[ORPHAN RECOVERY] Run-owned records detected for runId "${runId}". Proceeding to transactional cleanup.`
    )
    // Fall through to Step 3 (quiescence) and Step 4 (transactional cleanup)
  }

  // 3. WORKER QUIESCENCE POLLING (FAIL-CLOSED)
  const quiescenceStart = Date.now()
  const prefix1 = `status:wamid.mock_${runId}_`
  const prefix2 = `message:wamid.mock_inbound_${runId}_`

  let quiescenceAchieved = false
  let lastActiveCount = 0

  while (Date.now() - quiescenceStart < quiescenceTimeoutMs) {
    const active = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM "WhatsAppWebhookEvent"
      WHERE (starts_with(event_identity, ${prefix1}) OR starts_with(event_identity, ${prefix2}))
        AND processing_state IN ('RECEIVED', 'PROCESSING', 'RETRY');
    `
    lastActiveCount = Number(active[0]?.count || 0)
    if (lastActiveCount === 0) {
      quiescenceAchieved = true
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }

  // Final count check to ensure no active events remain; fail-closed if loop timed out
  if (!quiescenceAchieved) {
    const finalCheck = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM "WhatsAppWebhookEvent"
      WHERE (starts_with(event_identity, ${prefix1}) OR starts_with(event_identity, ${prefix2}))
        AND processing_state IN ('RECEIVED', 'PROCESSING', 'RETRY');
    `
    lastActiveCount = Number(finalCheck[0]?.count || 0)
    if (lastActiveCount > 0) {
      throw new Error(
        `[WORKER QUIESCENCE TIMEOUT] Active webhook events (${lastActiveCount}) remain for runId "${runId}" after ${quiescenceTimeoutMs}ms. Cleanup aborted.`
      )
    }
  }

  // 4. RETRYABLE DETERMINISTIC TRANSACTION EXECUTION
  let attempt = 0
  while (attempt < maxRetries) {
    attempt++
    try {
      return await prisma.$transaction(async (tx) => {
        // Step A: Acquire transaction-scoped advisory lock for this runId
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('e2e_cleanup_' || ${runId})) IS NOT NULL AS locked;`

        // Step B: Explicit Database Absence Verification for Pre-Deleted Collections
        // Fail closed immediately before mutating or deleting anything if any supposedly pre-deleted record still exists
        if (tracker.preDeleted.participants.size > 0) {
          const existing = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "Participant"
            WHERE id IN (${Prisma.join(Array.from(tracker.preDeleted.participants))});
          `
          if (existing.length > 0) {
            throw new Error(`[COMPLETENESS VIOLATION] Pre-deleted participant records still exist in database: count = ${existing.length}.`)
          }
        }

        if (tracker.preDeleted.deliveries.size > 0) {
          const existing = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "WhatsAppDelivery"
            WHERE id IN (${Prisma.join(Array.from(tracker.preDeleted.deliveries))});
          `
          if (existing.length > 0) {
            throw new Error(`[COMPLETENESS VIOLATION] Pre-deleted delivery records still exist in database: count = ${existing.length}.`)
          }
        }

        if (tracker.preDeleted.attempts.size > 0) {
          const existing = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "WhatsAppDeliveryAttempt"
            WHERE id IN (${Prisma.join(Array.from(tracker.preDeleted.attempts))});
          `
          if (existing.length > 0) {
            throw new Error(`[COMPLETENESS VIOLATION] Pre-deleted attempt records still exist in database: count = ${existing.length}.`)
          }
        }

        if (tracker.preDeleted.webhookBatches.size > 0) {
          const existing = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "WhatsAppWebhookBatch"
            WHERE id IN (${Prisma.join(Array.from(tracker.preDeleted.webhookBatches))});
          `
          if (existing.length > 0) {
            throw new Error(`[COMPLETENESS VIOLATION] Pre-deleted webhook batch records still exist in database: count = ${existing.length}.`)
          }
        }

        if (tracker.preDeleted.webhookEvents.size > 0) {
          const existing = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "WhatsAppWebhookEvent"
            WHERE id IN (${Prisma.join(Array.from(tracker.preDeleted.webhookEvents))});
          `
          if (existing.length > 0) {
            throw new Error(`[COMPLETENESS VIOLATION] Pre-deleted webhook event records still exist in database: count = ${existing.length}.`)
          }
        }

        if (tracker.preDeleted.detachedQrTokens.size > 0) {
          const existing = await tx.$queryRaw<Array<{ qr_token_snapshot: string }>>`
            SELECT qr_token_snapshot FROM "WhatsAppDelivery"
            WHERE qr_token_snapshot IN (${Prisma.join(Array.from(tracker.preDeleted.detachedQrTokens))});
          `
          if (existing.length > 0) {
            throw new Error(`[COMPLETENESS VIOLATION] Pre-deleted detached QR tokens still exist in database: count = ${existing.length}.`)
          }
        }

        if (tracker.preDeleted.users.size > 0) {
          const existing = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "User"
            WHERE id IN (${Prisma.join(Array.from(tracker.preDeleted.users))});
          `
          if (existing.length > 0) {
            throw new Error(`[COMPLETENESS VIOLATION] Pre-deleted user records still exist in database: count = ${existing.length}.`)
          }
        }

        const expectedPIds = Array.from(tracker.participantIds).filter(
          (id) => !tracker.preDeleted.participants.has(id)
        )

        // Step C: Aligned Lock Acquisition (Delivery -> Attempt -> Participant -> Reconciliation -> Batch -> Event -> User)

        // C.1 Discover & Lock Deliveries (Bidirectional!)
        const deliveryConditions: Prisma.Sql[] = [
          Prisma.sql`participant_id IN (SELECT id FROM "Participant" WHERE strpos(full_name, ${'[' + runId + ']'}) > 0)`,
        ]
        if (expectedPIds.length > 0) {
          deliveryConditions.push(Prisma.sql`participant_id IN (${Prisma.join(expectedPIds)})`)
        }
        if (tracker.deliveryIds.size > 0) {
          deliveryConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(tracker.deliveryIds))})`)
        }
        if (tracker.detachedQrTokens.size > 0) {
          deliveryConditions.push(Prisma.sql`qr_token_snapshot IN (${Prisma.join(Array.from(tracker.detachedQrTokens))})`)
        }

        // Include deliveries referenced by owned attempts
        const attemptSubConditions: Prisma.Sql[] = [
          Prisma.sql`starts_with(meta_message_id, ${'wamid.mock_' + runId + '_'})`,
        ]
        if (tracker.attemptIds.size > 0) {
          attemptSubConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(tracker.attemptIds))})`)
        }
        deliveryConditions.push(Prisma.sql`id IN (SELECT delivery_id FROM "WhatsAppDeliveryAttempt" WHERE ${Prisma.join(attemptSubConditions, ' OR ')})`)

        const lockedDeliveries = await tx.$queryRaw<Array<{ id: string; participant_id: string | null; qr_token_snapshot: string }>>`
          SELECT id, participant_id, qr_token_snapshot
          FROM "WhatsAppDelivery"
          WHERE ${Prisma.join(deliveryConditions, ' OR ')}
          FOR UPDATE;
        `
        const verifiedDeliveryIds = new Set(lockedDeliveries.map((d) => d.id))

        // Expected deliveries check
        for (const trkD of tracker.deliveryIds) {
          if (!tracker.preDeleted.deliveries.has(trkD) && !verifiedDeliveryIds.has(trkD)) {
            throw new Error(`[COMPLETENESS VIOLATION] Tracked delivery ${trkD} missing from DB.`)
          }
        }

        // C.2 Discover & Lock Attempts
        const attemptConditions: Prisma.Sql[] = [
          Prisma.sql`starts_with(meta_message_id, ${'wamid.mock_' + runId + '_'})`,
        ]
        if (verifiedDeliveryIds.size > 0) {
          attemptConditions.push(Prisma.sql`delivery_id IN (${Prisma.join(Array.from(verifiedDeliveryIds))})`)
        }
        if (tracker.attemptIds.size > 0) {
          attemptConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(tracker.attemptIds))})`)
        }

        const lockedAttempts = await tx.$queryRaw<Array<{ id: string; delivery_id: string; meta_message_id: string | null }>>`
          SELECT id, delivery_id, meta_message_id
          FROM "WhatsAppDeliveryAttempt"
          WHERE ${Prisma.join(attemptConditions, ' OR ')}
          FOR UPDATE;
        `
        const verifiedAttemptIds = new Set(lockedAttempts.map((a) => a.id))

        // Verify attempt integrity: every verified attempt must belong to a verified delivery
        for (const a of lockedAttempts) {
          if (!verifiedDeliveryIds.has(a.delivery_id)) {
            throw new Error(`[INTEGRITY VIOLATION] Attempt ${a.id} references delivery ${a.delivery_id} which is not verified.`)
          }
        }

        // Expected attempts check
        for (const trkA of tracker.attemptIds) {
          if (!tracker.preDeleted.attempts.has(trkA) && !verifiedAttemptIds.has(trkA)) {
            throw new Error(`[COMPLETENESS VIOLATION] Tracked attempt ${trkA} missing from DB.`)
          }
        }

        // C.3 Lock & Verify Participants
        const participantConditions: Prisma.Sql[] = [
          Prisma.sql`strpos(full_name, ${'[' + runId + ']'}) > 0`,
        ]
        if (expectedPIds.length > 0) {
          participantConditions.push(Prisma.sql`id IN (${Prisma.join(expectedPIds)})`)
        }
        if (tracker.expectedParticipantNames.size > 0) {
          participantConditions.push(Prisma.sql`full_name IN (${Prisma.join(Array.from(tracker.expectedParticipantNames))})`)
        }

        const lockedParticipants = await tx.$queryRaw<Array<{ id: string; full_name: string; qr_token: string }>>`
          SELECT id, full_name, qr_token
          FROM "Participant"
          WHERE ${Prisma.join(participantConditions, ' OR ')}
          FOR UPDATE;
        `
        const verifiedParticipantIds = new Set(lockedParticipants.map((p) => p.id))

        for (const expId of expectedPIds) {
          if (!verifiedParticipantIds.has(expId)) {
            throw new Error(`[COMPLETENESS ANOMALY] Expected participant ${expId} missing from DB.`)
          }
        }

        const participantQrMap = new Map<string, string>()
        for (const p of lockedParticipants) {
          if (!p.full_name.includes(`[${runId}]`)) {
            throw new Error(`[SECURITY VIOLATION] Participant ${p.id} lacks runId marker: "${p.full_name}"`)
          }
          participantQrMap.set(p.id, p.qr_token)
        }

        // Delivery QR snapshot verification
        for (const d of lockedDeliveries) {
          if (d.participant_id) {
            const expectedToken = participantQrMap.get(d.participant_id)
            if (d.qr_token_snapshot !== expectedToken) {
              throw new Error(`[SECURITY VIOLATION] Delivery ${d.id} QR snapshot mismatch.`)
            }
          } else {
            if (!tracker.detachedQrTokens.has(d.qr_token_snapshot)) {
              throw new Error(`[SECURITY VIOLATION] Detached delivery ${d.id} QR not authorized in tracker.`)
            }
          }
        }

        // C.4 Discover & Lock Reconciliation Logs
        const reconcilConditions: Prisma.Sql[] = [
          Prisma.sql`strpos(participant_name, ${'[' + runId + ']'}) > 0`,
        ]
        if (verifiedDeliveryIds.size > 0) {
          reconcilConditions.push(Prisma.sql`delivery_id IN (${Prisma.join(Array.from(verifiedDeliveryIds))})`)
        }

        const lockedReconciliations = await tx.$queryRaw<Array<{ id: string; delivery_id: string | null; participant_name: string }>>`
          SELECT id, delivery_id, participant_name
          FROM "WhatsAppReconciliationLog"
          WHERE ${Prisma.join(reconcilConditions, ' OR ')}
          FOR UPDATE;
        `
        for (const log of lockedReconciliations) {
          const hasMarker = log.participant_name.includes(`[${runId}]`)
          const hasVerifiedDelivery = log.delivery_id && verifiedDeliveryIds.has(log.delivery_id)
          if (!hasMarker && !hasVerifiedDelivery) {
            throw new Error(`[SECURITY VIOLATION] Reconciliation log ${log.id} lacks verified ownership.`)
          }
        }
        const verifiedReconciliationIds = new Set(lockedReconciliations.map((r) => r.id))

        // C.5 Discover & Lock Batches (Locked BEFORE Events)
        const batchConditions: Prisma.Sql[] = [
          Prisma.sql`strpos(raw_payload::TEXT, ${runId}) > 0`,
        ]
        if (tracker.webhookBatchIds.size > 0) {
          batchConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(tracker.webhookBatchIds))})`)
        }

        const lockedBatches = await tx.$queryRaw<Array<{ id: string; raw_payload: any }>>`
          SELECT id, raw_payload
          FROM "WhatsAppWebhookBatch"
          WHERE ${Prisma.join(batchConditions, ' OR ')}
          FOR UPDATE;
        `
        for (const b of lockedBatches) {
          if (!JSON.stringify(b.raw_payload).includes(runId)) {
            throw new Error(`[SECURITY VIOLATION] Batch ${b.id} missing runId in raw_payload.`)
          }
        }
        const verifiedBatchIds = new Set(lockedBatches.map((b) => b.id))

        // Expected batches check
        for (const bId of tracker.webhookBatchIds) {
          if (!tracker.preDeleted.webhookBatches.has(bId) && !verifiedBatchIds.has(bId)) {
            throw new Error(`[COMPLETENESS VIOLATION] Tracked batch ${bId} missing from DB.`)
          }
        }

        // C.6 Discover & Lock Events
        const eventConditions: Prisma.Sql[] = [
          Prisma.sql`starts_with(event_identity, ${prefix1})`,
          Prisma.sql`starts_with(event_identity, ${prefix2})`,
        ]
        if (verifiedBatchIds.size > 0) {
          eventConditions.push(Prisma.sql`batch_id IN (${Prisma.join(Array.from(verifiedBatchIds))})`)
        }
        if (verifiedAttemptIds.size > 0) {
          eventConditions.push(Prisma.sql`attempt_id IN (${Prisma.join(Array.from(verifiedAttemptIds))})`)
        }
        if (tracker.webhookEventIds.size > 0) {
          eventConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(tracker.webhookEventIds))})`)
        }

        const lockedEvents = await tx.$queryRaw<Array<{ id: string; event_identity: string }>>`
          SELECT id, event_identity
          FROM "WhatsAppWebhookEvent"
          WHERE ${Prisma.join(eventConditions, ' OR ')}
          FOR UPDATE;
        `
        for (const ev of lockedEvents) {
          if (!ev.event_identity.startsWith(prefix1) && !ev.event_identity.startsWith(prefix2)) {
            throw new Error(`[SECURITY VIOLATION] Event ${ev.id} lacks runId marker: "${ev.event_identity}"`)
          }
        }
        const verifiedEventIds = new Set(lockedEvents.map((e) => e.id))

        // Expected events check
        for (const eId of tracker.webhookEventIds) {
          if (!tracker.preDeleted.webhookEvents.has(eId) && !verifiedEventIds.has(eId)) {
            throw new Error(`[COMPLETENESS VIOLATION] Tracked event ${eId} missing from DB.`)
          }
        }

        // C.7 Discover & Lock Users
        const sanitizedRunId = runId.replace(/[^a-zA-Z0-9_]/g, '_')
        const userPrefix = `admin_${sanitizedRunId}`

        const userConditions: Prisma.Sql[] = [
          Prisma.sql`starts_with(username, ${userPrefix})`,
        ]
        if (tracker.userIds.size > 0) {
          userConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(tracker.userIds))})`)
        }

        const lockedUsers = await tx.$queryRaw<Array<{ id: string; username: string }>>`
          SELECT id, username
          FROM "User"
          WHERE ${Prisma.join(userConditions, ' OR ')}
          FOR UPDATE;
        `
        for (const u of lockedUsers) {
          if (!u.username.startsWith(userPrefix)) {
            throw new Error(`[SECURITY VIOLATION] User ${u.id} lacks runId username prefix: "${u.username}". Expected prefix "${userPrefix}".`)
          }
        }
        const verifiedUserIds = new Set(lockedUsers.map((u) => u.id))

        for (const uId of tracker.userIds) {
          if (!tracker.preDeleted.users.has(uId) && !verifiedUserIds.has(uId)) {
            throw new Error(`[COMPLETENESS VIOLATION] Tracked user ${uId} missing from DB.`)
          }
        }

        // Step D: Strict Bottom-Up Deletion Sequence
        let delEvents = 0
        if (verifiedEventIds.size > 0) {
          const res = await tx.whatsAppWebhookEvent.deleteMany({ where: { id: { in: Array.from(verifiedEventIds) } } })
          if (res.count !== verifiedEventIds.size) throw new Error('[DELETE MISMATCH] Events count mismatch.')
          delEvents = res.count
        }

        let delBatches = 0
        if (verifiedBatchIds.size > 0) {
          const res = await tx.whatsAppWebhookBatch.deleteMany({ where: { id: { in: Array.from(verifiedBatchIds) } } })
          if (res.count !== verifiedBatchIds.size) throw new Error('[DELETE MISMATCH] Batches count mismatch.')
          delBatches = res.count
        }

        let delReconciliations = 0
        if (verifiedReconciliationIds.size > 0) {
          const res = await tx.whatsAppReconciliationLog.deleteMany({ where: { id: { in: Array.from(verifiedReconciliationIds) } } })
          if (res.count !== verifiedReconciliationIds.size) throw new Error('[DELETE MISMATCH] Reconciliations count mismatch.')
          delReconciliations = res.count
        }

        let delAttempts = 0
        if (verifiedAttemptIds.size > 0) {
          const res = await tx.whatsAppDeliveryAttempt.deleteMany({ where: { id: { in: Array.from(verifiedAttemptIds) } } })
          if (res.count !== verifiedAttemptIds.size) throw new Error('[DELETE MISMATCH] Attempts count mismatch.')
          delAttempts = res.count
        }

        let delDeliveries = 0
        if (verifiedDeliveryIds.size > 0) {
          const res = await tx.whatsAppDelivery.deleteMany({ where: { id: { in: Array.from(verifiedDeliveryIds) } } })
          if (res.count !== verifiedDeliveryIds.size) throw new Error('[DELETE MISMATCH] Deliveries count mismatch.')
          delDeliveries = res.count
        }

        let delParticipants = 0
        if (verifiedParticipantIds.size > 0) {
          const res = await tx.participant.deleteMany({ where: { id: { in: Array.from(verifiedParticipantIds) } } })
          if (res.count !== verifiedParticipantIds.size) throw new Error('[DELETE MISMATCH] Participants count mismatch.')
          delParticipants = res.count
        }

        let delUsers = 0
        if (verifiedUserIds.size > 0) {
          const res = await tx.user.deleteMany({ where: { id: { in: Array.from(verifiedUserIds) } } })
          if (res.count !== verifiedUserIds.size) throw new Error('[DELETE MISMATCH] Users count mismatch.')
          delUsers = res.count
        }

        // Step E: Complete Survivor Verification (All 7 Entities)
        const survivorDeliveryConditions: Prisma.Sql[] = []
        if (verifiedDeliveryIds.size > 0) {
          survivorDeliveryConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(verifiedDeliveryIds))})`)
        }
        if (tracker.detachedQrTokens.size > 0) {
          survivorDeliveryConditions.push(Prisma.sql`qr_token_snapshot IN (${Prisma.join(Array.from(tracker.detachedQrTokens))})`)
        }
        if (verifiedParticipantIds.size > 0) {
          survivorDeliveryConditions.push(Prisma.sql`participant_id IN (${Prisma.join(Array.from(verifiedParticipantIds))})`)
        }
        survivorDeliveryConditions.push(Prisma.sql`participant_id IN (SELECT id FROM "Participant" WHERE strpos(full_name, ${'[' + runId + ']'}) > 0)`)

        const survivorAttemptConditions: Prisma.Sql[] = [
          Prisma.sql`starts_with(meta_message_id, ${'wamid.mock_' + runId + '_'})`,
        ]
        if (verifiedAttemptIds.size > 0) {
          survivorAttemptConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(verifiedAttemptIds))})`)
        }
        if (verifiedDeliveryIds.size > 0) {
          survivorAttemptConditions.push(Prisma.sql`delivery_id IN (${Prisma.join(Array.from(verifiedDeliveryIds))})`)
        }

        const survivorParticipantConditions: Prisma.Sql[] = [
          Prisma.sql`strpos(full_name, ${'[' + runId + ']'}) > 0`,
        ]
        if (verifiedParticipantIds.size > 0) {
          survivorParticipantConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(verifiedParticipantIds))})`)
        }

        const survivorReconciliationConditions: Prisma.Sql[] = [
          Prisma.sql`strpos(participant_name, ${'[' + runId + ']'}) > 0`,
        ]
        if (verifiedReconciliationIds.size > 0) {
          survivorReconciliationConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(verifiedReconciliationIds))})`)
        }
        if (verifiedDeliveryIds.size > 0) {
          survivorReconciliationConditions.push(Prisma.sql`delivery_id IN (${Prisma.join(Array.from(verifiedDeliveryIds))})`)
        }

        const survivorBatchConditions: Prisma.Sql[] = [
          Prisma.sql`strpos(raw_payload::TEXT, ${runId}) > 0`,
        ]
        if (verifiedBatchIds.size > 0) {
          survivorBatchConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(verifiedBatchIds))})`)
        }

        const survivorEventConditions: Prisma.Sql[] = [
          Prisma.sql`starts_with(event_identity, ${prefix1})`,
          Prisma.sql`starts_with(event_identity, ${prefix2})`,
        ]
        if (verifiedEventIds.size > 0) {
          survivorEventConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(verifiedEventIds))})`)
        }

        const survivorUserConditions: Prisma.Sql[] = [
          Prisma.sql`starts_with(username, ${userPrefix})`,
        ]
        if (verifiedUserIds.size > 0) {
          survivorUserConditions.push(Prisma.sql`id IN (${Prisma.join(Array.from(verifiedUserIds))})`)
        }

        const survivors = await tx.$queryRaw<Array<{ entity: string; count: bigint }>>`
          SELECT 'events' AS entity, COUNT(*) AS count FROM "WhatsAppWebhookEvent"
          WHERE ${Prisma.join(survivorEventConditions, ' OR ')}
          UNION ALL
          SELECT 'batches' AS entity, COUNT(*) AS count FROM "WhatsAppWebhookBatch"
          WHERE ${Prisma.join(survivorBatchConditions, ' OR ')}
          UNION ALL
          SELECT 'reconciliations' AS entity, COUNT(*) AS count FROM "WhatsAppReconciliationLog"
          WHERE ${Prisma.join(survivorReconciliationConditions, ' OR ')}
          UNION ALL
          SELECT 'deliveries' AS entity, COUNT(*) AS count FROM "WhatsAppDelivery"
          WHERE ${Prisma.join(survivorDeliveryConditions, ' OR ')}
          UNION ALL
          SELECT 'attempts' AS entity, COUNT(*) AS count FROM "WhatsAppDeliveryAttempt"
          WHERE ${Prisma.join(survivorAttemptConditions, ' OR ')}
          UNION ALL
          SELECT 'participants' AS entity, COUNT(*) AS count FROM "Participant"
          WHERE ${Prisma.join(survivorParticipantConditions, ' OR ')}
          UNION ALL
          SELECT 'users' AS entity, COUNT(*) AS count FROM "User"
          WHERE ${Prisma.join(survivorUserConditions, ' OR ')};
        `

        for (const s of survivors) {
          if (Number(s.count) > 0) {
            throw new Error(`[SURVIVOR DETECTED] ${s.count} ${s.entity} survived cleanup for runId "${runId}".`)
          }
        }

        return {
          status: 'SUCCESS',
          runId,
          deletedCounts: {
            webhookEvents: delEvents,
            webhookBatches: delBatches,
            reconciliationLogs: delReconciliations,
            attempts: delAttempts,
            deliveries: delDeliveries,
            participants: delParticipants,
            users: delUsers,
          },
        }
      }, { timeout: 15000 })
    } catch (err: any) {
      const isRetryable =
        err?.code === 'P2034' ||
        err?.meta?.code === '40P01' ||
        err?.meta?.code === '40001' ||
        err?.message?.includes('deadlock detected') ||
        err?.message?.includes('could not serialize access')

      if (isRetryable && attempt < maxRetries) {
        const jitterMs = 100 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100)
        await new Promise((r) => setTimeout(r, jitterMs))
        continue
      }
      throw err
    }
  }

  throw new Error(`[CLEANUP EXHAUSTED] Teardown failed after ${maxRetries} attempts for runId "${runId}".`)
}
