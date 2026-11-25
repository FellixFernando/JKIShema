import { db } from '@/lib/db'
import crypto from 'crypto'
import { normalizeWhatsAppNumber } from '@/lib/phone'
import { cancelParticipant } from '@/services/dashboard.service'
import { getRegistrationSettings } from '@/services/config.service'

const CANCEL_INTENT_KEYWORDS = ['batal', 'cancel', 'tidak hadir']

// Lowercase alphanumerics separated by single spaces, so name matching ignores case and punctuation.
const normalizeName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Whole-word containment: the normalized name must appear as a standalone phrase.
const containsWholeWords = (haystack: string, needle: string): boolean =>
  needle.length > 0 && ` ${haystack} `.includes(` ${needle} `)

export async function processRSVPWebhook(whatsappNumber: string, messageText: string) {
  const cleanMsg = messageText.toLowerCase().trim()

  let canonicalPhone: string
  try {
    canonicalPhone = normalizeWhatsAppNumber(whatsappNumber)
  } catch {
    canonicalPhone = whatsappNumber.trim()
  }
  const phoneVariants = canonicalPhone.startsWith('628')
    ? [canonicalPhone, '08' + canonicalPhone.slice(3)]
    : [canonicalPhone]

  const participants = await db.participant.findMany({
    where: {
      whatsapp_number: { in: phoneVariants },
      status: { in: ['REGISTERED', 'CHECKED_IN'] },
    },
  })

  if (!participants || participants.length === 0) {
    return {
      success: false,
      message: 'Peserta dengan nomor WA tersebut tidak ditemukan.',
      action: 'NONE',
    }
  }

  const cancelIntent = CANCEL_INTENT_KEYWORDS.some((keyword) => cleanMsg.includes(keyword))

  if (!cancelIntent) {
    const participant = participants[0]
    return {
      success: true,
      message: `Pendaftaran atas nama ${participant.full_name} dikonfirmasi hadir.`,
      action: 'CONFIRMED',
      participant,
    }
  }

  const normalizedMsg = normalizeName(cleanMsg)
  const matches = participants.filter((p: any) =>
    containsWholeWords(normalizedMsg, normalizeName(p.full_name))
  )

  if (matches.length === 0) {
    return {
      success: false,
      message: 'Nama peserta yang ingin dibatalkan tidak dikenali. Balas dengan nama lengkap peserta.',
      action: 'NEEDS_NAME',
    }
  }

  if (matches.length > 1) {
    return {
      success: false,
      message: 'Lebih dari satu nama cocok. Sertakan nama lengkap satu peserta saja.',
      action: 'AMBIGUOUS',
    }
  }

  const match = matches[0]

  if (match.status === 'CHECKED_IN') {
    return {
      success: false,
      message: `Peserta ${match.full_name} sudah Check-In dan tidak dapat dibatalkan otomatis. Hubungi panitia.`,
      action: 'REVIEW_CHECKED_IN',
    }
  }

  const cancelled = await cancelParticipant(match.id)

  return {
    success: true,
    message: `Pendaftaran atas nama ${match.full_name} telah dibatalkan. Kuota terbebas kembali.`,
    action: 'CANCELLED',
    participant: cancelled,
  }
}

export function exportParticipantsToCSV(participants: any[]): string {
  const headers = [
    'ID',
    'Nama Lengkap',
    'Nomor WhatsApp',
    'Status Bergereja',
    'Cabang',
    'Anak',
    'Status Acara',
    'Tipe Pendaftaran',
    'QR Token',
    'Waktu Daftar',
  ]

  const rows = participants.map((p) => [
    `"${p.id}"`,
    `"${p.full_name.replace(/"/g, '""')}"`,
    `"${p.whatsapp_number}"`,
    `"${p.church_status}"`,
    `"${p.church_branch || ''}"`,
    `"${p.is_child ? 'Ya' : 'Tidak'}"`,
    `"${p.status}"`,
    `"${p.registration_type}"`,
    `"${p.qr_token}"`,
    `"${new Date(p.created_at).toISOString()}"`,
  ])

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim())
      cur = ''
    } else {
      cur += char
    }
  }
  result.push(cur.trim())
  return result.map((c) => c.replace(/^"|"$/g, '').trim())
}

export interface CsvImportSkipped {
  line: number
  reason: string
}

export interface CsvImportResult {
  importedCount: number
  skippedCount: number
  skipped: CsvImportSkipped[]
  dryRun: boolean
}

