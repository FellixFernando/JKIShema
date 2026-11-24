'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft,
  MessageCircle,
  QrCode,
  HeartHandshake,
  FileText,
  Copy,
  Check,
  Sparkles,
  Download,
} from 'lucide-react'

export default function SponsorshipPage() {
  const [activeTab, setActiveTab] = useState<'sponsorship' | 'giving'>('sponsorship')
  const [copiedBank, setCopiedBank] = useState<string | null>(null)

  const contacts = [
    {
      name: 'Ibu Lisa',
      phone: '0817 9118 989',
      whatsappUrl:
        'https://wa.me/628179118989?text=Halo%20Ibu%20Lisa%2C%20saya%20ingin%20bertanya%20mengenai%20info%20sponsorship%20Christmas%20Celebration%20JKI%20Shema',
    },
    {
      name: 'Pak Kris',
      phone: '0878 8662 2626',
      whatsappUrl:
        'https://wa.me/6287886622626?text=Halo%20Pak%20Kris%2C%20saya%20ingin%20bertanya%20mengenai%20info%20sponsorship%20Christmas%20Celebration%20JKI%20Shema',
    },
  ]

  // Detect URL hash on load (e.g. #menabur opens the giving tab)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#menabur' || window.location.hash === '#qris') {
        setActiveTab('giving')
      } else if (window.location.hash === '#sponsorship') {
        setActiveTab('sponsorship')
      }
    }
  }, [])

  const copyToClipboard = (text: string, label: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
      setCopiedBank(label)
      setTimeout(() => setCopiedBank(null), 2500)
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFCF8] py-8 sm:py-14 px-4 sm:px-6 flex items-center justify-center">
      <div className="bg-white max-w-xl w-full p-5 sm:p-8 md:p-10 rounded-3xl shadow-xl shadow-[#7C152D]/5 border border-[#A43A52]/20 space-y-6 sm:space-y-7">
        {/* Heading & Back Link */}
        <div className="flex items-center justify-between border-b border-[#A43A52]/15 pb-4">
          <div>
            <span className="text-xs font-bold text-[#7C152D] uppercase tracking-wider">
              JKI SHEMA CHRISTMAS CELEBRATION
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#292329] mt-1">
              {activeTab === 'sponsorship' ? 'Info Sponsorship' : 'Dukung Pelayanan'}
            </h1>
          </div>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#766C70] hover:text-[#7C152D] bg-[#F5E8EB]/70 hover:bg-[#F5E8EB] px-3.5 py-2 rounded-xl border border-[#A43A52]/20 transition shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali</span>
          </Link>
        </div>

        {/* Interactive Segmented Control Tabs */}
        <div className="grid grid-cols-2 p-1.5 bg-[#F5E8EB]/60 border border-[#A43A52]/20 rounded-2xl gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('sponsorship')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
              activeTab === 'sponsorship'
                ? 'bg-[#7C152D] text-white shadow-md shadow-[#7C152D]/20 scale-[1.01]'
                : 'text-[#7C152D] hover:bg-[#F5E8EB]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Info Sponsorship</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('giving')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
              activeTab === 'giving'
                ? 'bg-[#7C152D] text-white shadow-md shadow-[#7C152D]/20 scale-[1.01]'
                : 'text-[#7C152D] hover:bg-[#F5E8EB]'
            }`}
          >
            <HeartHandshake className="w-4 h-4" />
            <span>Dukung Pelayanan</span>
          </button>
        </div>

        {/* TAB 1: INFO SPONSORSHIP */}
        {activeTab === 'sponsorship' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Sponsorship Poster */}
            <div className="relative w-full rounded-2xl overflow-hidden bg-slate-950 shadow-md border border-[#A43A52]/20 flex items-center justify-center group">
              <Image
                src="/images/hero/sponsorship-info.jpeg"
                alt="Info Sponsorship Christmas Celebration JKI Shema"
                width={905}
                height={1280}
                priority
                className="w-full h-auto object-contain block transition-transform duration-300 group-hover:scale-[1.01]"
              />
            </div>

            {/* WhatsApp Contact Section */}
            <div className="space-y-3 pt-1">
              <p className="text-xs sm:text-sm font-semibold text-[#7C152D] uppercase tracking-wider text-center">
                Hubungi Kami via WhatsApp:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {contacts.map((contact) => (
                  <a
                    key={contact.name}
                    href={contact.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 bg-[#7C152D] hover:bg-[#571020] text-white font-bold text-sm sm:text-base py-3.5 px-5 rounded-2xl shadow-md shadow-[#7C152D]/20 hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group cursor-pointer"
                  >
                    <MessageCircle className="w-5 h-5 flex-shrink-0 text-white group-hover:scale-110 transition-transform" />
                    <div className="text-left leading-tight">
                      <span className="block text-[11px] sm:text-xs font-medium text-white/80">
                        {contact.name}
                      </span>
                      <span className="block font-bold text-sm sm:text-base tracking-wide">
                        {contact.phone}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Quick Switch Banner to Giving Tab */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('giving')}
                className="w-full p-4 rounded-2xl bg-[#FFFCF8] hover:bg-[#F5E8EB]/50 border border-[#A43A52]/25 text-left flex items-center justify-between transition group shadow-sm cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#F5E8EB] flex items-center justify-center text-[#7C152D] shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-xs sm:text-sm font-bold text-[#292329]">
                      Ingin Menabur Persembahan Kasih?
                    </span>
                    <span className="block text-[11px] sm:text-xs text-[#766C70]">
                      Kirimkan persembahan pelayanan melalui QRIS JKI Shema
                    </span>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#7C152D] group-hover:translate-x-1 transition-transform">
                  Buka QRIS &rarr;
                </span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: DUKUNG PELAYANAN KAMI */}
        {activeTab === 'giving' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Section Header */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5E8EB] text-[#7C152D] text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Persembahan &amp; Donasi</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-[#292329]">
                Dukung Pelayanan Kami
              </h2>
              <p className="text-xs sm:text-sm text-[#766C70] leading-relaxed max-w-md mx-auto">
                Bagi Jemaat yang rindu untuk menabur dapat mengirimkan dalam bentuk dana melewati Qris berikut :
              </p>
            </div>

            {/* QR Code Card */}
            <div className="bg-[#FFFCF8] border border-[#A43A52]/25 rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-sm space-y-5 relative overflow-hidden">
              {/* Top Accent Badge */}
              <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-[#A43A52]/20 text-[#7C152D] text-xs font-bold shadow-xs">
                <span>QRIS Standar Pembayaran Nasional</span>
              </div>

              {/* QR Code Container */}
              <div className="relative w-full max-w-[280px] sm:max-w-[340px] aspect-square bg-white rounded-2xl border border-[#A43A52]/25 p-3 sm:p-4 shadow-md flex items-center justify-center">
                <Image
                  src="/images/ticket/qris-jkishema.png"
                  alt="QRIS JKI Shema - Donasi & Persembahan Pelayanan"
                  width={3307}
                  height={3307}
                  priority
                  className="w-full h-full object-contain rounded-xl select-none"
                />
              </div>

              {/* Download QRIS Action */}
              <div className="flex items-center justify-center">
                <a
                  href="/images/ticket/qris-jkishema.png"
                  download="QRIS-JKI-Shema.png"
                  className="inline-flex items-center gap-2 bg-[#7C152D] hover:bg-[#571020] text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-md shadow-[#7C152D]/15 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Gambar QRIS</span>
                </a>
              </div>

              {/* Supported Payment Logos / Information */}
              <div className="space-y-1.5 text-center">
                <p className="text-[11px] sm:text-xs font-semibold text-[#292329]">
                  Dapat di-scan dengan seluruh aplikasi mobile banking &amp; e-wallet:
                </p>
                <p className="text-[11px] text-[#766C70]">
                  BCA &bull; Mandiri &bull; BRI &bull; BNI &bull; CIMB &bull; GoPay &bull; OVO &bull; DANA &bull; ShopeePay &bull; LinkAja
                </p>
              </div>
            </div>

            {/* Quick Switch Banner to Sponsorship Tab */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('sponsorship')}
                className="w-full p-4 rounded-2xl bg-[#FFFCF8] hover:bg-[#F5E8EB]/50 border border-[#A43A52]/25 text-left flex items-center justify-between transition group shadow-sm cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#F5E8EB] flex items-center justify-center text-[#7C152D] shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-xs sm:text-sm font-bold text-[#292329]">
                      Ingin Info Sponsorship Acara Natal?
                    </span>
                    <span className="block text-[11px] sm:text-xs text-[#766C70]">
                      Lihat poster paket sponsorship dan hubungi panitia
                    </span>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#7C152D] group-hover:translate-x-1 transition-transform">
                  Buka Sponsorship &rarr;
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Footer Navigation Links */}
        <div className="pt-2 border-t border-[#A43A52]/15 flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
          <Link
            href="/register"
            className="w-full text-center bg-[#7C152D] hover:bg-[#571020] text-white font-bold text-xs sm:text-sm py-3 px-4 rounded-xl transition shadow-md shadow-[#7C152D]/15"
          >
            Lanjut ke Form Pendaftaran Acara
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto text-center bg-[#F5E8EB]/70 hover:bg-[#F5E8EB] text-[#7C152D] font-bold text-xs sm:text-sm py-3 px-5 rounded-xl border border-[#A43A52]/20 transition shadow-sm whitespace-nowrap"
          >
            Halaman Utama
          </Link>
        </div>
      </div>
    </div>
  )
}
