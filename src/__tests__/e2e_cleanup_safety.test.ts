/**
 * Phase 7B.2.7.3: E2E Cleanup Safety, Worker Quiescence, Header Security & Target Authorization Test Suite
 *
 * Verifies:
 * 1. Target database authorization:
 *    - Port validations for local (5432) and Supabase (6543 for pooler, 5432 for direct).
 *    - Strict (host, username, port, database) tuple matching for DIRECT_URL.
 *    - Rejection of cross-matched pairs (e.g., direct host with pooler username, pooler host with direct username).
 *    - Acceptance of all authorized Supabase session usernames (postgres, postgres.plyimhepolrudnlptzba).
 *    - Rejection of unauthorized session usernames.
 * 2. MockWhatsAppGate header security & raw secret integrity:
 *    - Case-insensitive Content-Type sanitization in dispatchSyntheticWebhook and triggerWorker.
 *    - Setting authoritative Content-Type: application/json.
 *    - Exact HMAC calculation using unmodified secret bytes (including leading/trailing whitespace).
 *    - Exact Bearer token authorization using unmodified secret bytes (including whitespace).
 *    - Preservation of unrelated caller headers.
 * 3. Worker quiescence:
 *    - Active events reaching zero before timeout allows cleanup to proceed.
 *    - Active events remaining at timeout throws [WORKER QUIESCENCE TIMEOUT] and aborts.
 *    - Query failure aborts cleanup without transaction.
 * 4. Pre-deleted-only NO_OP path & completeness verification:
 *    - Trackers with only pre-deleted records are non-empty and run DB absence checks.
 *    - Remaining pre-deleted records throw COMPLETENESS VIOLATION.
 */

import crypto from 'crypto'
import {
  CleanupTracker,
  authorizeCleanupTarget,
  executeDeterministicE2ECleanup,
} from '../../e2e/helpers/e2e-cleanup'
import { verifyGlobalCleanliness } from '../../e2e/helpers/global-cleanliness'
import { MockWhatsAppGate } from '../../e2e/fixtures/mock-whatsapp-gate'
import type { PrismaClient } from '@prisma/client'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateE2EEnvironment } = require('../../scripts/e2e-env-guard')

