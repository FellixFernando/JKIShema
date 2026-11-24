'use client'

import React, { useState, useEffect, useRef } from 'react'

export interface WhatsAppResendModalProps {
  isOpen: boolean
  participant: {
    id: string
    full_name: string
    whatsapp_number: string
    total_attempts?: number
    last_error_code?: string | null
  } | null
  onClose: () => void
  onSuccess: (result: any) => void
}

export default function WhatsAppResendModal({
  isOpen,
  participant,
  onClose,
  onSuccess,
}: WhatsAppResendModalProps) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isOpen || !participant) {
      setReason('')
      setLoading(false)
      setErrorMessage(null)
      setWarningMessage(null)
      return
    }

    setReason('')
    setLoading(false)
    setErrorMessage(null)

    // Focus input after open
    const timer = setTimeout(() => {
      textareaRef.current?.focus()
    }, 50)

    return () => clearTimeout(timer)
  }, [isOpen, participant])

  // ESC key handler for accessibility
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, loading, onClose])

  if (!isOpen || !participant) return null

  const trimmedReason = reason.trim()
  const isReasonValid = trimmedReason.length >= 5
  const attemptsCount = participant.total_attempts || 1
  const remainingQuota = Math.max(0, 4 - attemptsCount)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isReasonValid || loading) return

    setLoading(true)
    setErrorMessage(null)
    setWarningMessage(null)

    try {
      const res = await fetch(`/api/admin/delivery/${participant.id}/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: trimmedReason,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.status === 200 && data.success) {
        onSuccess(data)
        onClose()
        return
      }

      // Handle specific HTTP error semantics
      switch (res.status) {
        case 400:
          setErrorMessage(data.message || 'Alasan resend tidak valid (minimal 5 karakter).')
          break
        case 401:
        case 403:
          setErrorMessage('Sesi telah kedaluwarsa atau Anda tidak memiliki hak akses untuk resend.')
          break
        case 409:
          if (data.errorCode === 'LOCK_HELD') {
            setErrorMessage('Pengiriman sedang dalam proses oleh admin lain. Harap tunggu.')
          } else if (data.errorCode === 'ALREADY_DELIVERED') {
            setErrorMessage('Tiket sudah berhasil dikirim atau diterima oleh peserta.')
          } else if (data.errorCode === 'UNKNOWN_SOAK_ACTIVE') {
            setErrorMessage('Status pengiriman UNKNOWN (menunggu soak window 15 menit atau rekonsiliasi manual). Dilarang kirim ulang buta!')
          } else {
            setErrorMessage(data.details || data.message || 'Konflik status pengiriman.')
          }
          break
        case 422:
          setErrorMessage(data.details || data.message || 'Peserta tidak memenuhi syarat atau nomor tidak valid di WhatsApp.')
          break
        case 429:
          setErrorMessage(data.details || data.message || 'Batas kuota resend tercapai atau cooldown rate-limit aktif.')
          break
        case 502:
          setErrorMessage(`Meta WhatsApp menolak pengiriman template: ${data.details || data.message || 'Bad Gateway'}`)
          break
        case 504:
          setErrorMessage(null)
          setWarningMessage(
            'PERINGATAN (504 Timeout): Koneksi Meta WhatsApp terputus sebelum konfirmasi diterima. Status pengiriman menjadi UNKNOWN. DILARANG mencoba kirim ulang buta sampai status diverifikasi!'
          )
          break
        default:
          setErrorMessage(data.details || data.message || `Terjadi kesalahan saat memproses resend (${res.status}).`)
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi gangguan jaringan saat menghubungi server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resend-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose()
        }
      }}
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl text-slate-100 space-y-5 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 id="resend-modal-title" className="text-base font-bold text-white flex items-center gap-2">
              Kirim Ulang Tiket WhatsApp
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Konfirmasi pengiriman ulang manual</p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="Batal dan tutup modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Participant Summary Card */}
        <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4 text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400 font-medium">Nama Peserta:</span>
            <span className="text-white font-bold">{participant.full_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400 font-medium">No. WhatsApp:</span>
            <span className="text-slate-200 font-mono font-medium">{participant.whatsapp_number}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-slate-700/50">
            <span className="text-slate-400 font-medium">Sisa Kuota Resend:</span>
            <span className="text-amber-300 font-bold">{remainingQuota}x lagi (Maks: 3x manual)</span>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3.5 py-2.5 rounded-xl text-[11px] leading-relaxed">
          Tindakan ini akan membuat percobaan pengiriman baru di server Meta WhatsApp. Pastikan nomor tujuan telah diverifikasi aktif.
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div role="alert" className="bg-rose-500/15 border border-rose-500/40 text-rose-300 p-3 rounded-xl text-xs space-y-1">
            <p className="font-bold">Gagal Mengirim Ulang</p>
            <p className="text-[11px]">{errorMessage}</p>
          </div>
        )}

        {/* Timeout / Unresolved Warning Alert */}
        {warningMessage && (
          <div role="alert" className="bg-purple-500/15 border border-purple-500/40 text-purple-200 p-3 rounded-xl text-xs space-y-1">
            <p className="font-bold">Status Ambigu (UNKNOWN)</p>
            <p className="text-[11px]">{warningMessage}</p>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="resend-reason" className="block text-xs font-semibold text-slate-300">
              Alasan Resend <span className="text-rose-400">*</span>
            </label>
            <textarea
              id="resend-reason"
              ref={textareaRef}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              placeholder="Contoh: Peserta mengonfirmasi nomor aktif via telepon, QR frame dikirim ulang."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 transition resize-none"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Wajib diisi minimal 5 karakter untuk audit</span>
              <span className={trimmedReason.length >= 5 ? 'text-emerald-400' : 'text-slate-500'}>
                {trimmedReason.length} / 5
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!isReasonValid || loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Mengirim ke Meta...</span>
                </>
              ) : (
                <span>Konfirmasi & Kirim Ulang</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
