'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import AdminConfirmModal, { ConfirmModalAction } from '@/components/AdminConfirmModal'
import WhatsAppDeliveryBadge from '@/components/admin/WhatsAppDeliveryBadge'
import WhatsAppDeliveryDrawer from '@/components/admin/WhatsAppDeliveryDrawer'
import WhatsAppResendModal from '@/components/admin/WhatsAppResendModal'
import OnSiteRegistrationModal from '@/components/admin/OnSiteRegistrationModal'
import { WhatsAppDeliveryStats } from '@/services/dashboard.service'

interface Stats {
  totalCapacity: number
  maxOnlineQuota: number
  totalRegistered: number
  onlineCount: number
  onSiteCount: number
  checkedInCount: number
  cancelledCount: number
  waitlistCount: number
  isRegistrationOpen: boolean
  remainingOnlineQuota: number
  whatsappDeliveryStats?: WhatsAppDeliveryStats
}

interface ParticipantDelivery {
  id: string
  status: string
  total_attempts: number
  last_error_code?: string | null
  updated_at?: string
}

interface Participant {
  id: string
  full_name: string
  whatsapp_number: string
  church_status: string
  church_branch?: string
  is_child: boolean
  qr_token?: string
  status: 'REGISTERED' | 'CHECKED_IN' | 'CANCELLED' | 'WAITLISTED'
  registration_type: 'ONLINE' | 'ON_SITE'
  checked_in_at?: string
  created_at: string
  waitlist_position?: number | null
  delivery?: ParticipantDelivery | null
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [waStatusFilter, setWaStatusFilter] = useState<string>('ALL')
  const [regTypeFilter, setRegTypeFilter] = useState<string>('ALL')
  const [isOnSiteModalOpen, setIsOnSiteModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const reqIdRef = useRef(0)

  const { data: session } = useSession()
  const isMaster = (session?.user as any)?.role === 'MASTER'

  // Toggle Visibility for Admission Mode
  const [showWaStats, setShowWaStats] = useState<boolean>(false)
  const [showWaActions, setShowWaActions] = useState<boolean>(false)

  // Drawer & Resend Modal States
  const [inspectingParticipant, setInspectingParticipant] = useState<{
    id: string
    name: string
  } | null>(null)

  const [resendingParticipant, setResendingParticipant] = useState<{
    id: string
    full_name: string
    whatsapp_number: string
    total_attempts?: number
    last_error_code?: string | null
  } | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (err) {
      console.error(err)
    }
  }, [])

  const handleToggleRegistration = async () => {
    if (!stats) return
    const next = !stats.isRegistrationOpen
    try {
      const res = await fetch('/api/admin/settings/registration', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_registration_open: next }),
      })
      if (res.ok) {
        setActionMsg(next ? 'Pendaftaran dibuka.' : 'Pendaftaran ditutup.')
        fetchStats()
      } else {
        const data = await res.json().catch(() => ({}))
        setActionMsg(data.error || 'Gagal mengubah status pendaftaran.')
      }
    } catch (err: any) {
      setActionMsg(err.message || 'Terjadi kesalahan sistem saat mengubah status pendaftaran.')
    }
  }

  const fetchParticipants = useCallback(async () => {
    const curId = ++reqIdRef.current
    try {
      const query = new URLSearchParams()
      if (search) query.set('search', search)
      if (statusFilter && statusFilter !== 'ALL') query.set('status', statusFilter)
      if (waStatusFilter && waStatusFilter !== 'ALL') query.set('wa_status', waStatusFilter)
      if (regTypeFilter && regTypeFilter !== 'ALL') query.set('registration_type', regTypeFilter)

      const res = await fetch(`/api/admin/participants?${query.toString()}`)
      if (res.ok && reqIdRef.current === curId) {
        const data = await res.json()
        setParticipants(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      if (reqIdRef.current === curId) {
        setLoading(false)
      }
    }
  }, [search, statusFilter, waStatusFilter, regTypeFilter])

  useEffect(() => {
    fetchStats()
    fetchParticipants()
  }, [fetchStats, fetchParticipants])

  const [activeModal, setActiveModal] = useState<{
    action: ConfirmModalAction
    participant: Participant
  } | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const handleOpenCheckInModal = (participant: Participant) => {
    setModalError(null)
    setActiveModal({ action: 'CHECK_IN', participant })
  }

  const handleOpenCancelModal = (participant: Participant) => {
    setModalError(null)
    setActiveModal({ action: 'CANCEL', participant })
  }

  const handleCloseModal = () => {
    if (modalLoading) return
    setActiveModal(null)
    setModalError(null)
  }

  const handleConfirmModalAction = async () => {
    if (!activeModal || modalLoading) return
    const { action, participant } = activeModal

    setModalLoading(true)
    setModalError(null)

    if (action === 'CHECK_IN') {
      try {
        const res = await fetch('/api/admin/checkin', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participant_id: participant.id }),
        })

        if (res.ok) {
          setActiveModal(null)
          setActionMsg(`✓ Manual Check-in berhasil untuk ${participant.full_name}!`)
          fetchStats()
          fetchParticipants()
          setTimeout(() => setActionMsg(''), 4000)
        } else {
          const data = await res.json()
          setModalError(data.error || 'Gagal melakukan check-in manual.')
        }
      } catch (err: any) {
        setModalError(err.message || 'Terjadi kesalahan sistem saat check-in manual.')
      } finally {
        setModalLoading(false)
      }
    } else if (action === 'CANCEL') {
      try {
        const res = await fetch('/api/admin/participants', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participant_id: participant.id }),
        })

        if (res.ok) {
          setActiveModal(null)
          setActionMsg(`✓ Pendaftaran "${participant.full_name}" berhasil dibatalkan! Kuota telah dipulihkan.`)
          fetchStats()
          fetchParticipants()
          setTimeout(() => setActionMsg(''), 4000)
        } else {
          const data = await res.json()
          setModalError(data.error || 'Gagal membatalkan pendaftaran peserta.')
        }
      } catch (err: any) {
        setModalError(err.message || 'Terjadi kesalahan sistem saat membatalkan pendaftaran.')
      } finally {
        setModalLoading(false)
      }
    }
  }

  const handleExportCSV = () => {
    window.open('/api/admin/export', '_blank')
  }

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()

    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: text,
      })

      const data = await res.json()
      if (res.ok) {
        setActionMsg(`✓ Import Berhasil! ${data.importedCount} peserta diimpor, ${data.skippedCount} duplikat dilewati.`)
        fetchStats()
        fetchParticipants()
        setTimeout(() => setActionMsg(''), 5000)
      } else {
        alert(`Gagal Import: ${data.error}`)
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleResendSuccess = (resResult: any) => {
    setActionMsg(`✓ Tiket WhatsApp berhasil dikirim ulang! (ID: ${resResult.whatsappMessageId || 'Sukses'})`)
    fetchStats()
    fetchParticipants()
    setTimeout(() => setActionMsg(''), 5000)
  }

  // Helper determining resend eligibility for table button
  const canResendDelivery = (p: Participant) => {
    if (p.status === 'CANCELLED') return false
    const d = p.delivery
    if (!d) return false
    // Ineligible states: SENT, DELIVERED, READ, PROCESSING, UNKNOWN, quota >= 4
    if (['SENT', 'DELIVERED', 'READ', 'PROCESSING', 'UNKNOWN'].includes(d.status)) return false
    if (d.total_attempts >= 4) return false
    if (['131026', '100', 'CONFIG_ERROR', '2388001', '132000'].includes(d.last_error_code || '')) return false
    return d.status === 'FAILED' || d.status === 'NOT_SENT'
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-800/90 backdrop-blur-md border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black text-white tracking-tight">JKI SHEMA</span>
            <span className="bg-blue-500/20 text-blue-300 text-xs font-bold px-2.5 py-1 rounded-md border border-blue-400/30">
              Admin Portal
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/admin/scanner"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl transition flex items-center gap-2 shadow-lg"
            >
              📷 <span className="hidden sm:inline">QR Scanner (HP)</span>
            </Link>

            <button
              onClick={() => signOut()}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-xs font-semibold px-3 py-2 rounded-xl transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8">
        {/* Action Message Banner */}
        {actionMsg && (
          <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-2xl text-sm font-semibold animate-in fade-in">
            {actionMsg}
          </div>
        )}

        {/* Section 1: Overview Event Registration Stats Cards */}
        {stats && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                Statistik Pendaftaran Acara
              </h2>
              {isMaster && (
                <button
                  type="button"
                  onClick={handleToggleRegistration}
                  className={`text-xs font-bold px-3.5 py-2 rounded-xl transition shadow cursor-pointer ${
                    stats.isRegistrationOpen
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {stats.isRegistrationOpen ? 'Tutup Pendaftaran' : 'Buka Pendaftaran'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
              <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl space-y-1">
                <span className="text-xs text-slate-400 font-semibold uppercase">Total Kapasitas</span>
                <p className="text-2xl font-black text-white">{stats.totalCapacity}</p>
                <p className="text-[10px] text-slate-500">Hard Limit Acara</p>
              </div>

              <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl space-y-1">
                <span className="text-xs text-blue-400 font-semibold uppercase">Terdaftar</span>
                <p className="text-2xl font-black text-blue-400">{stats.totalRegistered}</p>
                <p className="text-[10px] text-slate-500">Online: {stats.onlineCount} | On-site: {stats.onSiteCount}</p>
              </div>

              <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl space-y-1">
                <span className="text-xs text-emerald-400 font-semibold uppercase">Sudah Check-In</span>
                <p className="text-2xl font-black text-emerald-400">{stats.checkedInCount}</p>
                <p className="text-[10px] text-slate-500">Hadir di Lokasi</p>
              </div>

              <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl space-y-1">
                <span className="text-xs text-amber-400 font-semibold uppercase">Belum Check-In</span>
                <p className="text-2xl font-black text-amber-400">{stats.totalRegistered - stats.checkedInCount}</p>
                <p className="text-[10px] text-slate-500">Dalam Pendaftaran</p>
              </div>

              <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl space-y-1">
                <span className="text-xs text-indigo-400 font-semibold uppercase">Sisa Kursi</span>
                <p className="text-2xl font-black text-indigo-400">
                  {Math.max(0, stats.totalCapacity - stats.totalRegistered)}
                </p>
                <p className="text-[10px] text-slate-500">Dari {stats.totalCapacity}</p>
              </div>

              <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl space-y-1">
                <span className="text-xs text-rose-400 font-semibold uppercase">Batal (RSVP)</span>
                <p className="text-2xl font-black text-rose-400">{stats.cancelledCount}</p>
                <p className="text-[10px] text-slate-500">Kuota Terbebas</p>
              </div>

              <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl space-y-1">
                <span className="text-xs text-orange-400 font-semibold uppercase">Daftar Tunggu</span>
                <p className="text-2xl font-black text-orange-400">{stats.waitlistCount}</p>
                <p className="text-[10px] text-slate-500">Menunggu Kuota</p>
              </div>
            </div>
          </div>
        )}

        {/* Section 2: WhatsApp Delivery Monitoring Cards (Collapsible for D-Day Admission) */}
        {stats?.whatsappDeliveryStats && (
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-3xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xs uppercase font-bold text-slate-300 tracking-wider">
                  Monitoring Pengiriman Tiket WhatsApp (Cloud API)
                </h2>
                <span className="text-[10px] text-slate-500 font-medium">
                  ({stats.whatsappDeliveryStats.total} catatan)
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowWaStats((prev) => !prev)}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>{showWaStats ? 'Sembunyikan Statistik WA' : 'Tampilkan Statistik WA'}</span>
                <span className="text-[10px] text-slate-400">{showWaStats ? '▲' : '▼'}</span>
              </button>
            </div>

            {showWaStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 animate-in fade-in duration-200">
                <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-2xl space-y-0.5">
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase">Diterima</span>
                  <p className="text-xl font-black text-emerald-400">{stats.whatsappDeliveryStats.delivered}</p>
                  <p className="text-[9px] text-slate-500">Sampai di HP</p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-2xl space-y-0.5">
                  <span className="text-[10px] text-blue-400 font-semibold uppercase">Dibaca</span>
                  <p className="text-xl font-black text-blue-400">{stats.whatsappDeliveryStats.read}</p>
                  <p className="text-[9px] text-slate-500">Dibuka Peserta</p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-2xl space-y-0.5">
                  <span className="text-[10px] text-sky-400 font-semibold uppercase">Terkirim</span>
                  <p className="text-xl font-black text-sky-400">{stats.whatsappDeliveryStats.sent}</p>
                  <p className="text-[9px] text-slate-500">Server Meta</p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-2xl space-y-0.5">
                  <span className="text-[10px] text-amber-400 font-semibold uppercase">Memproses</span>
                  <p className="text-xl font-black text-amber-400">{stats.whatsappDeliveryStats.processing}</p>
                  <p className="text-[9px] text-slate-500">In-Flight / Lock</p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-2xl space-y-0.5">
                  <span className="text-[10px] text-rose-400 font-semibold uppercase">Gagal</span>
                  <p className="text-xl font-black text-rose-400">{stats.whatsappDeliveryStats.failed}</p>
                  <p className="text-[9px] text-slate-500">Perlu Resend</p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-2xl space-y-0.5">
                  <span className="text-[10px] text-purple-400 font-semibold uppercase">Unresolved</span>
                  <p className="text-xl font-black text-purple-400">{stats.whatsappDeliveryStats.unknown}</p>
                  <p className="text-[9px] text-slate-500">Timeout / Soak</p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-2xl space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Belum Kirim</span>
                  <p className="text-xl font-black text-slate-300">{stats.whatsappDeliveryStats.not_sent}</p>
                  <p className="text-[9px] text-slate-500">Initial</p>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-2xl space-y-0.5">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">Batal WA</span>
                  <p className="text-xl font-black text-slate-400">{stats.whatsappDeliveryStats.cancelled}</p>
                  <p className="text-[9px] text-slate-500">Cancelled</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 3: Data Table Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-4 sm:p-6 space-y-6 shadow-xl">
          {/* Controls / Actions / Filters Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Left: On-Site & CSV Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsOnSiteModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 h-9 shadow cursor-pointer"
              >
                + Registrasi On-Site
              </button>

              <button
                onClick={handleExportCSV}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 h-9"
              >
                📥 Export CSV
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 h-9"
              >
                📤 Import CSV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImportCSV}
              />
            </div>

            {/* Right: Search, Filters & Settings */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Bar */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari Nama / No. WA..."
                className="px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition h-9 w-44 sm:w-52"
              />

              {/* Event Registration Status Filter */}
              <div className="relative">
                <select
                  id="event-status-filter"
                  aria-label="Filter Status Acara"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="appearance-none pl-3.5 pr-8 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition h-9 cursor-pointer"
                >
                  <option value="ALL">Semua Status Acara</option>
                  <option value="REGISTERED">Terdaftar (Belum Check-In)</option>
                  <option value="CHECKED_IN">Sudah Check-In</option>
                  <option value="CANCELLED">Batal / Cancelled</option>
                  <option value="WAITLISTED">Daftar Tunggu (Waitlist)</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>

              {/* WhatsApp Delivery Status Filter */}
              <div className="relative">
                <select
                  id="wa-status-filter"
                  aria-label="Filter Status WhatsApp"
                  value={waStatusFilter}
                  onChange={(e) => setWaStatusFilter(e.target.value)}
                  className="appearance-none pl-3.5 pr-8 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition h-9 cursor-pointer"
                >
                  <option value="ALL">Semua Status WA</option>
                  <option value="DELIVERED">✓ Diterima (Delivered)</option>
                  <option value="READ">✓✓ Dibaca (Read)</option>
                  <option value="SENT">↗ Terkirim (Server Meta)</option>
                  <option value="PROCESSING">⟳ Sedang Memproses</option>
                  <option value="FAILED">✕ Gagal (Failed)</option>
                  <option value="UNKNOWN">? Unresolved (Unknown)</option>
                  <option value="NOT_SENT">○ Belum Dikirim</option>
                  <option value="CANCELLED">⊘ Batal WA (Cancelled)</option>
                  <option value="NO_DELIVERY">Tanpa Rekord WA</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>

              {/* Registration Type Filter (Tipe Pendaftaran) */}
              <div className="relative">
                <select
                  id="reg-type-filter"
                  aria-label="Filter Tipe Pendaftaran"
                  value={regTypeFilter}
                  onChange={(e) => setRegTypeFilter(e.target.value)}
                  className="appearance-none pl-3.5 pr-8 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition h-9 cursor-pointer"
                >
                  <option value="ALL">Semua Tipe Daftar</option>
                  <option value="ONLINE">Online</option>
                  <option value="ON_SITE">On-Site</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>

              {/* WhatsApp Actions Toggle Button (Setting Gear Icon) */}
              <button
                type="button"
                onClick={() => setShowWaActions((prev) => !prev)}
                className={`h-9 w-9 p-0 rounded-xl transition flex items-center justify-center border cursor-pointer ${
                  showWaActions
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 ring-1 ring-blue-500/30'
                    : 'bg-slate-700/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-600'
                }`}
                title={showWaActions ? 'Sembunyikan Opsi WA' : 'Tampilkan Opsi WA'}
                aria-label={showWaActions ? 'Sembunyikan Opsi WA' : 'Tampilkan Opsi WA'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`w-4 h-4 transition-transform duration-200 ${showWaActions ? 'rotate-90 text-blue-400' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span className="sr-only">{showWaActions ? 'Sembunyikan Opsi WA' : 'Tampilkan Opsi WA'}</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">No. WhatsApp</th>
                  <th className="py-3 px-4">Gereja / Cabang</th>
                  <th className="py-3 px-4">Status Acara</th>
                  <th className="py-3 px-4">Status Tiket WA</th>
                  <th className="py-3 px-4">Tipe Daftar</th>
                  <th className="py-3 px-4 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Memuat data peserta...
                    </td>
                  </tr>
                ) : participants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Tidak ada data peserta ditemukan.
                    </td>
                  </tr>
                ) : (
                  participants.map((p) => {
                    const resendAllowed = canResendDelivery(p)
                    return (
                      <tr key={p.id} className="hover:bg-slate-700/30 transition">
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {p.full_name}
                          {p.is_child && (
                            <span className="ml-2 bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
                              Anak
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 font-mono">{p.whatsapp_number}</td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {p.church_status === 'BERGEREJA' ? p.church_branch || 'Berjemaat' : 'Belum Berjemaat'}
                        </td>
                        <td className="py-3.5 px-4">
                          {p.status === 'CHECKED_IN' && (
                            <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">
                              ✓ Checked In
                            </span>
                          )}
                          {p.status === 'REGISTERED' && (
                            <span className="bg-blue-500/20 text-blue-300 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-blue-500/30">
                              Terdaftar
                            </span>
                          )}
                          {p.status === 'CANCELLED' && (
                            <span className="bg-rose-500/20 text-rose-300 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-rose-500/30">
                              Batal
                            </span>
                          )}
                          {p.status === 'WAITLISTED' && (
                            <span className="bg-orange-500/20 text-orange-300 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-orange-500/30">
                              Daftar Tunggu{p.waitlist_position ? ` #${p.waitlist_position}` : ''}
                            </span>
                          )}
                        </td>
                        {/* WhatsApp Delivery Status Column */}
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => setInspectingParticipant({ id: p.id, name: p.full_name })}
                            className="cursor-pointer hover:opacity-80 transition focus:outline-none"
                            title="Klik untuk inspeksi riwayat WhatsApp"
                          >
                            <WhatsAppDeliveryBadge
                              status={p.delivery?.status || null}
                              totalAttempts={p.delivery?.total_attempts}
                              lastErrorCode={p.delivery?.last_error_code}
                              showAttemptCount={true}
                            />
                          </button>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-[10px] uppercase font-bold text-slate-400">
                            {p.registration_type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {/* Primary Admission Actions: Check-in & Cancel Buttons */}
                            {p.status === 'REGISTERED' && (
                              <>
                                <button
                                  onClick={() => handleOpenCheckInModal(p)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg shadow transition cursor-pointer"
                                >
                                  Check-In Manual
                                </button>
                                <button
                                  onClick={() => handleOpenCancelModal(p)}
                                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg shadow transition cursor-pointer"
                                >
                                  Batalkan
                                </button>
                              </>
                            )}

                            {/* Secondary Technical WhatsApp Actions: Resend & Inspect (Collapsible) */}
                            {showWaActions && (
                              <div className="flex items-center gap-1 pl-1 border-l border-slate-700 animate-in fade-in duration-150">
                                {resendAllowed && (
                                  <button
                                    onClick={() =>
                                      setResendingParticipant({
                                        id: p.id,
                                        full_name: p.full_name,
                                        whatsapp_number: p.whatsapp_number,
                                        total_attempts: p.delivery?.total_attempts || 0,
                                        last_error_code: p.delivery?.last_error_code,
                                      })
                                    }
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg shadow transition cursor-pointer flex items-center gap-1"
                                    title="Kirim ulang tiket WhatsApp"
                                  >
                                    <span>Resend</span>
                                  </button>
                                )}

                                <button
                                  onClick={() => setInspectingParticipant({ id: p.id, name: p.full_name })}
                                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-semibold text-[11px] px-2 py-1.5 rounded-lg transition cursor-pointer"
                                  title="Lihat riwayat WAMID dan percobaan pengiriman"
                                >
                                  Inspect
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Confirmation Modal for Check-In & Cancel */}
      <AdminConfirmModal
        isOpen={activeModal !== null}
        action={activeModal?.action || null}
        participant={activeModal?.participant || null}
        isLoading={modalLoading}
        errorMessage={modalError}
        onClose={handleCloseModal}
        onConfirm={handleConfirmModalAction}
      />

      {/* WhatsApp Delivery Detail Drawer */}
      <WhatsAppDeliveryDrawer
        isOpen={inspectingParticipant !== null}
        participantId={inspectingParticipant?.id || null}
        participantName={inspectingParticipant?.name || null}
        onClose={() => setInspectingParticipant(null)}
      />

      {/* WhatsApp Resend Modal */}
      <WhatsAppResendModal
        isOpen={resendingParticipant !== null}
        participant={resendingParticipant}
        onClose={() => setResendingParticipant(null)}
        onSuccess={handleResendSuccess}
      />

      {/* On-Site Registration Modal */}
      <OnSiteRegistrationModal
        isOpen={isOnSiteModalOpen}
        onClose={() => setIsOnSiteModalOpen(false)}
        onSuccess={(result) => {
          setActionMsg(`✓ Registrasi On-Site berhasil untuk ${result.data?.length || 1} peserta!`)
          fetchStats()
          fetchParticipants()
          setTimeout(() => setActionMsg(''), 5000)
        }}
      />
    </div>
  )
}
