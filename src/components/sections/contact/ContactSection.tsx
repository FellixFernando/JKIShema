import { MapPin, Phone, Mail, ExternalLink } from "lucide-react";

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

export default function ContactSection() {
    const branches = [
        {
            name: "CABANG GUNUNG SINDUR",
            address:
                "Jl. Pendidikan no 27 RT.01/ RW. 01 DS. Cibadung, Kec. Gunung Sindur, Kabupaten Bogor, Jawa Barat",
            phone: "+62 87780843024",
            email: "email.neniojo9@gmail.com",
        },
        {
            name: "CABANG MMC KELAPA GADING",
            address:
                "Balai Warga Apartemen Grand Emerald, Jl. Pegangsaan Dua No.3, RT.13/RW.3, Pegangsaan Dua, Kec. Klp. Gading, Jkt Utara, Daerah Khusus Ibukota Jakarta 14250",
            phone: "+62 852-1930-1745",
            email: "movingministrychurch@gmail.com",
        },
        {
            name: "CABANG PONTIANAK",
            address:
                "Room Rosella, Hotel Harmony In, Jl. Sungai Raya Dalam No.79, Sungai Raya, Kec. Sungai Raya, Kabupaten Kubu Raya, Kalimantan Barat 78116",
            phone: "+62 81256839595",
            email: "tedygunadie13@gmail.com",
        },
    ];

    const googleMapsUrl =
        "https://www.google.com/maps/search/?api=1&query=Apartment+Green+Lake+Sunter+Northern+Park+Residences";
    const freeMapEmbedUrl =
        "https://maps.google.com/maps?q=Apartment+Green+Lake+Sunter+Northern+Park+Residences&t=&z=16&ie=UTF8&iwloc=&output=embed";

    return (
        <section
            id="contact"
            className="w-full bg-black text-white py-16 sm:py-20 px-4 sm:px-8 lg:px-16"
        >
            <div className="max-w-6xl mx-auto space-y-12 sm:space-y-16">
                {/* TOP HALF: KONTAK UTAMA & MAP PREVIEW */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                    {/* Left: Contact Info */}
                    <div className="space-y-6 sm:space-y-8">
                        <div>
                            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-wide uppercase text-white">
                                KONTAK KAMI
                            </h2>
                            <p className="text-zinc-400 text-sm mt-2">
                                Kami siap terhubung, mendengarkan, dan melayani Anda.
                            </p>
                        </div>

                        <div className="space-y-5 sm:space-y-6 text-sm text-zinc-300">
                            {/* Alamat */}
                            <div className="flex items-start gap-4">
                                <div className="mt-1 flex-shrink-0">
                                    <MapPin className="w-5 h-5 text-white" />
                                </div>
                                <div className="leading-relaxed">
                                    <p className="font-semibold text-white">
                                        Apartment Green Lake Sunter Northern Park Residences Tower 2 Lantai UG.
                                    </p>
                                    <p className="text-zinc-400 text-xs sm:text-sm mt-0.5">
                                        Jl. Danau Sunter Selatan RT. 15/RW.16 Sunter Agung, Tanjung Priok, Jakarta Utara 14350.
                                    </p>
                                </div>
                            </div>

                            {/* Telepon */}
                            <div className="flex items-center gap-4">
                                <div className="flex-shrink-0">
                                    <Phone className="w-5 h-5 text-white" />
                                </div>
                                <a
                                    href="tel:+6281511140377"
                                    className="hover:text-blue-400 transition"
                                >
                                    +62 81511140377
                                </a>
                            </div>

                            {/* Email */}
                            <div className="flex items-center gap-4">
                                <div className="flex-shrink-0">
                                    <Mail className="w-5 h-5 text-white" />
                                </div>
                                <a
                                    href="mailto:jkishema21@gmail.com"
                                    className="hover:text-blue-400 transition break-all"
                                >
                                    jkishema21@gmail.com
                                </a>
                            </div>

                            {/* Instagram */}
                            <div className="flex items-center gap-4">
                                <div className="flex-shrink-0">
                                    <InstagramIcon className="w-5 h-5 text-white" />
                                </div>
                                <a
                                    href="https://instagram.com/shemachurch"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-blue-400 transition"
                                >
                                    @shemachurch
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Right: Map Preview with Direct Google Maps Link (100% Free, No API Key) */}
                    <div className="relative group">
                        <div className="relative w-full aspect-4/3 sm:aspect-16/11 rounded-2xl sm:rounded-3xl overflow-hidden border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.18)] bg-zinc-900">
                            {/* Free Map Preview Iframe */}
                            <iframe
                                title="Preview Lokasi JKI Shema"
                                src={freeMapEmbedUrl}
                                className="w-full h-full border-0 pointer-events-none"
                                loading="lazy"
                            />

                            {/* Clickable Overlay to redirect to Google Maps */}
                            <a
                                href={googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute inset-0 z-10 flex items-end justify-end p-3 sm:p-4 bg-black/5 hover:bg-black/25 transition-all"
                                title="Klik untuk membuka di Google Maps"
                            >
                                <span className="inline-flex items-center gap-2 bg-black/80 hover:bg-blue-600 text-white text-xs font-semibold px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border border-white/30 backdrop-blur-md shadow-lg transition-all duration-300 transform group-hover:scale-105">
                                    Buka di Google Maps
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </span>
                            </a>
                        </div>
                    </div>
                </div>

                {/* BOTTOM HALF: 3 CABANG GEREJA */}
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-zinc-800 pt-8">
                    {branches.map((branch, index) => (
                        <div
                            key={index}
                            className="space-y-4 py-6 first:pt-0 last:pb-0 md:py-0 md:px-8 first:md:pl-0 last:md:pr-0"
                        >
                            <div>
                                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                    JKI SHEMA
                                </p>
                                <h3 className="text-base font-bold text-white uppercase mt-0.5">
                                    {branch.name}
                                </h3>
                            </div>

                            <div className="space-y-3 text-xs sm:text-sm text-zinc-300">
                                <div className="flex items-start gap-3">
                                    <MapPin className="w-4 h-4 text-white flex-shrink-0 mt-0.5" />
                                    <p className="leading-relaxed text-zinc-400">
                                        {branch.address}
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Phone className="w-4 h-4 text-white flex-shrink-0" />
                                    <a
                                        href={`tel:${branch.phone.replace(/[^0-9+]/g, "")}`}
                                        className="hover:text-blue-400 transition"
                                    >
                                        {branch.phone}
                                    </a>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Mail className="w-4 h-4 text-white flex-shrink-0" />
                                    <a
                                        href={`mailto:${branch.email}`}
                                        className="hover:text-blue-400 transition break-all"
                                    >
                                        {branch.email}
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
