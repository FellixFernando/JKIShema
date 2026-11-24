'use client'

import React, { useEffect, useState, useRef } from 'react'
import WhatsAppDeliveryBadge from './WhatsAppDeliveryBadge'

export interface WhatsAppDeliveryDrawerProps {
  isOpen: boolean
  participantId: string | null
  participantName?: string | null
  onClose: () => void
}

export interface DeliveryAttemptData {
  id: string
  attempt_number: number
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT_UNKNOWN'
  meta_message_id: string | null
  admin_username: string | null
  resend_reason: string | null
  error_code: string | null
  error_message: string | null
  request_started_at: string
  response_received_at: string | null
}

export interface ReconciliationLogData {
  id: string
  action: string
  reason: string
  admin_username: string
  previous_status: string
  resulting_status: string
  created_at: string
}

export interface DeliveryDetailData {
  id: string
  participant_id: string
  participant_name: string
  recipient_phone: string
  status: string
  total_attempts: number
  processing_started_at: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
  unknown_at: string | null
  last_error_code: string | null
  last_error_message: string | null
  attempts: DeliveryAttemptData[]
  reconciliations: ReconciliationLogData[]
}

export default function WhatsAppDeliveryDrawer({
  isOpen,
  participantId,
  participantName,
  onClose,
}: WhatsAppDeliveryDrawerProps) {
  const [data, setData] = useState<DeliveryDetailData | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedWamid, setCopiedWamid] = useState<string | null>(null)
  const currentReqIdRef = useRef<string | null>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let isMounted = true

    if (!isOpen || !participantId) {
      setData(null)
      setError(null)
      setLoading(false)
      currentReqIdRef.current = null
      return
    }

    const currentId = participantId
    currentReqIdRef.current = currentId
    setLoading(true)
    setError(null)
    setData(null)

    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/admin/delivery/${currentId}`)

        // Prevent stale requests from overwriting data for a newly selected participant or after unmount
        if (!isMounted || currentReqIdRef.current !== currentId) return

        if (!res.ok) {
          if (!isMounted || currentReqIdRef.current !== currentId) return
          if (res.status === 401 || res.status === 403) {
            setError('Sesi login telah kedaluwarsa atau Anda tidak memiliki akses.')
          } else if (res.status === 404) {
            setError('Catatan pengiriman WhatsApp belum tersedia untuk peserta ini.')
          } else {
            const errData = await res.json().catch(() => ({}))
            if (isMounted && currentReqIdRef.current === currentId) {
              setError(errData.error || `Gagal memuat detail pengiriman (${res.status}).`)
            }
          }
          return
        }

        const deliveryData = await res.json()
        if (isMounted && currentReqIdRef.current === currentId) {
          setData(deliveryData)
        }
      } catch (err: any) {
        if (isMounted && currentReqIdRef.current === currentId) {
          setError(err?.message || 'Terjadi kesalahan jaringan saat mengambil data.')
        }
      } finally {
        if (isMounted && currentReqIdRef.current === currentId) {
          setLoading(false)
        }
      }
    }

    fetchDetail()

    return () => {
      isMounted = false
      currentReqIdRef.current = null
    }
  }, [isOpen, participantId])

  // ESC key handler for accessibility
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleCopyWamid = (wamid: string) => {
    if (!wamid) return
    navigator.clipboard?.writeText(wamid)
    setCopiedWamid(wamid)
    setTimeout(() => {
      setCopiedWamid(null)
    }, 2000)
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      className="fixed inset-0 z-50 overflow-hidden bg-slate-950/80 backdrop-blur-sm transition-opacity animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          ref={drawerRef}
          className="w-screen max-w-lg bg-slate-900 border-l border-slate-800 text-slate-100 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
            <div>
              <h2 id="drawer-title" className="text-lg font-bold text-white flex items-center gap-2">
                Inspeksi WhatsApp Tiket
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {participantName || data?.participant_name || 'Detail Pengiriman'}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Tutup panel inspeksi"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition"
            >
              ✕
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Memuat riwayat pengiriman...</p>
              </div>
            ) : error ? (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-2xl text-xs space-y-2">
                <p className="font-semibold">Perhatian</p>
                <p>{error}</p>
              </div>
            ) : data ? (
              <>
                {/* Summary Card */}
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Status Agregat</span>
                    <WhatsAppDeliveryBadge
                      status={data.status}
                      totalAttempts={data.total_attempts}
                      lastErrorCode={data.last_error_code}
                      showAttemptCount={true}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-700/50">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Tujuan WA</span>
                      <span className="text-slate-200 font-mono font-medium">{data.recipient_phone}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Percobaan</span>
                      <span className="text-slate-200 font-semibold">{data.total_attempts}x (Maks: 4x)</span>
                    </div>
                  </div>

                  {data.last_error_message && (
                    <div className="pt-2 border-t border-slate-700/50 text-[11px] text-rose-300">
                      <span className="font-semibold">Error Terakhir:</span> {data.last_error_message}
                    </div>
                  )}
                </div>

                {/* Attempt History Section */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Riwayat Percobaan Pengiriman ({data.attempts?.length || 0})
                  </h3>

                  {data.attempts && data.attempts.length > 0 ? (
                    <div className="space-y-3">
                      {data.attempts.map((att) => (
                        <div
                          key={att.id}
                          className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3.5 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white flex items-center gap-1.5">
                              Percobaan #{att.attempt_number}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                att.status === 'SUCCESS'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : att.status === 'FAILED'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {att.status}
                            </span>
                          </div>

                          {/* WAMID & Copy Action */}
                          {att.meta_message_id && (
                            <div className="flex items-center justify-between bg-slate-900/60 p-2 rounded-lg text-[11px] font-mono">
                              <span className="truncate max-w-[280px] text-slate-300 select-all">
                                {att.meta_message_id}
                              </span>
                              <button
                                onClick={() => handleCopyWamid(att.meta_message_id!)}
                                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 ml-2 cursor-pointer transition"
                              >
                                {copiedWamid === att.meta_message_id ? '✓ Tersalin' : 'Salin'}
                              </button>
                            </div>
                          )}

                          {/* Admin Resend Audit Details */}
                          {att.resend_reason && (
                            <div className="bg-slate-900/30 p-2 rounded border border-slate-800 text-[11px] space-y-1">
                              <div className="text-slate-400">
                                Inisiator: <span className="text-slate-200 font-semibold">{att.admin_username || 'Admin'}</span>
                              </div>
                              <div className="text-slate-300 italic">
                                &ldquo;{att.resend_reason}&rdquo;
                              </div>
                            </div>
                          )}

                          {/* Error diagnostics */}
                          {att.error_message && (
                            <div className="text-[11px] text-rose-400">
                              <span className="font-bold">Error ({att.error_code || 'Code N/A'}):</span>{' '}
                              {att.error_message}
                            </div>
                          )}

                          <div className="text-[10px] text-slate-500 flex justify-between pt-1">
                            <span>Mulai: {new Date(att.request_started_at).toLocaleTimeString('id-ID')}</span>
                            {att.response_received_at && (
                              <span>Selesai: {new Date(att.response_received_at).toLocaleTimeString('id-ID')}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic py-2">Belum ada riwayat percobaan pengiriman.</p>
                  )}
                </div>

                {/* Human Reconciliation History */}
                {data.reconciliations && data.reconciliations.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Audit Rekonsiliasi Manual ({data.reconciliations.length})
                    </h3>
                    <div className="space-y-2">
                      {data.reconciliations.map((rec) => (
                        <div key={rec.id} className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/30 text-xs space-y-1">
                          <div className="flex justify-between font-semibold text-slate-200">
                            <span>{rec.action}</span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(rec.created_at).toLocaleDateString('id-ID')}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 italic">&ldquo;{rec.reason}&rdquo;</p>
                          <p className="text-[10px] text-slate-500">Oleh: {rec.admin_username}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500 text-center py-8">Pilih peserta untuk melihat detail pengiriman.</p>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-800/30 flex justify-end">
            <button
              onClick={onClose}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl transition"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
