import Link from "next/link";
import Image from "next/image";

type NavbarProps = {
    isRegistrationOpen: boolean;
};

export default function Navbar({ isRegistrationOpen }: NavbarProps) {
    return (
        <header className="fixed w-full top-0 z-50 bg-gradient-to-b from-black/70 via-black/30 to-transparent">
            <div className="max-w-7xl mx-auto px-10 sm:px-15 h-20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Image
                        src="/images/logo-jkishema.png"
                        alt="Logo JKI Shema"
                        width={200}
                        height={100}
                        priority
                        className="h-13 w-auto object-contain"
                    />
                </div>

                <nav className="hidden md:flex items-center space-x-20 text-sm font-medium text-white">
                    <a href="#home" className="hover:text-blue-600 transition">
                        Beranda
                    </a>
                    <a href="#about" className="hover:text-blue-600 transition">
                        Tentang Kami
                    </a>
                    <a href="#ibadah" className="hover:text-blue-600 transition">
                        Ibadah
                    </a>
                    <a href="#gallery" className="hover:text-blue-600 transition">
                        Kegiatan
                    </a>
                    <a href="#contact" className="hover:text-blue-600 transition">
                        Kontak
                    </a>
                </nav>

                <div>
                    {isRegistrationOpen ? (
                        <Link
                            href="/register"
                            className="border border-white hover:bg-[#9E1C3C] hover:border-none hover:backdrop-blur-sm text-white font-bold text-sm px-4 py-2.5 rounded-full shadow-md hover:shadow-lg transition-all"
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
    );
}