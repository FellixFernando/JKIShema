'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, UserPlus, CheckCircle2 } from 'lucide-react'

export interface OnSiteParticipantItem {
  full_name: string
  whatsapp_number: string
  church_status: 'BERGEREJA' | 'TIDAK_BERGEREJA'
  church_branch: string
  is_child: boolean
  is_wa_opt_in: boolean
}

export interface OnSiteRegistrationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (result: any) => void
}

const CHURCH_BRANCH_OPTIONS = [
  'JKI Shema Sunter, Jakarta',
  'JKI Shema Pontianak',
  'JKI Shema Gn. Sindur',
  'JKI Shema MMC, Kelapa Gading',
  'Gereja Lain',
]

export default function OnSiteRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
}: OnSiteRegistrationModalProps) {
  const [participants, setParticipants] = useState<OnSiteParticipantItem[]>([
    {
      full_name: '',
      whatsapp_number: '',
      church_status: 'BERGEREJA',
      church_branch: '',
      is_child: false,
      is_wa_opt_in: false,
    },
  ])
  const [immediateCheckIn, setImmediateCheckIn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setParticipants([
        {
          full_name: '',
          whatsapp_number: '',
          church_status: 'BERGEREJA',
          church_branch: '',
          is_child: false,
          is_wa_opt_in: false,
        },
      ])
      setImmediateCheckIn(false)
      setLoading(false)
      setErrorMessage(null)
      return
    }
  }, [isOpen])

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

  if (!isOpen) return null

  const handleAddParticipant = () => {
    setParticipants([
      ...participants,
      {
        full_name: '',
        whatsapp_number: '',
        church_status: 'BERGEREJA',
        church_branch: '',
        is_child: false,
        is_wa_opt_in: false,
      },
    ])
  }

  const handleRemoveParticipant = (index: number) => {
    if (participants.length === 1) return
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const updateParticipant = (
    index: number,
    fieldOrUpdates: keyof OnSiteParticipantItem | Partial<OnSiteParticipantItem>,
    value?: any
  ) => {
    setParticipants((prev) => {
      const updated = [...prev]
      const updates = typeof fieldOrUpdates === 'string' ? { [fieldOrUpdates]: value } : fieldOrUpdates

      if (updates.church_status && updates.church_status === 'TIDAK_BERGEREJA') {
        updated[index] = { ...updated[index], ...updates, church_branch: '' }
      } else {
        updated[index] = { ...updated[index], ...updates }
      }
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    // Client-side Validation
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i]
      if (!p.full_name.trim()) {
        setErrorMessage(`Nama lengkap untuk Peserta #${i + 1} wajib diisi.`)
        return
      }
      if (i === 0 && !p.whatsapp_number.trim()) {
        setErrorMessage('Nomor WhatsApp Pendaftar Utama wajib diisi.')
        return
      }
      if (!p.is_child && !p.whatsapp_number.trim()) {
        setErrorMessage(`Nomor WhatsApp untuk Peserta #${i + 1} (${p.full_name}) wajib diisi.`)
        return
      }
      if (p.church_status === 'BERGEREJA' && !p.church_branch) {
        setErrorMessage(`Gereja / Cabang untuk Peserta #${i + 1} wajib dipilih.`)
        return
      }
      if (!p.is_wa_opt_in) {
        setErrorMessage(`Persetujuan WhatsApp wajib dicentang untuk Peserta #${i + 1}.`)
        return
      }
    }

    setLoading(true)
    try {
      const payload = {
        participants: participants.map((p) => ({
          full_name: p.full_name.trim(),
          whatsapp_number: p.whatsapp_number.trim(),
          church_status: p.church_status,
          church_branch: p.church_branch ? p.church_branch.trim() : null,
          is_child: p.is_child,
          is_wa_opt_in: p.is_wa_opt_in,
        })),
        immediate_checkin: immediateCheckIn,
      }

      const res = await fetch('/api/admin/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        setErrorMessage(data.error || 'Gagal melakukan pendaftaran on-site.')
        setLoading(false)
        return
      }

      onSuccess(data)
      onClose()
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat mendaftarkan on-site.')
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onsite-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                <UserPlus className="w-5 h-5" />
              </span>
              <h2 id="onsite-modal-title" className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Registrasi Peserta On-Site
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Pendaftaran langsung di lokasi acara oleh panitia. Data dicatat sebagai tipe <span className="font-semibold text-emerald-400">ON_SITE</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
            aria-label="Tutup modal"
          >
            ✕
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs px-4 py-3 rounded-2xl flex items-start gap-2">
            <span className="text-rose-400 font-bold">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <div className="space-y-4">
            {participants.map((p, idx) => (
              <div
                key={idx}
                className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 sm:p-5 space-y-4 relative"
              >
                {/* Participant Card Header */}
                <div className="flex items-center justify-between border-b border-slate-700/40 pb-2.5">
                  <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                    {idx === 0 ? '👤 Pendaftar Utama' : `👥 Peserta Tambahan #${idx + 1}`}
                  </span>
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveParticipant(idx)}
                      disabled={loading}
                      className="text-rose-400 hover:text-rose-300 text-xs flex items-center gap-1 transition px-2 py-1 rounded hover:bg-rose-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>

                {/* Full Name */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Nama Lengkap <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={p.full_name}
                    onChange={(e) => updateParticipant(idx, 'full_name', e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    disabled={loading}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                  />
                </div>

                {/* Child Checkbox (for additional participants) */}
                {idx > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={p.is_child}
                      onChange={(e) => {
                        const checked = e.target.checked
                        updateParticipant(idx, {
                          is_child: checked,
                          ...(checked ? { whatsapp_number: participants[0].whatsapp_number } : {}),
                        })
                      }}
                      disabled={loading}
                      className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900"
                    />
                    <span className="text-xs text-slate-300">
                      Peserta ini adalah Anak (Nomor WA disamakan dengan Pendaftar Utama)
                    </span>
                  </label>
                )}

                {/* WhatsApp Number */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Nomor WhatsApp <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required={!p.is_child}
                    disabled={loading || (idx > 0 && p.is_child)}
                    value={idx > 0 && p.is_child ? participants[0].whatsapp_number : p.whatsapp_number}
                    onChange={(e) => updateParticipant(idx, 'whatsapp_number', e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50 disabled:bg-slate-900/40"
                  />
                  {idx > 0 && p.is_child && (
                    <p className="text-[10px] text-slate-400">
                      Menggunakan nomor WhatsApp pendaftar utama.
                    </p>
                  )}
                </div>

                {/* Church Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Status Gereja <span className="text-rose-400">*</span>
                    </label>
                    <select
                      aria-label={`Status Gereja Peserta #${idx + 1}`}
                      value={p.church_status}
                      onChange={(e) => updateParticipant(idx, 'church_status', e.target.value)}
                      disabled={loading}
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                    >
                      <option value="BERGEREJA">Bergereja</option>
                      <option value="TIDAK_BERGEREJA">Belum / Tidak Bergereja</option>
                    </select>
                  </div>

                  {p.church_status === 'BERGEREJA' && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300 block">
                        Gereja / Cabang <span className="text-rose-400">*</span>
                      </label>
                      <select
                        aria-label={`Gereja Cabang Peserta #${idx + 1}`}
                        value={p.church_branch}
                        onChange={(e) => updateParticipant(idx, 'church_branch', e.target.value)}
                        disabled={loading}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
                      >
                        <option value="">-- Pilih Gereja / Cabang --</option>
                        {CHURCH_BRANCH_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* WhatsApp Opt-in Checkbox */}
                <label className="flex items-start gap-2 cursor-pointer pt-1" htmlFor={`wa-optin-${idx}`}>
                  <input
                    id={`wa-optin-${idx}`}
                    type="checkbox"
                    required
                    aria-label={`Persetujuan WhatsApp Peserta #${idx + 1}`}
                    checked={p.is_wa_opt_in}
                    onChange={(e) => updateParticipant(idx, 'is_wa_opt_in', e.target.checked)}
                    disabled={loading}
                    className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900"
                  />
                  <span className="text-xs text-slate-300">
                    Peserta setuju menerima tiket QR dan notifikasi acara melalui WhatsApp. <span className="text-rose-400">*</span>
                  </span>
                </label>
              </div>
            ))}
          </div>

          {/* Add Additional Participant Button */}
          <button
            type="button"
            onClick={handleAddParticipant}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 border border-dashed border-slate-700 hover:border-slate-600 rounded-2xl text-blue-400 hover:text-blue-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Anggota Keluarga / Peserta Tambahan</span>
          </button>

          {/* Immediate Check-In Toggle */}
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3">
            <input
              id="immediate-checkin"
              type="checkbox"
              checked={immediateCheckIn}
              onChange={(e) => setImmediateCheckIn(e.target.checked)}
              disabled={loading}
              className="mt-1 rounded border-emerald-500/50 text-emerald-600 focus:ring-emerald-500 bg-slate-900 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="immediate-checkin" className="cursor-pointer space-y-0.5">
              <span className="text-xs font-bold text-emerald-300 block">
                Langsung Check-In di Tempat
              </span>
              <span className="text-[11px] text-slate-400 block">
                Jika dicentang, seluruh peserta dalam formulir ini langsung berstatus <strong>CHECKED_IN</strong> (Hadir di lokasi).
              </span>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-lg shadow-emerald-900/30 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <span className="animate-spin text-sm">⟳</span>
                  <span>Mendaftarkan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Daftarkan On-Site ({participants.length} Peserta)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
