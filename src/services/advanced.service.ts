import { db } from '@/lib/db'
import crypto from 'crypto'

export async function processRSVPWebhook(whatsappNumber: string, messageText: string) {
  const cleanWA = whatsappNumber.trim()
  const cleanMsg = messageText.toLowerCase().trim()

  const participant = await db.participant.findFirst({
    where: {
      whatsapp_number: cleanWA,
      status: { in: ['REGISTERED', 'CHECKED_IN'] },
    },
  })

  if (!participant) {
    return {
      success: false,
      message: 'Peserta dengan nomor WA tersebut tidak ditemukan.',
      action: 'NONE',
    }
  }

  if (cleanMsg.includes('tidak hadir') || cleanMsg.includes('batal') || cleanMsg.includes('cancel')) {
    const updated = await db.participant.update({
      where: { id: participant.id },
      data: { status: 'CANCELLED' },
    })

    return {
      success: true,
      message: `Pendaftaran atas nama ${participant.full_name} telah dibatalkan. Kuota terbebas kembali.`,
      action: 'CANCELLED',
      participant: updated,
    }
  }

  return {
    success: true,
    message: `Pendaftaran atas nama ${participant.full_name} dikonfirmasi hadir.`,
    action: 'CONFIRMED',
    participant,
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

export async function importParticipantsFromCSV(csvText: string) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length <= 1) {
    return { importedCount: 0, skippedCount: 0 }
  }

  let importedCount = 0
  let skippedCount = 0

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim())
    if (cols.length < 2) continue

    const full_name = cols[0] || cols[1]
    const whatsapp_number = cols[1] || cols[2]

    if (!full_name || !whatsapp_number) continue

    const existing = await db.participant.findFirst({
      where: {
        full_name,
        whatsapp_number,
        status: { in: ['REGISTERED', 'CHECKED_IN'] },
      },
    })

    if (existing) {
      skippedCount++
      continue
    }

    await db.participant.create({
      data: {
        full_name,
        whatsapp_number,
        church_status: (cols[3] as any) === 'TIDAK_BERGEREJA' ? 'TIDAK_BERGEREJA' : 'BERGEREJA',
        church_branch: cols[4] || null,
        is_child: cols[5] === 'Ya' || cols[5] === 'true',
        is_wa_opt_in: true,
        qr_token: crypto.randomUUID(),
        status: 'REGISTERED',
        registration_type: 'ONLINE',
      },
    })

    importedCount++
  }

  return { importedCount, skippedCount }
}
