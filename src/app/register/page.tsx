'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [waNumber, setWaNumber] = useState('')
  const [churchStatus, setChurchStatus] = useState<'BERGEREJA' | 'TIDAK_BERGEREJA'>('BERGEREJA')
  const [churchBranch, setChurchBranch] = useState('')
  const [isWaOptIn, setIsWaOptIn] = useState(true)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successData, setSuccessData] = useState<any>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (!isWaOptIn) {
      setErrorMsg('Anda harus menyetujui pengiriman konfirmasi via WhatsApp untuk mendaftar.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          whatsapp_number: waNumber,
          church_status: churchStatus,
          church_branch: churchStatus === 'BERGEREJA' ? churchBranch : undefined,
          is_wa_opt_in: isWaOptIn,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Gagal melakukan pendaftaran.')
      }

      setSuccessData(data.data)
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (successData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full p-8 rounded-3xl shadow-xl border border-slate-100 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto">
            ✓
          </div>
          <h1 className="text-2xl font-black text-slate-900">Pendaftaran Berhasil!</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Terima kasih, <strong className="text-slate-900">{successData.full_name}</strong>! Tiket QR Code unik Anda telah berhasil dibuat.
          </p>

          <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kode Tiket QR Anda</p>
            <div className="font-mono font-bold text-sm bg-white p-3 rounded-xl border border-slate-200 text-blue-900 break-all select-all">
              {successData.qr_token}
            </div>
            <p className="text-xs text-slate-500">
              *QR Code ini juga telah dikirimkan ke WhatsApp <span className="font-bold">{successData.whatsapp_number}</span>.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-3">
            <Link
              href="/"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-3.5 rounded-xl transition shadow-md"
            >
              Kembali ke Halaman Utama
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 flex items-center justify-center">
      <div className="bg-white max-w-lg w-full p-6 sm:p-10 rounded-3xl shadow-xl border border-slate-100 space-y-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Christmas Celebration</span>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Form Pendaftaran</h1>
          </div>
          <Link
            href="/"
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg transition"
          >
            ← Kembali
          </Link>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Full Name */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Nama Lengkap <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Masukkan nama lengkap Anda"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition"
            />
          </div>

          {/* WA Number */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Nomor WhatsApp <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              value={waNumber}
              onChange={(e) => setWaNumber(e.target.value)}
              placeholder="Contoh: 081234567890"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition"
            />
          </div>

          {/* Church Status */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Status Bergereja <span className="text-red-500">*</span>
            </label>
            <select
              value={churchStatus}
              onChange={(e) => setChurchStatus(e.target.value as any)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition"
            >
              <option value="BERGEREJA">Bergereja</option>
              <option value="TIDAK_BERGEREJA">Tidak Bergereja</option>
            </select>
          </div>

          {/* Church Branch (shown if BERGEREJA) */}
          {churchStatus === 'BERGEREJA' && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Nama Gereja / Cabang <span className="text-slate-400 font-normal">(Opsional)</span>
              </label>
              <input
                type="text"
                value={churchBranch}
                onChange={(e) => setChurchBranch(e.target.value)}
                placeholder="Misal: JKI Shema Pusat / Gereja Lain"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition"
              />
            </div>
          )}

          {/* WhatsApp Opt-in Consent */}
          <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
            <input
              type="checkbox"
              id="optin"
              checked={isWaOptIn}
              onChange={(e) => setIsWaOptIn(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="optin" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
              Saya menyetujui pengiriman pesan konfirmasi, pengiriman tiket QR Code, serta pengingat acara melalui WhatsApp. <span className="text-red-500 font-bold">*Wajib</span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-base py-3.5 rounded-xl shadow-lg transition disabled:opacity-50"
          >
            {loading ? 'Memproses Pendaftaran...' : 'Daftar Sekarang'}
          </button>
        </form>

        {/* Contact Us Redirect */}
        <div className="pt-4 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500 mb-2">Punya pertanyaan seputar acara?</p>
          <a
            href="https://wa.me/6281234567890?text=Halo%20Admin,%20saya%20ingin%20bertanya%20seputar%20pendaftaran%20Christmas%20Celebration"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg transition"
          >
            💬 Contact Us via WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}