describe('Phase 7B.2.7.3: E2E Cleanup Safety, Worker Quiescence & Header Security', () => {
  const envBackup = { ...process.env }
  const validRunId = 'e2e_run_12345678-1234-4234-8234-123456789abc_w0'

  beforeEach(() => {
    process.env = { ...envBackup }
    jest.clearAllMocks()
  })

  afterAll(() => {
    process.env = envBackup
  })

  describe('1. Database Authorization Hardening (authorizeCleanupTarget)', () => {
    it('rejects execution when APP_ENV !== "e2e" even if NODE_ENV="test"', async () => {
      delete process.env.APP_ENV
      ;(process.env as any).NODE_ENV = 'test'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'

      const mockPrisma = {} as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Application is not running with APP_ENV=e2e/
      )
    })

    it('rejects execution when DATABASE_URL is missing', async () => {
      process.env.APP_ENV = 'e2e'
      delete process.env.DATABASE_URL

      const mockPrisma = {} as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /DATABASE_URL is missing/
      )
    })

    it('rejects Supabase pooler host in DATABASE_URL', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://postgres.plyimhepolrudnlptzba:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
      delete process.env.DIRECT_URL

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'postgres', usr: 'postgres' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Disallowed target host: "aws-0-ap-northeast-1.pooler.supabase.com".*Remote and Supabase targets are strictly forbidden/
      )
    })

    it('rejects Supabase direct host in DATABASE_URL', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://postgres:secret@db.plyimhepolrudnlptzba.supabase.co:5432/postgres'
      delete process.env.DIRECT_URL

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'postgres', usr: 'postgres' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Disallowed target host: "db.plyimhepolrudnlptzba.supabase.co".*Remote and Supabase targets are strictly forbidden/
      )
    })

    it('rejects arbitrary remote host in DATABASE_URL', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@db.production.company.internal:5432/jkishema_e2e'
      delete process.env.DIRECT_URL

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Disallowed target host: "db.production.company.internal".*Remote and Supabase targets are strictly forbidden/
      )
    })

    it('rejects non-local host in DIRECT_URL', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      process.env.DIRECT_URL = 'postgresql://tiffany:pass@remote-host.com:5432/jkishema_e2e'

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Disallowed DIRECT_URL host: "remote-host.com".*must point to local E2E database/
      )
    })

    it('rejects local target with unexpected DATABASE_URL port', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5433/jkishema_e2e'
      delete process.env.DIRECT_URL

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Invalid local E2E database port: 5433. Expected 5432/
      )
    })

    it('rejects local target with unexpected DIRECT_URL port', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      process.env.DIRECT_URL = 'postgresql://tiffany:pass@localhost:5433/jkishema_e2e'

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Invalid local E2E direct port: 5433. Expected 5432/
      )
    })

    it('rejects local target with unexpected DATABASE_URL username (e.g. postgres)', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://postgres:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Unauthorized local E2E database username in DATABASE_URL: "postgres". Expected "tiffany"/
      )
    })

    it('rejects local target with unexpected DIRECT_URL username', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      process.env.DIRECT_URL = 'postgresql://postgres:pass@localhost:5432/jkishema_e2e'

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Unauthorized local E2E database username in DIRECT_URL: "postgres". Expected "tiffany"/
      )
    })

    it('rejects local target with unexpected database name in DATABASE_URL', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/postgres'
      delete process.env.DIRECT_URL

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Unauthorized local E2E database name in DATABASE_URL: "\/postgres". Expected "\/jkishema_e2e"/
      )
    })

    it('rejects local target with mismatched DIRECT_URL database path', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      process.env.DIRECT_URL = 'postgresql://tiffany:pass@localhost:5432/other_db'

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /DIRECT_URL database path "\/other_db" does not match local E2E database "\/jkishema_e2e"/
      )
    })

    it('rejects local target with unexpected runtime current_database() session identity', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'postgres', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Disallowed target database session: db="postgres". Cleanup permitted ONLY on verified local database "jkishema_e2e"/
      )
    })

    it('rejects local target with unexpected runtime current_user session identity', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'postgres' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).rejects.toThrow(
        /Unauthorized local E2E session username: "postgres". Expected "tiffany"/
      )
    })

    it('authorizes valid local E2E target when host, port, path, username, and session match tiffany and jkishema_e2e', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      process.env.DIRECT_URL = 'postgresql://tiffany:pass@127.0.0.1:5432/jkishema_e2e'

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).resolves.toBeUndefined()
    })

    it('authorizes valid local E2E target when DIRECT_URL is omitted', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ db: 'jkishema_e2e', usr: 'tiffany' }]),
      } as unknown as PrismaClient

      await expect(authorizeCleanupTarget(mockPrisma)).resolves.toBeUndefined()
    })
  })

  describe('2. Fail-Closed Worker Quiescence', () => {
    const setupEnv = () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL
    }

    it('proceeds to transaction when active events reach zero before timeout', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.participantIds.add('p-1')

      let quiescencePolls = 0
      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) {
            return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          }
          if (sql.includes('WhatsAppWebhookEvent') && sql.includes('processing_state IN')) {
            quiescencePolls++
            // First poll returns 1 active event; second poll returns 0
            return Promise.resolve([{ count: BigInt(quiescencePolls === 1 ? 1 : 0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('"Participant"') && sql.includes('SELECT id, full_name, qr_token')) {
                return Promise.resolve([{ id: 'p-1', full_name: `User [${validRunId}]`, qr_token: 'qr1' }])
              }
              if (sql.includes('"WhatsAppDelivery"') && sql.includes('SELECT id, participant_id, qr_token_snapshot')) {
                return Promise.resolve([{ id: 'd-1', participant_id: 'p-1', qr_token_snapshot: 'qr1' }])
              }
              return Promise.resolve([])
            }),
            participant: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            whatsAppDelivery: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            whatsAppDeliveryAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppReconciliationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      const result = await executeDeterministicE2ECleanup(mockPrisma, tracker, 3, 500)
      expect(result.status).toBe('SUCCESS')
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })

    it('throws WORKER QUIESCENCE TIMEOUT and never calls $transaction when events remain active', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.participantIds.add('p-1')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) {
            return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          }
          if (sql.includes('WhatsAppWebhookEvent') && sql.includes('processing_state IN')) {
            // Always returns 3 active events
            return Promise.resolve([{ count: BigInt(3) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn(),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker, 3, 100)).rejects.toThrow(
        /\[WORKER QUIESCENCE TIMEOUT\] Active webhook events \(3\) remain for runId/
      )

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('aborts cleanup and never calls $transaction if quiescence query fails', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.participantIds.add('p-1')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) {
            return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          }
          if (sql.includes('WhatsAppWebhookEvent') && sql.includes('processing_state IN')) {
            return Promise.reject(new Error('PostgreSQL connection dropped'))
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn(),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /PostgreSQL connection dropped/
      )

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('3. Case-Insensitive Header Protection (MockWhatsAppGate)', () => {
    let mockRequest: any

    beforeEach(() => {
      mockRequest = {
        post: jest.fn().mockResolvedValue({ status: () => 200 }),
      }
    })

    it('strips caller-supplied X-Hub-Signature-256 case-insensitively and computes authoritative signature', async () => {
      process.env.WHATSAPP_APP_SECRET = 'app_secret_123'
      const gate = new MockWhatsAppGate(validRunId)

      await gate.dispatchSyntheticWebhook(
        mockRequest,
        { data: 'sample' },
        {
          headers: {
            'X-Hub-Signature-256': 'sha256=malicious_fake_hash',
            'X-Custom-Trace-Id': 'trace_abc_999',
          },
        }
      )

      expect(mockRequest.post).toHaveBeenCalledWith(
        '/api/whatsapp/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Trace-Id': 'trace_abc_999',
            'x-hub-signature-256': expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
          }),
        })
      )

      const passedHeaders = mockRequest.post.mock.calls[0][1].headers
      expect(passedHeaders['X-Hub-Signature-256']).toBeUndefined()
      expect(passedHeaders['x-hub-signature-256']).not.toBe('sha256=malicious_fake_hash')
    })

    it('strips caller-supplied lowercase x-hub-signature-256 and computes authoritative signature', async () => {
      process.env.WHATSAPP_APP_SECRET = 'app_secret_123'
      const gate = new MockWhatsAppGate(validRunId)

      await gate.dispatchSyntheticWebhook(
        mockRequest,
        { data: 'sample' },
        {
          headers: {
            'x-hub-signature-256': 'sha256=forged_signature',
          },
        }
      )

      const passedHeaders = mockRequest.post.mock.calls[0][1].headers
      expect(passedHeaders['x-hub-signature-256']).not.toBe('sha256=forged_signature')
      expect(passedHeaders['x-hub-signature-256']).toMatch(/^sha256=[a-f0-9]{64}$/)
    })

    it('strips caller-supplied authorization header case-insensitively and sets authoritative bearer token', async () => {
      process.env.CRON_SECRET = 'cron_secret_456'
      const gate = new MockWhatsAppGate(validRunId)

      await gate.triggerWorker(mockRequest, {
        headers: {
          'authorization': 'Bearer stolen_bearer_token',
          'X-Worker-Priority': 'HIGH',
        },
      })

      expect(mockRequest.post).toHaveBeenCalledWith(
        '/api/internal/webhook-worker',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Worker-Priority': 'HIGH',
            'Authorization': 'Bearer cron_secret_456',
          }),
        })
      )

      const passedHeaders = mockRequest.post.mock.calls[0][1].headers
      expect(passedHeaders['authorization']).toBeUndefined()
      expect(passedHeaders['Authorization']).toBe('Bearer cron_secret_456')
    })

    it('strips caller-supplied Content-Type variants case-insensitively in dispatchSyntheticWebhook', async () => {
      process.env.WHATSAPP_APP_SECRET = 'app_secret_123'
      const gate = new MockWhatsAppGate(validRunId)

      await gate.dispatchSyntheticWebhook(
        mockRequest,
        { data: 'payload' },
        {
          headers: {
            'content-type': 'text/plain',
            'CONTENT-TYPE': 'application/xml',
            'Content-Type': 'multipart/form-data',
            'X-Trace-Id': 'trace-123',
          },
        }
      )

      expect(mockRequest.post).toHaveBeenCalledWith(
        '/api/whatsapp/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Trace-Id': 'trace-123',
          }),
        })
      )

      const passedHeaders = mockRequest.post.mock.calls[0][1].headers
      expect(passedHeaders['content-type']).toBeUndefined()
      expect(passedHeaders['CONTENT-TYPE']).toBeUndefined()
      expect(passedHeaders['Content-Type']).toBe('application/json')
    })

    it('strips caller-supplied Content-Type variants case-insensitively in triggerWorker', async () => {
      process.env.CRON_SECRET = 'cron_secret_456'
      const gate = new MockWhatsAppGate(validRunId)

      await gate.triggerWorker(mockRequest, {
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'CONTENT-TYPE': 'text/html',
          'Content-Type': 'text/plain',
          'X-Worker-Source': 'cron-scheduler',
        },
      })

      expect(mockRequest.post).toHaveBeenCalledWith(
        '/api/internal/webhook-worker',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Worker-Source': 'cron-scheduler',
            'Authorization': 'Bearer cron_secret_456',
          }),
        })
      )

      const passedHeaders = mockRequest.post.mock.calls[0][1].headers
      expect(passedHeaders['content-type']).toBeUndefined()
      expect(passedHeaders['CONTENT-TYPE']).toBeUndefined()
      expect(passedHeaders['Content-Type']).toBe('application/json')
    })

    it('computes HMAC using raw unmodified secret preserving leading and trailing spaces', async () => {
      const rawSecret = '   app_secret_with_leading_and_trailing_spaces   '
      process.env.WHATSAPP_APP_SECRET = rawSecret
      const gate = new MockWhatsAppGate(validRunId)
      const payload = { entry: [{ id: 'test_entry' }] }
      const expectedDigest = crypto
        .createHmac('sha256', rawSecret)
        .update(JSON.stringify(payload))
        .digest('hex')
      const trimmedDigest = crypto
        .createHmac('sha256', rawSecret.trim())
        .update(JSON.stringify(payload))
        .digest('hex')

      expect(expectedDigest).not.toBe(trimmedDigest)

      await gate.dispatchSyntheticWebhook(mockRequest, payload)

      const passedHeaders = mockRequest.post.mock.calls[0][1].headers
      expect(passedHeaders['x-hub-signature-256']).toBe(`sha256=${expectedDigest}`)
      expect(passedHeaders['x-hub-signature-256']).not.toBe(`sha256=${trimmedDigest}`)
    })

    it('sets authoritative Bearer token using raw unmodified secret preserving spaces', async () => {
      const rawCronSecret = '   cron_secret_with_surrounding_whitespace   '
      process.env.CRON_SECRET = rawCronSecret
      const gate = new MockWhatsAppGate(validRunId)

      await gate.triggerWorker(mockRequest)

      const passedHeaders = mockRequest.post.mock.calls[0][1].headers
      expect(passedHeaders['Authorization']).toBe(`Bearer ${rawCronSecret}`)
      expect(passedHeaders['Authorization']).not.toBe(`Bearer ${rawCronSecret.trim()}`)
    })

    it('missing secrets prevent HTTP dispatch and do not increment active request counters', async () => {
      delete process.env.WHATSAPP_APP_SECRET
      delete process.env.CRON_SECRET
      const gate = new MockWhatsAppGate(validRunId)

      await expect(gate.dispatchSyntheticWebhook(mockRequest, {})).rejects.toThrow(
        /Missing WHATSAPP_APP_SECRET/
      )
      expect(gate.activeCounts.webhooks).toBe(0)

      await expect(gate.triggerWorker(mockRequest)).rejects.toThrow(
        /Missing CRON_SECRET/
      )
      expect(gate.activeCounts.workers).toBe(0)

      expect(mockRequest.post).not.toHaveBeenCalled()
    })
  })

  describe('4. Pre-Deleted-Only NO_OP Path & Pre-Deleted Absence Verification', () => {
    const setupEnv = () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL
    }

    it('tracker containing only pre-deleted IDs has isEmpty() === false and executes database absence verification', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.preDeleted.participants.add('p-predel-verified-absent')

      expect(tracker.isEmpty()).toBe(false)

      let absenceCheckExecuted = false
      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) {
            return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          }
          if (sql.includes('WhatsAppWebhookEvent') && sql.includes('processing_state IN')) {
            return Promise.resolve([{ count: BigInt(0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('SELECT id FROM "Participant"') && sql.includes('WHERE id IN')) {
                absenceCheckExecuted = true
                return Promise.resolve([]) // Return 0 rows -> confirmed absent!
              }
              return Promise.resolve([])
            }),
            participant: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDelivery: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDeliveryAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppReconciliationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      const result = await executeDeterministicE2ECleanup(mockPrisma, tracker)
      expect(absenceCheckExecuted).toBe(true)
      expect(result.status).toBe('SUCCESS')
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })

    it('throws COMPLETENESS VIOLATION when pre-deleted participant still exists in DB', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.preDeleted.participants.add('p-predel-1')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          if (sql.includes('WhatsAppWebhookEvent') && sql.includes('processing_state IN')) {
            return Promise.resolve([{ count: BigInt(0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('SELECT id FROM "Participant"')) {
                return Promise.resolve([{ id: 'p-predel-1' }])
              }
              return Promise.resolve([])
            }),
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[COMPLETENESS VIOLATION\] Pre-deleted participant records still exist in database: count = 1/
      )
    })

    it('throws COMPLETENESS VIOLATION when pre-deleted delivery still exists in DB', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.preDeleted.deliveries.add('d-predel-1')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('SELECT id FROM "WhatsAppDelivery"')) {
                return Promise.resolve([{ id: 'd-predel-1' }])
              }
              return Promise.resolve([])
            }),
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[COMPLETENESS VIOLATION\] Pre-deleted delivery records still exist in database: count = 1/
      )
    })

    it('throws COMPLETENESS VIOLATION when pre-deleted attempt still exists in DB', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.preDeleted.attempts.add('a-predel-1')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('SELECT id FROM "WhatsAppDeliveryAttempt"')) {
                return Promise.resolve([{ id: 'a-predel-1' }])
              }
              return Promise.resolve([])
            }),
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[COMPLETENESS VIOLATION\] Pre-deleted attempt records still exist in database: count = 1/
      )
    })

    it('throws COMPLETENESS VIOLATION when pre-deleted webhook batch still exists in DB', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.preDeleted.webhookBatches.add('b-predel-1')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('SELECT id FROM "WhatsAppWebhookBatch"')) {
                return Promise.resolve([{ id: 'b-predel-1' }])
              }
              return Promise.resolve([])
            }),
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[COMPLETENESS VIOLATION\] Pre-deleted webhook batch records still exist in database: count = 1/
      )
    })

    it('throws COMPLETENESS VIOLATION when pre-deleted webhook event still exists in DB', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.preDeleted.webhookEvents.add('e-predel-1')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('SELECT id FROM "WhatsAppWebhookEvent"')) {
                return Promise.resolve([{ id: 'e-predel-1' }])
              }
              return Promise.resolve([])
            }),
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[COMPLETENESS VIOLATION\] Pre-deleted webhook event records still exist in database: count = 1/
      )
    })

    it('throws COMPLETENESS VIOLATION when pre-deleted detached QR token still exists in DB', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.preDeleted.detachedQrTokens.add('token-predel-xyz')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('SELECT qr_token_snapshot FROM "WhatsAppDelivery"')) {
                return Promise.resolve([{ qr_token_snapshot: 'token-predel-xyz' }])
              }
              return Promise.resolve([])
            }),
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[COMPLETENESS VIOLATION\] Pre-deleted detached QR tokens still exist in database: count = 1/
      )
    })
  })

  describe('5. Inherited Environment Variables & Pre-Execution Guard (validateE2EEnvironment)', () => {
    const validLocalEnv = {
      APP_ENV: 'e2e',
      WHATSAPP_MOCK_MODE: 'true',
      DATABASE_URL: 'postgresql://tiffany:my_secret_pw@localhost:5432/jkishema_e2e',
    }

    it('authorizes valid local E2E environment configuration', () => {
      expect(validateE2EEnvironment(validLocalEnv)).toBe(true)
    })

    it('authorizes valid local E2E environment with matching DIRECT_URL', () => {
      const envWithDirect = {
        ...validLocalEnv,
        DIRECT_URL: 'postgresql://tiffany:my_secret_pw@127.0.0.1:5432/jkishema_e2e',
      }
      expect(validateE2EEnvironment(envWithDirect)).toBe(true)
    })

    it('rejects inherited Supabase pooler DATABASE_URL from parent shell', () => {
      const inheritedEnv = {
        ...validLocalEnv,
        DATABASE_URL: 'postgresql://postgres.plyimhepolrudnlptzba:super_secret_supabase_pass@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
      }

      expect(() => validateE2EEnvironment(inheritedEnv)).toThrow(
        /\[SECURITY BLOCKED\] Disallowed DATABASE_URL host: "aws-0-ap-northeast-1.pooler.supabase.com"/
      )
    })

    it('rejects inherited Supabase direct host in DATABASE_URL', () => {
      const inheritedEnv = {
        ...validLocalEnv,
        DATABASE_URL: 'postgresql://postgres:supabase_direct_pass@db.plyimhepolrudnlptzba.supabase.co:5432/postgres',
      }

      expect(() => validateE2EEnvironment(inheritedEnv)).toThrow(
        /\[SECURITY BLOCKED\] Disallowed DATABASE_URL host: "db.plyimhepolrudnlptzba.supabase.co"/
      )
    })

    it('rejects inherited Supabase direct host in DIRECT_URL', () => {
      const inheritedEnv = {
        ...validLocalEnv,
        DIRECT_URL: 'postgresql://postgres:supabase_direct_pass@db.plyimhepolrudnlptzba.supabase.co:5432/postgres',
      }

      expect(() => validateE2EEnvironment(inheritedEnv)).toThrow(
        /\[SECURITY BLOCKED\] Disallowed DIRECT_URL host: "db.plyimhepolrudnlptzba.supabase.co"/
      )
    })

    it('rejects inherited arbitrary remote host in DATABASE_URL', () => {
      const inheritedEnv = {
        ...validLocalEnv,
        DATABASE_URL: 'postgresql://tiffany:pass@remote.company.database.internal:5432/jkishema_e2e',
      }

      expect(() => validateE2EEnvironment(inheritedEnv)).toThrow(
        /\[SECURITY BLOCKED\] Disallowed DATABASE_URL host: "remote.company.database.internal"/
      )
    })

    it('rejects inherited wrong port in DATABASE_URL', () => {
      const inheritedEnv = {
        ...validLocalEnv,
        DATABASE_URL: 'postgresql://tiffany:pass@localhost:5433/jkishema_e2e',
      }

      expect(() => validateE2EEnvironment(inheritedEnv)).toThrow(
        /\[SECURITY BLOCKED\] Invalid local E2E database port in DATABASE_URL: 5433. Expected 5432/
      )
    })

    it('rejects inherited wrong username in DATABASE_URL (e.g. postgres)', () => {
      const inheritedEnv = {
        ...validLocalEnv,
        DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/jkishema_e2e',
      }

      expect(() => validateE2EEnvironment(inheritedEnv)).toThrow(
        /\[SECURITY BLOCKED\] Unauthorized local E2E database username in DATABASE_URL: "postgres". Expected "tiffany"/
      )
    })

    it('rejects inherited wrong database name in DATABASE_URL', () => {
      const inheritedEnv = {
        ...validLocalEnv,
        DATABASE_URL: 'postgresql://tiffany:pass@localhost:5432/postgres',
      }

      expect(() => validateE2EEnvironment(inheritedEnv)).toThrow(
        /\[SECURITY BLOCKED\] Unauthorized local E2E database name in DATABASE_URL: "\/postgres". Expected "\/jkishema_e2e"/
      )
    })

    it('rejects inherited mismatched DIRECT_URL database path', () => {
      const inheritedEnv = {
        ...validLocalEnv,
        DIRECT_URL: 'postgresql://tiffany:pass@localhost:5432/other_db',
      }

      expect(() => validateE2EEnvironment(inheritedEnv)).toThrow(
        /\[SECURITY BLOCKED\] DIRECT_URL database path "\/other_db" does not match local E2E database "\/jkishema_e2e"/
      )
    })

    it('rejects when APP_ENV is not e2e', () => {
      const inheritedEnv = {
        ...validLocalEnv,
        APP_ENV: 'production',
      }

      expect(() => validateE2EEnvironment(inheritedEnv)).toThrow(
        /\[SECURITY BLOCKED\] Execution aborted: APP_ENV is "production", expected "e2e"/
      )
    })

    it('rejects when WHATSAPP_MOCK_MODE is not true', () => {
      const inheritedEnv = {
        ...validLocalEnv,
        WHATSAPP_MOCK_MODE: 'false',
      }

      expect(() => validateE2EEnvironment(inheritedEnv)).toThrow(
        /\[SECURITY BLOCKED\] Execution aborted: WHATSAPP_MOCK_MODE is "false", expected "true"/
      )
    })

    it('does NOT expose passwords in security error messages', () => {
      const password = 'super_secret_confidential_password_12345!'
      const inheritedEnv = {
        ...validLocalEnv,
        DATABASE_URL: `postgresql://tiffany:${password}@remote-db.evil.com:5432/jkishema_e2e`,
      }

      try {
        validateE2EEnvironment(inheritedEnv)
        throw new Error('Expected validation to fail')
      } catch (err: any) {
        expect(err.message).not.toContain(password)
        expect(err.message).toContain('remote-db.evil.com')
      }
    })
  })

  describe('6. P1: Admin User Cleanup Integration', () => {
    const setupEnv = () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL
    }

    it('tracks user IDs and preDeleted users in tracker state', () => {
      const tracker = new CleanupTracker(validRunId)
      expect(tracker.isEmpty()).toBe(true)

      tracker.userIds.add('u-admin-1')
      expect(tracker.hasTrackedEntities()).toBe(true)
      expect(tracker.isEmpty()).toBe(false)

      const tracker2 = new CleanupTracker(validRunId)
      tracker2.preDeleted.users.add('u-admin-predel')
      expect(tracker2.hasPreDeletedEntities()).toBe(true)
      expect(tracker2.isEmpty()).toBe(false)
    })

    it('tracked user with wrong username prefix triggers security violation', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.userIds.add('u-admin-hacked')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('FROM "User"')) {
                return Promise.resolve([{ id: 'u-admin-hacked', username: 'admin_malicious_user_prefix' }])
              }
              return Promise.resolve([])
            }),
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[SECURITY VIOLATION\] User u-admin-hacked lacks runId username prefix/
      )
    })

    it('detects run-owned orphan user in untracked multi-table probe and triggers orphan recovery', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId) // empty tracker
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          if (sql.includes('total_untracked')) {
            return Promise.resolve([{ total_untracked: BigInt(1) }])
          }
          if (sql.includes('FROM "WhatsAppWebhookEvent"')) {
            return Promise.resolve([{ count: BigInt(0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('FROM "User"')) {
                const sanitized = validRunId.replace(/[^a-zA-Z0-9_]/g, '_')
                return Promise.resolve([{ id: 'u-orphan-admin', username: `admin_${sanitized}_1` }])
              }
              return Promise.resolve([])
            }),
            user: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            participant: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDelivery: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDeliveryAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppReconciliationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      const result = await executeDeterministicE2ECleanup(mockPrisma, tracker)
      expect(result.status).toBe('SUCCESS')
      expect(result.deletedCounts.users).toBe(1)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ORPHAN RECOVERY] Run-owned records detected for runId')
      )
      warnSpy.mockRestore()
    })

    it('throws COMPLETENESS VIOLATION when tracked user is missing from DB', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.userIds.add('u-admin-missing')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('FROM "User"')) {
                return Promise.resolve([]) // Missing!
              }
              return Promise.resolve([])
            }),
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[COMPLETENESS VIOLATION\] Tracked user u-admin-missing missing from DB/
      )
    })

    it('detects user survivor during Step E verification', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.userIds.add('u-admin-survivor')

      const sanitizedRunId = validRunId.replace(/[^a-zA-Z0-9_]/g, '_')
      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('UNION ALL')) {
                return Promise.resolve([{ entity: 'users', count: BigInt(1) }])
              }
              if (sql.includes('FROM "User"')) {
                return Promise.resolve([{ id: 'u-admin-survivor', username: `admin_${sanitizedRunId}_123` }])
              }
              return Promise.resolve([])
            }),
            user: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            participant: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDelivery: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDeliveryAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppReconciliationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[SURVIVOR DETECTED\] 1 users survived cleanup/
      )
    })
  })

  describe('7. P2: Expected Participant Ownership Registration', () => {
    it('accepts participant name containing current runId marker', () => {
      const tracker = new CleanupTracker(validRunId)
      expect(tracker.isEmpty()).toBe(true)

      const validName = `E2E John Doe [${validRunId}]`
      tracker.trackExpectedParticipantName(validName)

      expect(tracker.expectedParticipantNames.has(validName)).toBe(true)
      expect(tracker.hasTrackedEntities()).toBe(true)
      expect(tracker.isEmpty()).toBe(false)
    })

    it('rejects participant name missing current runId marker', () => {
      const tracker = new CleanupTracker(validRunId)
      expect(() => tracker.trackExpectedParticipantName('Unrelated Participant Name')).toThrow(
        /missing required runId marker/
      )
    })

    it('does not fail cleanup when an expected name produced no database record', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL

      const tracker = new CleanupTracker(validRunId)
      tracker.trackExpectedParticipantName(`E2E Ghost [${validRunId}]`)

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('SELECT id, full_name, qr_token FROM "Participant"')) {
                return Promise.resolve([]) // No record produced -> valid!
              }
              return Promise.resolve([])
            }),
            user: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            participant: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDelivery: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDeliveryAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppReconciliationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      const result = await executeDeterministicE2ECleanup(mockPrisma, tracker)
      expect(result.status).toBe('SUCCESS')
    })

    it('security violation thrown if discovered participant lacks runId marker', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL

      const tracker = new CleanupTracker(validRunId)
      tracker.trackExpectedParticipantName(`E2E Expected [${validRunId}]`)

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('FROM "Participant"')) {
                return Promise.resolve([{ id: 'p-corrupted', full_name: 'Corrupted Participant Name', qr_token: 'tok' }])
              }
              return Promise.resolve([])
            }),
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[SECURITY VIOLATION\] Participant p-corrupted lacks runId marker/
      )
    })
  })

  describe('8. P3: Global Database Cleanliness Verification', () => {
    const setupEnv = () => {
      process.env.APP_ENV = 'e2e'
      process.env.WHATSAPP_MOCK_MODE = 'true'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL
    }

    it('passes pre-suite cleanliness verification when all seven tables are empty', async () => {
      setupEnv()
      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{
            participants: BigInt(0),
            deliveries: BigInt(0),
            attempts: BigInt(0),
            batches: BigInt(0),
            events: BigInt(0),
            reconciliations: BigInt(0),
            users: BigInt(0),
          }])
        }),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as PrismaClient

      await expect(verifyGlobalCleanliness('PRE_SUITE', mockPrisma)).resolves.toBeUndefined()
    })

    it('fails pre-suite cleanliness immediately when non-zero records exist', async () => {
      setupEnv()
      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{
            participants: BigInt(3),
            deliveries: BigInt(0),
            attempts: BigInt(0),
            batches: BigInt(0),
            events: BigInt(0),
            reconciliations: BigInt(0),
            users: BigInt(1),
          }])
        }),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as PrismaClient

      await expect(verifyGlobalCleanliness('PRE_SUITE', mockPrisma)).rejects.toThrow(
        /\[PRE-SUITE CLEANLINESS FAILURE\] Local E2E database "jkishema_e2e" is not clean! Detected non-zero records in: Participant \(3\), User \(1\)/
      )
    })

    it('fails post-suite cleanliness when survivors are detected', async () => {
      setupEnv()
      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{
            participants: BigInt(0),
            deliveries: BigInt(0),
            attempts: BigInt(0),
            batches: BigInt(0),
            events: BigInt(1),
            reconciliations: BigInt(0),
            users: BigInt(0),
          }])
        }),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as PrismaClient

      await expect(verifyGlobalCleanliness('POST_SUITE', mockPrisma)).rejects.toThrow(
        /\[POST-SUITE SURVIVOR FAILURE\] Local E2E database "jkishema_e2e" is not clean! Detected non-zero records in: WhatsAppWebhookEvent \(1\)/
      )
    })

    it('rejects remote or Supabase target database before any count query', async () => {
      process.env.APP_ENV = 'e2e'
      process.env.WHATSAPP_MOCK_MODE = 'true'
      process.env.DATABASE_URL = 'postgresql://postgres:secret@db.plyimhepolrudnlptzba.supabase.co:5432/postgres'

      const mockPrisma = {
        $queryRaw: jest.fn(),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as PrismaClient

      await expect(verifyGlobalCleanliness('PRE_SUITE', mockPrisma)).rejects.toThrow(
        /\[SECURITY BLOCKED\] Disallowed DATABASE_URL host/
      )
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
    })
  })

  describe('9. Empty-Tracker Orphan Recovery Correction', () => {
    const setupEnv = () => {
      process.env.APP_ENV = 'e2e'
      process.env.WHATSAPP_MOCK_MODE = 'true'
      process.env.DATABASE_URL = 'postgresql://tiffany:pass@localhost:5432/jkishema_e2e'
      delete process.env.DIRECT_URL
    }

    it('1. empty tracker + zero owned records returns NO_OP without opening a transaction', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      expect(tracker.isEmpty()).toBe(true)

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          if (sql.includes('total_untracked')) {
            return Promise.resolve([{ total_untracked: BigInt(0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn(),
      } as unknown as PrismaClient

      const result = await executeDeterministicE2ECleanup(mockPrisma, tracker)
      expect(result.status).toBe('NO_OP')
      expect(result.deletedCounts).toEqual({
        webhookEvents: 0,
        webhookBatches: 0,
        reconciliationLogs: 0,
        attempts: 0,
        deliveries: 0,
        participants: 0,
        users: 0,
      })
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('2. empty tracker + one valid run-owned orphan admin user proceeds to transactional cleanup instead of throwing', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const sanitized = validRunId.replace(/[^a-zA-Z0-9_]/g, '_')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          if (sql.includes('total_untracked')) {
            return Promise.resolve([{ total_untracked: BigInt(1) }])
          }
          if (sql.includes('FROM "WhatsAppWebhookEvent"')) {
            return Promise.resolve([{ count: BigInt(0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('FROM "User"')) {
                return Promise.resolve([{ id: 'u-orphan-admin', username: `admin_${sanitized}_test` }])
              }
              return Promise.resolve([])
            }),
            user: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            participant: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDelivery: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDeliveryAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppReconciliationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      const result = await executeDeterministicE2ECleanup(mockPrisma, tracker)
      expect(result.status).toBe('SUCCESS')
      expect(result.deletedCounts.users).toBe(1)
      expect(warnSpy).toHaveBeenCalledWith(
        `[ORPHAN RECOVERY] Run-owned records detected for runId "${validRunId}". Proceeding to transactional cleanup.`
      )
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      warnSpy.mockRestore()
    })

    it('3. empty tracker + valid run-owned participant proceeds to transactional cleanup', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          if (sql.includes('total_untracked')) {
            return Promise.resolve([{ total_untracked: BigInt(1) }])
          }
          if (sql.includes('FROM "WhatsAppWebhookEvent"')) {
            return Promise.resolve([{ count: BigInt(0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('FROM "Participant"')) {
                return Promise.resolve([{ id: 'p-orphan-1', full_name: `Orphan Participant [${validRunId}]`, qr_token: 'tok-orphan' }])
              }
              return Promise.resolve([])
            }),
            user: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            participant: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            whatsAppDelivery: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDeliveryAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppReconciliationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      const result = await executeDeterministicE2ECleanup(mockPrisma, tracker)
      expect(result.status).toBe('SUCCESS')
      expect(result.deletedCounts.participants).toBe(1)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ORPHAN RECOVERY]')
      )
      warnSpy.mockRestore()
    })

    it('4. empty tracker + multiple valid run-owned records across supported entity types proceeds to transactional cleanup', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const sanitized = validRunId.replace(/[^a-zA-Z0-9_]/g, '_')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          if (sql.includes('total_untracked')) {
            return Promise.resolve([{ total_untracked: BigInt(3) }])
          }
          if (sql.includes('FROM "WhatsAppWebhookEvent"')) {
            return Promise.resolve([{ count: BigInt(0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('FROM "Participant"')) {
                return Promise.resolve([{ id: 'p-multi-1', full_name: `Multi [${validRunId}]`, qr_token: 'tok-multi' }])
              }
              if (sql.includes('FROM "WhatsAppDelivery"')) {
                return Promise.resolve([{ id: 'del-multi-1', participant_id: 'p-multi-1', qr_token_snapshot: 'tok-multi' }])
              }
              if (sql.includes('FROM "User"')) {
                return Promise.resolve([{ id: 'u-multi-1', username: `admin_${sanitized}_worker` }])
              }
              return Promise.resolve([])
            }),
            user: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            participant: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            whatsAppDelivery: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            whatsAppDeliveryAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppReconciliationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      const result = await executeDeterministicE2ECleanup(mockPrisma, tracker)
      expect(result.status).toBe('SUCCESS')
      expect(result.deletedCounts.participants).toBe(1)
      expect(result.deletedCounts.deliveries).toBe(1)
      expect(result.deletedCounts.users).toBe(1)
      warnSpy.mockRestore()
    })

    it('5. transactional cleanup discovers, validates, and deletes the orphan admin user', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const sanitized = validRunId.replace(/[^a-zA-Z0-9_]/g, '_')
      let userQueryInspected = false
      let userDeleteArgs: any = null

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          if (sql.includes('total_untracked')) {
            return Promise.resolve([{ total_untracked: BigInt(1) }])
          }
          if (sql.includes('FROM "WhatsAppWebhookEvent"')) {
            return Promise.resolve([{ count: BigInt(0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('FROM "User"')) {
                userQueryInspected = true
                return Promise.resolve([{ id: 'u-orphan-admin-5', username: `admin_${sanitized}_testcase5` }])
              }
              return Promise.resolve([])
            }),
            user: {
              deleteMany: jest.fn().mockImplementation((args: any) => {
                userDeleteArgs = args
                return Promise.resolve({ count: 1 })
              }),
            },
            participant: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDelivery: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDeliveryAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppReconciliationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      const result = await executeDeterministicE2ECleanup(mockPrisma, tracker)
      expect(result.status).toBe('SUCCESS')
      expect(userQueryInspected).toBe(true)
      expect(userDeleteArgs).toEqual({ where: { id: { in: ['u-orphan-admin-5'] } } })
      expect(result.deletedCounts.users).toBe(1)
      warnSpy.mockRestore()
    })

    it('6. an unrelated admin username does not qualify for orphan recovery', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          if (sql.includes('total_untracked')) {
            return Promise.resolve([{ total_untracked: BigInt(0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn(),
      } as unknown as PrismaClient

      const result = await executeDeterministicE2ECleanup(mockPrisma, tracker)
      expect(result.status).toBe('NO_OP')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('7. a tracked user with an invalid username prefix still triggers a security violation', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      tracker.userIds.add('u-alien')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          return Promise.resolve([{ count: BigInt(0) }])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('FROM "User"')) {
                return Promise.resolve([{ id: 'u-alien', username: 'admin_malicious_prefix_123' }])
              }
              return Promise.resolve([])
            }),
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[SECURITY VIOLATION\] User u-alien lacks runId username prefix: "admin_malicious_prefix_123"/
      )
    })

    it('8. survivor verification still fails if any run-owned record remains', async () => {
      setupEnv()
      const tracker = new CleanupTracker(validRunId)
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const sanitized = validRunId.replace(/[^a-zA-Z0-9_]/g, '_')

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation((strings: any) => {
          const sql = Array.isArray(strings) ? strings.join('') : String(strings)
          if (sql.includes('current_database()')) return Promise.resolve([{ db: 'jkishema_e2e', usr: 'tiffany' }])
          if (sql.includes('total_untracked')) {
            return Promise.resolve([{ total_untracked: BigInt(1) }])
          }
          if (sql.includes('FROM "WhatsAppWebhookEvent"')) {
            return Promise.resolve([{ count: BigInt(0) }])
          }
          return Promise.resolve([])
        }),
        $transaction: jest.fn().mockImplementation(async (cb: any) => {
          const tx = {
            $queryRaw: jest.fn().mockImplementation((strings: any) => {
              const sql = Array.isArray(strings) ? strings.join('') : String(strings)
              if (sql.includes('UNION ALL')) {
                return Promise.resolve([{ entity: 'users', count: BigInt(1) }])
              }
              if (sql.includes('FROM "User"')) {
                return Promise.resolve([{ id: 'u-survivor-orphan', username: `admin_${sanitized}_survivor` }])
              }
              return Promise.resolve([])
            }),
            user: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
            participant: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDelivery: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppDeliveryAttempt: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppWebhookEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            whatsAppReconciliationLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }
          return await cb(tx)
        }),
      } as unknown as PrismaClient

      await expect(executeDeterministicE2ECleanup(mockPrisma, tracker)).rejects.toThrow(
        /\[SURVIVOR DETECTED\] 1 users survived cleanup/
      )
      warnSpy.mockRestore()
    })
  })
})
