'use client'

import React from 'react'
import { WhatsAppDeliveryStatus } from '@prisma/client'

export interface WhatsAppDeliveryBadgeProps {
  status?: WhatsAppDeliveryStatus | string | null
  totalAttempts?: number
  lastErrorCode?: string | null
  className?: string
  showAttemptCount?: boolean
}

export interface BadgeConfig {
  label: string
  bg: string
  text: string
  border: string
  icon: string
  tooltip: string
  accessibleDescription: string
}

export function getDeliveryBadgeConfig(status?: WhatsAppDeliveryStatus | string | null): BadgeConfig {
  switch (status) {
    case 'DELIVERED':
      return {
        label: 'Diterima',
        bg: 'bg-emerald-500/20',
        text: 'text-emerald-300',
        border: 'border-emerald-500/30',
        icon: '✓',
        tooltip: 'Tiket berhasil sampai di perangkat WhatsApp peserta.',
        accessibleDescription: 'Status pengiriman WhatsApp: Diterima oleh perangkat penerima.',
      }
    case 'READ':
      return {
        label: 'Dibaca',
        bg: 'bg-blue-500/20',
        text: 'text-blue-300',
        border: 'border-blue-500/30',
        icon: '✓✓',
        tooltip: 'Peserta telah membuka pesan tiket di WhatsApp.',
        accessibleDescription: 'Status pengiriman WhatsApp: Pesan telah dibaca oleh penerima.',
      }
    case 'SENT':
      return {
        label: 'Terkirim (Server Meta)',
        bg: 'bg-sky-500/20',
        text: 'text-sky-300',
        border: 'border-sky-500/30',
        icon: '↗',
        tooltip: 'Pesan telah diterima server Meta WhatsApp, sedang diteruskan ke perangkat penerima.',
        accessibleDescription: 'Status pengiriman WhatsApp: Diterima oleh server Meta, belum tentu sampai ke perangkat tujuan.',
      }
    case 'PROCESSING':
      return {
        label: 'Memproses',
        bg: 'bg-amber-500/20',
        text: 'text-amber-300',
        border: 'border-amber-500/30',
        icon: '⟳',
        tooltip: 'Sistem sedang membuat QR frame dan mengirimkan media ke Meta.',
        accessibleDescription: 'Status pengiriman WhatsApp: Sedang dalam proses pengiriman.',
      }
    case 'NOT_SENT':
      return {
        label: 'Belum Dikirim',
        bg: 'bg-slate-700/50',
        text: 'text-slate-300',
        border: 'border-slate-600',
        icon: '○',
        tooltip: 'Pendaftaran selesai, tiket belum dikirimkan melalui WhatsApp.',
        accessibleDescription: 'Status pengiriman WhatsApp: Belum pernah dikirim.',
      }
    case 'PENDING':
      return {
        label: 'Menunggu Antrean',
        bg: 'bg-slate-800/80',
        text: 'text-slate-300',
        border: 'border-slate-600/60',
        icon: '⏳',
        tooltip: 'Tiket dalam antrean dispatcher untuk dikirimkan melalui WhatsApp.',
        accessibleDescription: 'Status pengiriman WhatsApp: Menunggu antrean pengiriman.',
      }
    case 'FAILED':
      return {
        label: 'Gagal',
        bg: 'bg-rose-500/20',
        text: 'text-rose-300',
        border: 'border-rose-500/30',
        icon: '✕',
        tooltip: 'Pengiriman tiket WhatsApp gagal. Periksa nomor atau alasan penolakan.',
        accessibleDescription: 'Status pengiriman WhatsApp: Pengiriman gagal.',
      }
    case 'UNKNOWN':
      return {
        label: 'Unresolved (Perlu Cek)',
        bg: 'bg-purple-500/20',
        text: 'text-purple-300',
        border: 'border-purple-500/30',
        icon: '?',
        tooltip: 'Status belum dapat dipastikan karena timeout koneksi. Dilarang kirim ulang buta!',
        accessibleDescription: 'Status pengiriman WhatsApp: Ambigu atau timeout. Memerlukan verifikasi manual sebelum dapat dikirim ulang.',
      }
    case 'CANCELLED':
      return {
        label: 'Dibatalkan',
        bg: 'bg-slate-800',
        text: 'text-slate-400',
        border: 'border-slate-700',
        icon: '⊘',
        tooltip: 'Pengiriman dibatalkan oleh sistem atau admin.',
        accessibleDescription: 'Status pengiriman WhatsApp: Dibatalkan.',
      }
    default:
      return {
        label: 'Tanpa Data',
        bg: 'bg-slate-800',
        text: 'text-slate-500',
        border: 'border-slate-700/50',
        icon: '—',
        tooltip: 'Belum ada catatan pengiriman WhatsApp untuk peserta ini.',
        accessibleDescription: 'Status pengiriman WhatsApp: Belum ada catatan pengiriman.',
      }
  }
}

export default function WhatsAppDeliveryBadge({
  status,
  totalAttempts,
  lastErrorCode,
  className = '',
  showAttemptCount = false,
}: WhatsAppDeliveryBadgeProps) {
  const config = getDeliveryBadgeConfig(status)

  return (
    <span
      role="status"
      aria-label={config.accessibleDescription}
      title={
        lastErrorCode
          ? `${config.tooltip} (Kode Error: ${lastErrorCode})`
          : config.tooltip
      }
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition select-none ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      <span aria-hidden="true" className={status === 'PROCESSING' ? 'animate-spin' : ''}>
        {config.icon}
      </span>
      <span>{config.label}</span>
      {showAttemptCount && totalAttempts && totalAttempts > 1 ? (
        <span
          aria-label={`Percobaan ke-${totalAttempts}`}
          className="ml-1 px-1.5 py-0.2 bg-slate-900/40 rounded text-[9px] font-bold"
        >
          #{totalAttempts}
        </span>
      ) : null}
    </span>
  )
}
