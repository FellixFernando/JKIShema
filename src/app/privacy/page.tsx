import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const metadata = {
	title: "Kebijakan Privasi | JKI Shema Christmas Concert",
};

export default function PrivacyPage() {
	return (
		<div className="min-h-screen bg-[#FFFCF8] py-10 sm:py-16 px-4 sm:px-6">
			<div className="max-w-2xl mx-auto bg-white p-6 sm:p-10 rounded-3xl shadow-xl shadow-[#7C152D]/5 border border-[#A43A52]/20 space-y-8">
				<div className="flex items-start justify-between gap-4 border-b border-[#A43A52]/15 pb-5">
					<div>
						<span className="text-xs font-bold text-[#7C152D] uppercase tracking-wider">
							JKI SHEMA CHRISTMAS CONCERT
						</span>
						<h1 className="text-2xl sm:text-3xl font-black text-[#292329] mt-1">
							Kebijakan Privasi
						</h1>
						<p className="text-xs text-[#766C70] mt-2">
							Terakhir diperbarui: 25 November 2026
						</p>
					</div>
					<div className="w-11 h-11 rounded-2xl bg-[#F5E8EB] border border-[#A43A52]/25 flex items-center justify-center shrink-0">
						<ShieldCheck className="w-5 h-5 text-[#7C152D]" />
					</div>
				</div>

				<section className="space-y-3">
					<h2 className="text-sm font-bold text-[#7C152D] uppercase tracking-wider">
						Data yang Kami Kumpulkan
					</h2>
					<ul className="list-disc pl-5 space-y-1.5 text-sm text-[#292329] leading-relaxed">
						<li>Nama lengkap</li>
						<li>Nomor WhatsApp</li>
						<li>Status gereja / cabang</li>
						<li>Penanda anak</li>
						<li>Status kehadiran</li>
					</ul>
				</section>

				<section className="space-y-3">
					<h2 className="text-sm font-bold text-[#7C152D] uppercase tracking-wider">
						Tujuan Penggunaan Data
					</h2>
					<p className="text-sm text-[#292329] leading-relaxed">
						Data digunakan untuk pendaftaran acara, pengiriman tiket via WhatsApp,
						check-in, dan statistik acara.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-sm font-bold text-[#7C152D] uppercase tracking-wider">
						Berbagi Data
					</h2>
					<p className="text-sm text-[#292329] leading-relaxed">
						Data hanya dibagikan kepada WhatsApp / Meta untuk keperluan pengiriman
						tiket. Kami tidak menjual data Anda kepada pihak lain.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-sm font-bold text-[#7C152D] uppercase tracking-wider">
						Penyimpanan Data
					</h2>
					<p className="text-sm text-[#292329] leading-relaxed">
						Data disimpan sampai acara dan administrasi selesai, kemudian diarsipkan
						atau dihapus sesuai kebijakan gereja.
					</p>
				</section>

				<section className="space-y-3">
					<h2 className="text-sm font-bold text-[#7C152D] uppercase tracking-wider">
						Kontak
					</h2>
					<div className="text-sm text-[#292329] leading-relaxed space-y-1">
						<p>
							Email:{" "}
							<a
								href="mailto:jkishema21@gmail.com"
								className="font-semibold text-[#7C152D] underline underline-offset-2 break-all">
								jkishema21@gmail.com
							</a>
						</p>
						<p>
							WhatsApp / Telepon:{" "}
							<a
								href="tel:+6281511140377"
								className="font-semibold text-[#7C152D] underline underline-offset-2">
								+62 81511140377
							</a>
						</p>
						<p>
							Alamat: Apartment Green Lake Sunter Northern Park Residences Tower 2
							Lantai UG, Jl. Danau Sunter Selatan RT. 15/RW.16 Sunter Agung,
							Tanjung Priok, Jakarta Utara 14350.
						</p>
					</div>
				</section>

				<div className="pt-4 border-t border-[#A43A52]/15">
					<Link
						href="/"
						className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7C152D] hover:text-[#571020] bg-[#F5E8EB] hover:bg-[#F5E8EB]/80 border border-[#A43A52]/20 px-4 py-2.5 rounded-lg transition">
						<ArrowLeft className="w-3.5 h-3.5" />
						<span>Kembali ke Halaman Utama</span>
					</Link>
				</div>
			</div>
		</div>
	);
}
