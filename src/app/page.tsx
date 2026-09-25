import { getSystemConfig } from "@/services/config.service";
import Link from "next/link";

export const revalidate = 0; // Dynamic rendering for config toggle

export default async function HomePage() {
  const isRegistrationOpenConfig = await getSystemConfig("is_registration_open", "true");
  const isRegistrationOpen = isRegistrationOpenConfig === "true";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight text-blue-900">JKI SHEMA</span>
          </div>
          <nav className="hidden md:flex items-center space-x-8 text-sm font-semibold text-slate-600">
            <a href="#about" className="hover:text-blue-600 transition">Tentang Kami</a>
            <a href="#vision" className="hover:text-blue-600 transition">Visi & Misi</a>
            <a href="#pastors" className="hover:text-blue-600 transition">Gembala & Pengurus</a>
            <a href="#gallery" className="hover:text-blue-600 transition">Galeri</a>
            <a href="#contact" className="hover:text-blue-600 transition">Kontak</a>
          </nav>
          <div>
            {isRegistrationOpen ? (
              <Link
                href="/register"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-full shadow-md hover:shadow-lg transition-all"
              >
                Daftar Acara
              </Link>
            ) : (
              <span className="bg-slate-200 text-slate-500 font-medium text-xs px-3 py-1.5 rounded-full">
                Pendaftaran Ditutup
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 text-white py-20 lg:py-32 px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[url('/hero-pattern.svg')] opacity-10"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10 space-y-6">
          <div className="inline-block bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 text-blue-200 text-xs sm:text-sm font-semibold px-4 py-1.5 rounded-full uppercase tracking-widest">
            Christmas Celebration 2026
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            Menyambut Terang & Pengharapan Baru
          </h1>
          <p className="text-lg sm:text-xl text-blue-100/90 max-w-2xl mx-auto leading-relaxed">
            Bergabunglah bersama kami dalam perayaan Natal JKI Shema. Mari bersama merayakan kasih dan kegembiraan di hari yang istimewa ini.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            {isRegistrationOpen ? (
              <Link
                href="/register"
                className="w-full sm:w-auto bg-amber-400 hover:bg-amber-300 text-blue-950 font-extrabold text-base px-8 py-4 rounded-xl shadow-xl hover:scale-105 transition-all"
              >
                🎄 Daftar Christmas Celebration Sekarang
              </Link>
            ) : (
              <div className="w-full sm:w-auto bg-slate-800/80 border border-slate-700 text-slate-300 font-medium text-base px-8 py-4 rounded-xl">
                🔒 Pendaftaran Saat Ini Telah Ditutup
              </div>
            )}
            <a
              href="#about"
              className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold text-base px-6 py-4 rounded-xl backdrop-blur-sm transition-all"
            >
              Pelajari Lebih Lanjut
            </a>
          </div>
        </div>
      </section>

      {/* About Us Section */}
      <section id="about" className="py-16 sm:py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-4">
            <h2 className="text-3xl font-bold text-slate-900">Tentang JKI Shema</h2>
            <p className="text-slate-600 leading-relaxed">
              JKI Shema (Jemaat Kristus Indonesia) adalah komunitas gereja yang rukun, penuh kasih, dan berdedikasi untuk menjadi terang bagi lingkungan sekitar. Kami berkomitmen untuk bertumbuh bersama dalam iman, harapan, dan kasih Kristus.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Setiap ibadah dan kegiatan kami dirancang untuk membina hubungan yang hangat antar sesama serta memperdalam pengenalan kita akan Tuhan.
            </p>
          </div>
          <div className="bg-slate-100 rounded-2xl p-8 border border-slate-200 shadow-inner flex flex-col justify-center items-center text-center">
            <span className="text-4xl mb-2">⛪</span>
            <h3 className="text-xl font-bold text-slate-800">Rumah Bagi Setiap Jiwa</h3>
            <p className="text-sm text-slate-500 mt-2">
              Di JKI Shema, Anda akan menemukan keluarga rohani yang selalu siap mendukung dan berjalan bersama Anda.
            </p>
          </div>
        </div>
      </section>

      {/* Vision & Mission */}
      <section id="vision" className="py-16 sm:py-24 px-4 sm:px-6 bg-slate-50 border-y border-slate-200">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900">Visi & Misi</h2>
            <p className="text-slate-600 mt-2">Arah dan panggilan pelayanan gereja kami</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-3">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center font-bold text-xl">👁️</div>
              <h3 className="text-xl font-bold text-slate-900">Visi Kami</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Menjadi gereja yang membawa dampak transformasi, menghadirkan kasih Allah, serta mencetak murid-murid Kristus yang tangguh dan penuh kasih.
              </p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-3">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center font-bold text-xl">🎯</div>
              <h3 className="text-xl font-bold text-slate-900">Misi Kami</h3>
              <ul className="text-slate-600 text-sm leading-relaxed space-y-2 list-disc list-inside">
                <li>Membangun persekutuan yang berakar kuat dalam Firman Tuhan.</li>
                <li>Melayani sesama dengan ketulusan dan kasih Kristus.</li>
                <li>Mendukung generasi muda dalam menemukan potensi rohani mereka.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Pastors & Leaders */}
      <section id="pastors" className="py-16 sm:py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900">Gembala & Pengurus</h2>
            <p className="text-slate-600 mt-2">Pelayan Tuhan yang siap membimbing dan melayani Anda</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {["Gembala Sidang", "Wakil Gembala", "Pengurus Pemuda & Acara"].map((role, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                <div className="w-20 h-20 bg-slate-200 rounded-full mx-auto flex items-center justify-center text-2xl">👤</div>
                <h3 className="font-bold text-slate-900 text-lg">Hamba Tuhan JKI Shema</h3>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">{role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section id="gallery" className="py-16 sm:py-24 px-4 sm:px-6 bg-slate-50 border-t border-slate-200">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900">Galeri Kegiatan</h2>
            <p className="text-slate-600 mt-2">Momen kebersamaan dan pelayanan gereja</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="aspect-square bg-slate-200 rounded-xl flex items-center justify-center text-slate-400 font-medium text-xs">
                Dokumentasi Kegiatan {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact & Footer */}
      <footer id="contact" className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6 border-t border-slate-800">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-3">
            <h3 className="text-2xl font-bold text-white">JKI SHEMA</h3>
            <p className="text-sm">Hubungi kami untuk informasi lebih lanjut mengenai ibadah dan kegiatan perayaan Natal.</p>
            <div className="pt-2">
              <a
                href="https://wa.me/6281234567890?text=Halo%20Admin%20JKI%20Shema"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
              >
                💬 Contact Us via WhatsApp
              </a>
            </div>
          </div>
          <div className="text-left md:text-right text-xs space-y-1">
            <p>© 2026 JKI Shema. All Rights Reserved.</p>
            <p>Christmas Celebration Registration System</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