export async function importParticipantsFromCSV(
  csvText: string,
  options: { dryRun?: boolean; limit?: number } = {}
): Promise<CsvImportResult> {
  const dryRun = options.dryRun === true
  const cleanText = csvText.replace(/^\uFEFF/, '')
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length <= 1) {
    return { importedCount: 0, skippedCount: 0, skipped: [], dryRun }
  }

  // Header-aware column mapping (Google Forms headers included)
  const headerCols = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
  const hasIdHeader = headerCols[0] === 'id'

  let nameIdx = headerCols.findIndex((h) => ['nama lengkap', 'nama', 'name', 'full_name'].includes(h))
  let phoneIdx = headerCols.findIndex((h) =>
    ['nomor whatsapp', 'no wa', 'whatsapp', 'no. whatsapp', 'phone', 'whatsapp_number', 'no. telp', 'no.telp'].includes(h)
  )
  let churchStatusIdx = headerCols.findIndex((h) =>
    ['status bergereja', 'church_status', 'status gereja', 'apakah sudah bergereja?'].includes(h)
  )
  let churchBranchIdx = headerCols.findIndex((h) =>
    ['cabang', 'church_branch', 'gereja', 'cabang gereja', 'anda berjemaat di jki cabang?'].includes(h)
  )

  // Positional fallback if header names are not detected
  if (nameIdx === -1) nameIdx = hasIdHeader ? 1 : 0
  if (phoneIdx === -1) phoneIdx = hasIdHeader ? 2 : 1
  if (churchStatusIdx === -1) churchStatusIdx = hasIdHeader ? 3 : 3
  if (churchBranchIdx === -1) churchBranchIdx = hasIdHeader ? 4 : 4

  const dataLines = typeof options.limit === 'number' ? lines.slice(1, 1 + Math.max(0, options.limit)) : lines.slice(1)

  const executeInTx = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    if (typeof db.$transaction === 'function') {
      return db.$transaction(fn)
    }
    return fn(db)
  }

  return executeInTx(async (tx) => {
    // 1. Acquire transaction-level advisory lock shared with ONLINE and ON_SITE registration
    if (typeof tx.$executeRaw === 'function') {
      try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('venue_capacity_lock'))`
      } catch {
        // Fallback for mocked unit test environments where $executeRaw is unsupported
      }
    }

    const skipped: CsvImportSkipped[] = []
    const seenBatchKeys = new Set<string>()
    const seenPhones = new Set<string>()
    const validNewParticipants: Array<{
      full_name: string
      whatsapp_number: string
      church_status: any
      church_branch: string | null
      is_child: boolean
    }> = []

    // 2. Parse rows, map status/branch, infer children by shared phone, filter duplicates
    for (let i = 0; i < dataLines.length; i++) {
      const lineNumber = i + 2
      const cols = parseCsvLine(dataLines[i])
      if (cols.length < 2) continue

      const full_name = cols[nameIdx]
      const rawPhone = cols[phoneIdx]

      if (!full_name || !rawPhone) continue

      // E.164 Indonesian phone normalization (08..., 628..., +628...)
      let normalizedPhone: string
      try {
        normalizedPhone = normalizeWhatsAppNumber(rawPhone)
      } catch {
        skipped.push({ line: lineNumber, reason: 'invalid phone number' })
        continue
      }

      const batchKey = `${full_name.toLowerCase()}::${normalizedPhone}`
      if (seenBatchKeys.has(batchKey)) {
        skipped.push({ line: lineNumber, reason: 'duplicate name and phone number in file' })
        continue
      }

      // Check duplicates against DB using both canonical E.164 and legacy 08... variants
      const legacyPhone = '08' + normalizedPhone.slice(3)
      const phoneVariants = [normalizedPhone, legacyPhone]

      const existing = await tx.participant.findFirst({
        where: {
          full_name,
          whatsapp_number: { in: phoneVariants },
          status: { in: ['REGISTERED', 'CHECKED_IN'] },
        },
      })

      if (existing) {
        skipped.push({ line: lineNumber, reason: 'duplicate name and phone number already registered' })
        continue
      }

      seenBatchKeys.add(batchKey)

      // First accepted row per phone is the registrant; later rows sharing it are children.
      const isChild = seenPhones.has(normalizedPhone)
      seenPhones.add(normalizedPhone)

      const rawStatus = (cols[churchStatusIdx] || '').trim().toLowerCase()
      const church_status = rawStatus.startsWith('belum') ? 'TIDAK_BERGEREJA' : 'BERGEREJA'

      validNewParticipants.push({
        full_name,
        whatsapp_number: normalizedPhone,
        church_status,
        church_branch: cols[churchBranchIdx] || null,
        is_child: isChild,
      })
    }

    const skippedCount = skipped.length

    // 3. Enforce the configured venue capacity
    const newParticipantCount = validNewParticipants.length
    if (newParticipantCount > 0) {
      const { totalCapacity } = await getRegistrationSettings(tx)
      const totalActiveCount = await tx.participant.count({
        where: {
          status: { in: ['REGISTERED', 'CHECKED_IN'] },
        },
      })

      if (totalActiveCount + newParticipantCount > totalCapacity) {
        if (newParticipantCount === 1) {
          throw new Error(`Kapasitas total acara (${totalCapacity} peserta) telah penuh.`)
        }
        throw new Error(
          `Kapasitas total acara tidak mencukupi untuk mengimpor ${newParticipantCount} peserta baru (sisa kuota: ${Math.max(
            0,
            totalCapacity - totalActiveCount
          )}).`
        )
      }
    }

    if (dryRun) {
      return { importedCount: validNewParticipants.length, skippedCount, skipped, dryRun }
    }

    // 4. Atomically persist participants and their pending WhatsApp delivery rows
    let importedCount = 0
    for (const item of validNewParticipants) {
      const qr_token = crypto.randomUUID()
      const participant = await tx.participant.create({
        data: {
          full_name: item.full_name,
          whatsapp_number: item.whatsapp_number,
          church_status: item.church_status,
          church_branch: item.church_branch,
          is_child: item.is_child,
          is_wa_opt_in: true,
          qr_token,
          status: 'REGISTERED',
          registration_type: 'ONLINE',
          wa_delivery_status: 'PENDING',
        },
      })

      await tx.whatsAppDelivery.create({
        data: {
          participant_id: participant.id,
          participant_name: item.full_name,
          qr_token_snapshot: qr_token,
          recipient_phone: item.whatsapp_number,
          status: 'PENDING',
          total_attempts: 0,
        },
      })

      importedCount++
    }

    return { importedCount, skippedCount, skipped, dryRun }
  })
}
