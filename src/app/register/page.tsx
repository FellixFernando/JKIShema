'use client'

import { useState } from 'react'
import Link from 'next/link'
import TicketCard from '@/components/TicketCard'
import { CheckCircle2, Info, ArrowLeft, Plus, Trash2, MessageCircle } from 'lucide-react'

interface ParticipantFormItem {
  full_name: string
  whatsapp_number: string
  church_status: 'BERGEREJA' | 'TIDAK_BERGEREJA'
  church_branch: string
  is_child: boolean
  is_wa_opt_in: boolean
}

const CHURCH_BRANCH_OPTIONS = [
  'JKI Shema Sunter, Jakarta',
  'JKI Shema Pontianak',
  'JKI Shema Gn. Sindur',
  'JKI Shema MMC, Kelapa Gading',
  'Gereja Lain',
]

export default function RegisterPage() {
  const [participants, setParticipants] = useState<ParticipantFormItem[]>([
    {
      full_name: '',
      whatsapp_number: '',
      church_status: 'BERGEREJA',
      church_branch: '',
      is_child: false,
      is_wa_opt_in: true,
    },
  ])

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successData, setSuccessData] = useState<any[] | null>(null)

  const handleAddParticipant = () => {
    setParticipants([
      ...participants,
      {
        full_name: '',
        whatsapp_number: '',
        church_status: 'BERGEREJA',
        church_branch: '',
        is_child: false,
        is_wa_opt_in: true,
      },
    ])
  }

  const handleRemoveParticipant = (index: number) => {
    if (participants.length === 1) return
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const updateParticipant = (index: number, field: keyof ParticipantFormItem, value: any) => {
    const updated = [...participants]
    if (field === 'church_status') {
      updated[index] = {
        ...updated[index],
        church_status: value,
        church_branch: value === 'TIDAK_BERGEREJA' ? '' : updated[index].church_branch,
      }
    } else {
      updated[index] = { ...updated[index], [field]: value }
    }
    setParticipants(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    // Validation
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i]
      if (!p.full_name.trim()) {
        setErrorMsg(`Nama lengkap untuk Peserta #${i + 1} wajib diisi.`)
        return
      }
      if (i === 0 && !p.whatsapp_number.trim()) {
        setErrorMsg('Nomor WhatsApp Pendaftar Utama wajib diisi.')
        return
      }
      if (!p.is_child && !p.whatsapp_number.trim()) {
        setErrorMsg(`Nomor WhatsApp untuk Peserta #${i + 1} (${p.full_name}) wajib diisi.`)
        return
      }
      if (p.church_status === 'BERGEREJA' && !p.church_branch) {
        setErrorMsg(`Gereja / Cabang untuk Peserta #${i + 1} wajib dipilih.`)
        return
      }
      if (!p.is_wa_opt_in) {
        setErrorMsg(`Persetujuan WhatsApp wajib dicentang untuk Peserta #${i + 1}.`)
        return
      }
    }

    setLoading(true)

    try {
      const payload = participants.map((p, i) => ({
        full_name: p.full_name,
        whatsapp_number: i > 0 && p.is_child ? participants[0].whatsapp_number : p.whatsapp_number,
        church_status: p.church_status,
        church_branch: p.church_status === 'BERGEREJA' ? p.church_branch : undefined,
        is_child: i > 0 ? p.is_child : false,
        is_wa_opt_in: p.is_wa_opt_in,
      }))

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      <div className="min-h-screen bg-[#FFFCF8] flex items-center justify-center p-4 sm:p-6 py-12">
        <div className="bg-white max-w-xl w-full p-6 sm:p-8 rounded-3xl shadow-xl shadow-[#7C152D]/5 border border-[#A43A52]/20 space-y-6">
          <div className="w-16 h-16 bg-[#F5E8EB] text-[#7C152D] border border-[#A43A52]/30 rounded-full flex items-center justify-center text-3xl mx-auto shadow-inner">
            <CheckCircle2 className="w-9 h-9 text-[#7C152D]" />
          </div>
          <div className="text-center space-y-2">
            <span className="text-xs font-bold text-[#7C152D] uppercase tracking-wider">
              JKI SHEMA CHRISTMAS CONCERT
            </span>
            <h1 className="text-2xl font-black text-[#292329]">Pendaftaran Berhasil!</h1>
            <p className="text-sm text-[#766C70]">
              Sebanyak <strong className="text-[#292329]">{successData.length} orang</strong> telah terdaftar. Simpan atau unduh QR Code tiket Anda di bawah ini untuk ditunjukkan kepada panitia saat kedatangan di lokasi acara.
            </p>
          </div>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {successData.map((item, idx) => (
              <TicketCard key={item.id || item.qr_token || idx} participant={item} />
            ))}
          </div>

          <div className="pt-2 flex flex-col gap-3">
            <Link
              href="/"
              className="w-full text-center bg-[#7C152D] hover:bg-[#571020] text-white font-bold text-sm py-3.5 rounded-xl transition shadow-md shadow-[#7C152D]/20 cursor-pointer"
            >
              Kembali ke Halaman Utama
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFFCF8] py-8 sm:py-14 px-4 sm:px-6 flex items-center justify-center">
      <div className="bg-white max-w-2xl w-full p-5 sm:p-10 rounded-3xl shadow-xl shadow-[#7C152D]/5 border border-[#A43A52]/20 space-y-7">
        
        {/* Christmas Event Poster */}
        <div className="relative w-full rounded-2xl overflow-hidden bg-slate-950 shadow-md border border-[#A43A52]/20 flex items-center justify-center aspect-[1440/1049]">
          <img
            src="/images/hero/christmas-poster-new.png"
            alt="JKI Shema Christmas Concert"
            className="w-full h-full object-contain"
          />
        </div>

        {/* Heading & Back Link */}
        <div className="flex items-center justify-between border-b border-[#A43A52]/15 pb-4">
          <div>
            <span className="text-xs font-bold text-[#7C152D] uppercase tracking-wider">
              JKI SHEMA CHRISTMAS CONCERT
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#292329] mt-1">
              Form Pendaftaran
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#766C70] hover:text-[#7C152D] bg-[#F5E8EB]/70 hover:bg-[#F5E8EB] px-3.5 py-2 rounded-xl border border-[#A43A52]/20 transition shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali</span>
          </Link>
        </div>

        {/* Registration Notes (Exact 3 items as required) */}
        <div className="bg-[#F5E8EB]/60 border border-[#A43A52]/30 rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-[#7C152D]">
            <Info className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider">
              Informasi &amp; Ketentuan Pendaftaran
            </h2>
          </div>
          <ol className="space-y-2.5 text-xs sm:text-sm text-[#292329] leading-relaxed">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-[#7C152D] text-white text-[11px] font-bold mt-0.5 shadow-sm">
                1
              </span>
              <span>
                QR pendaftaran berlaku untuk 1 orang (1 kursi), daftarkan anak jika sudah memerlukan kursi sendiri.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-[#7C152D] text-white text-[11px] font-bold mt-0.5 shadow-sm">
                2
              </span>
              <span>
                Simpan QR setelah diterima, QR juga akan dikirimkan melalui WhatsApp Anda.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-[#7C152D] text-white text-[11px] font-bold mt-0.5 shadow-sm">
                3
              </span>
              <span>
                Wajib menunjukkan QR kepada tim registrasi untuk masuk ke venue.
              </span>
            </li>
          </ol>
        </div>

        {errorMsg && (
          <div className="bg-[#F5E8EB] border border-[#A43A52]/40 text-[#7C152D] text-sm p-4 rounded-xl font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
          {participants.map((participant, index) => (
            <div
              key={index}
              className="bg-[#FFFCF8] border border-[#A43A52]/25 p-5 sm:p-6 rounded-2xl space-y-4 sm:space-y-5 shadow-sm relative transition-all"
            >
              <div className="flex items-center justify-between border-b border-[#A43A52]/20 pb-3">
                <span className="font-bold text-[#7C152D] text-sm flex items-center gap-2">
                  {index === 0 ? '👤 Pendaftar Utama' : `👥 Peserta Tambahan #${index + 1}`}
                </span>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveParticipant(index)}
                    className="text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>

              {/* Tickbox Anak (Only for participant #2 and onwards) */}
              {index > 0 && (
                <div className="bg-[#F5E8EB]/50 border border-[#A43A52]/25 p-3 rounded-xl flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`child-${index}`}
                    checked={participant.is_child}
                    onChange={(e) => updateParticipant(index, 'is_child', e.target.checked)}
                    className="w-4 h-4 text-[#7C152D] accent-[#7C152D] rounded focus:ring-[#7C152D]/30 cursor-pointer"
                  />
                  <label htmlFor={`child-${index}`} className="text-xs font-bold text-[#571020] cursor-pointer">
                    Peserta ini adalah Anak (Nomor WA disamakan dengan Pendaftar Utama)
                  </label>
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#292329] uppercase tracking-wider">
                  Nama Lengkap <span className="text-[#7C152D]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={participant.full_name}
                  onChange={(e) => updateParticipant(index, 'full_name', e.target.value)}
                  placeholder="Masukkan nama lengkap"
                  className="w-full px-4 py-3 bg-white border border-[#A43A52]/30 rounded-xl text-[#292329] text-sm placeholder-[#766C70]/60 focus:outline-none focus:border-[#7C152D] focus:ring-2 focus:ring-[#7C152D]/20 transition"
                />
              </div>

              {/* WA Number (Hidden if child) */}
              {(!participant.is_child || index === 0) && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#292329] uppercase tracking-wider">
                    Nomor WhatsApp <span className="text-[#7C152D]">*</span>
                  </label>
                  <input
                    type="tel"
                    required={!participant.is_child}
                    value={participant.whatsapp_number}
                    onChange={(e) => updateParticipant(index, 'whatsapp_number', e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-4 py-3 bg-white border border-[#A43A52]/30 rounded-xl text-[#292329] text-sm placeholder-[#766C70]/60 focus:outline-none focus:border-[#7C152D] focus:ring-2 focus:ring-[#7C152D]/20 transition"
                  />
                </div>
              )}

              {/* Congregation Status */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#292329] uppercase tracking-wider">
                  Status Berjemaat <span className="text-[#7C152D]">*</span>
                </label>
                <select
                  value={participant.church_status}
                  onChange={(e) => updateParticipant(index, 'church_status', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-[#A43A52]/30 rounded-xl text-[#292329] text-sm focus:outline-none focus:border-[#7C152D] focus:ring-2 focus:ring-[#7C152D]/20 transition cursor-pointer"
                >
                  <option value="BERGEREJA">Telah Berjemaat</option>
                  <option value="TIDAK_BERGEREJA">Belum Berjemaat, Rindu untuk Dijangkau</option>
                </select>
              </div>

              {/* Church Branch Dropdown */}
              {participant.church_status === 'BERGEREJA' && (
                <div className="space-y-1.5 animate-in fade-in transition-all duration-300">
                  <label className="block text-xs font-bold text-[#292329] uppercase tracking-wider">
                    Gereja / Cabang <span className="text-[#7C152D]">*</span>
                  </label>
                  <select
                    required
                    value={participant.church_branch}
                    onChange={(e) => updateParticipant(index, 'church_branch', e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-[#A43A52]/30 rounded-xl text-[#292329] text-sm focus:outline-none focus:border-[#7C152D] focus:ring-2 focus:ring-[#7C152D]/20 transition cursor-pointer"
                  >
                    <option value="" disabled>
                      Pilih gereja / cabang
                    </option>
                    {CHURCH_BRANCH_OPTIONS.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* WA Opt-in Consent */}
              <div className="bg-white border border-[#A43A52]/25 p-3.5 rounded-xl flex items-start gap-3">
                <input
                  type="checkbox"
                  id={`optin-${index}`}
                  checked={participant.is_wa_opt_in}
                  onChange={(e) => updateParticipant(index, 'is_wa_opt_in', e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-[#7C152D] accent-[#7C152D] rounded focus:ring-[#7C152D]/30 cursor-pointer"
                />
                <label htmlFor={`optin-${index}`} className="text-xs text-[#292329] cursor-pointer">
                  Menyetujui pengiriman pesan konfirmasi &amp; tiket QR via WhatsApp. <span className="text-[#7C152D] font-bold">*Wajib</span>
                </label>
              </div>
            </div>
          ))}

          {/* Add Participant Button */}
          <button
            type="button"
            onClick={handleAddParticipant}
            className="w-full py-3.5 border-2 border-dashed border-[#A43A52]/40 hover:border-[#7C152D] text-[#7C152D] font-bold text-sm rounded-2xl bg-[#F5E8EB]/40 hover:bg-[#F5E8EB]/80 transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Peserta Lain (Keluarga / Kerabat)</span>
          </button>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#7C152D] hover:bg-[#571020] text-white font-bold text-base py-4 rounded-xl shadow-lg shadow-[#7C152D]/25 hover:shadow-[#7C152D]/40 transition duration-300 disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Memproses Pendaftaran...' : `Kirim Pendaftaran (${participants.length} Peserta)`}
          </button>
        </form>

        {/* Contact Us Redirect */}
        <div className="pt-4 border-t border-[#A43A52]/15 text-center">
          <p className="text-xs text-[#766C70] mb-2">Punya pertanyaan seputar acara?</p>
          <a
            href="https://wa.me/6281234567890?text=Halo%20Admin,%20saya%20ingin%20bertanya%20seputar%20pendaftaran%20Christmas%20Celebration"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#7C152D] hover:text-[#571020] bg-[#F5E8EB] hover:bg-[#F5E8EB]/80 border border-[#A43A52]/20 px-4 py-2 rounded-lg transition"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Contact Us via WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  )
}
