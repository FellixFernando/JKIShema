import Image from "next/image";

function WhatsAppIcon({ className = "w-5 h-5" }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            <path d="M9.5 9a.5.5 0 0 0-.5.5v1a4 4 0 0 0 4 4h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.4.2l-.6.6a2.5 2.5 0 0 1-1.4-1.4l.6-.6a.5.5 0 0 0 .2-.4v-1a.5.5 0 0 0-.5-.5h-1z" />
        </svg>
    );
}

function InstagramIcon({ className = "w-5 h-5" }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
    );
}

function YoutubeIcon({ className = "w-5 h-5" }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
            <polygon points="10 15 15 12 10 9 10 15" fill="currentColor" />
        </svg>
    );
}

export default function Footer() {
    return (
        <footer className="relative w-full bg-black text-white pt-16 pb-12 px-6 sm:px-12 lg:px-20 overflow-hidden border-t border-zinc-900">
            {/* Ambient Gradient di sudut kanan bawah (Putih -> Biru -> Hitam Transparan) */}
            <div className="pointer-events-none absolute bottom-0 right-0 w-[300px] h-[300px] sm:w-[380px] sm:h-[380px] lg:w-[460px] lg:h-[460px] bg-[radial-gradient(circle_at_bottom_right,#ffffff_0%,#93c5fd_10%,#075BFF_24%,#0340A3_40%,#000d26_58%,transparent_72%)] blur-[32px] opacity-90" />

            <div className="max-w-7xl mx-auto relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 items-start">
                    {/* Kolom Kiri: Logo, Judul, Deskripsi & Sosial Media */}
                    <div className="md:col-span-6 lg:col-span-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <Image
                                src="/images/logo-jkishema.png"
                                alt="Logo JKI Shema"
                                width={44}
                                height={44}
                                className="w-11 h-11 object-contain"
                            />
                            <h3 className="text-xl sm:text-2xl font-extrabold tracking-wide text-white uppercase">
                                JKI SHEMA SUNTER
                            </h3>
                        </div>

                        <p className="text-xs sm:text-[13px] text-zinc-300 leading-relaxed font-normal">
                            Menjadi gereja yang melaksanakan Amanat Agung Tuhan, berkembang menghasilkan buah yang tetap dengan setiap anggota jemaatnya mengalami Pertumbuhan Iman dan menjadi katalis transformasi, seorang murid Kristus yang hidupnya mencerminkan pengajaran dan kehidupan Kristus, secara aktif berusaha membangun karakteristik tersebut pada orang lain dimanapun dia berada sehingga siap menyambut kedatangan Kristus kedua kali.
                        </p>

                        <div className="flex items-center gap-5 pt-2 text-white">
                            <a
                                href="https://wa.me/6281511140377?text=Halo%20Admin%20JKI%20Shema"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-blue-400 transition"
                                aria-label="WhatsApp"
                            >
                                <WhatsAppIcon className="w-5 h-5" />
                            </a>
                            <a
                                href="https://instagram.com/shemachurch"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-blue-400 transition"
                                aria-label="Instagram"
                            >
                                <InstagramIcon className="w-5 h-5" />
                            </a>
                            <a
                                href="https://youtube.com/@shemachurch"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-blue-400 transition"
                                aria-label="YouTube"
                            >
                                <YoutubeIcon className="w-5 h-5" />
                            </a>
                        </div>
                    </div>

                    {/* Kolom Tengah: Navigasi Halaman */}
                    <div className="md:col-span-3 lg:col-span-3 md:pl-6 space-y-3.5 text-sm text-zinc-300 font-normal">
                        <a href="#home" className="block hover:text-white transition">
                            Beranda
                        </a>
                        <a href="#about" className="block hover:text-white transition">
                            Tentang Kami
                        </a>
                        <a href="#ibadah" className="block hover:text-white transition">
                            Ibadah
                        </a>
                        <a href="#gallery" className="block hover:text-white transition">
                            Kegiatan
                        </a>
                        <a href="#contact" className="block hover:text-white transition">
                            Cabang
                        </a>
                    </div>

                    {/* Kolom Kanan: Daftar Cabang */}
                    <div className="md:col-span-3 lg:col-span-4 space-y-3.5 text-sm text-zinc-300 font-normal">
                        <p className="hover:text-white transition cursor-default">
                            Pusat Sunter
                        </p>
                        <p className="hover:text-white transition cursor-default">
                            Cabang Gunung<br />Sindur
                        </p>
                        <p className="hover:text-white transition cursor-default">
                            Cabang MMC Kelapa<br />Gading
                        </p>
                        <p className="hover:text-white transition cursor-default">
                            Cabang Pontianak
                        </p>
                    </div>
                </div>

                {/* Bottom Row: Copyright */}
                <div className="pt-16 sm:pt-20 text-center text-xs text-zinc-400 font-normal">
                    <a href="/privacy" className="hover:text-white transition underline underline-offset-2">
                        Kebijakan Privasi
                    </a>
                    <div className="mt-2">
                        Copyright 2026 JKI SHEMA, All rights reserved
                    </div>
                </div>
            </div>
        </footer>
    );
}