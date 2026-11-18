import Image from "next/image";
import Link from "next/link";
import { La_Belle_Aurore } from "next/font/google";
import { Lightbulb, Target, ChevronRight } from "lucide-react";

const laBelleAurore = La_Belle_Aurore({
  subsets: ["latin"],
  weight: ["400"],
});

export default function VisionMissionSection() {
  return (
    <section id="vision" className="pt-12 sm:pt-24 pb-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-10 sm:space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 uppercase tracking-tight">
            TENTANG GEREJA KAMI
          </h2>
          <p className="text-slate-600 mt-2 text-sm sm:text-base">
            Mengenal visi dan misi yang menjadi dasar setiap langkah pelayanan kami.
          </p>
        </div>

        {/* Vision & Mission Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-14 items-center">
          {/* LEFT SIDE: Vision Card with Background Image */}
          <div className="relative w-full rounded-[28px] sm:rounded-[36px] overflow-hidden shadow-xl sm:shadow-2xl shadow-blue-950/20 aspect-[16/10] sm:aspect-auto min-h-[220px] sm:min-h-[480px] lg:min-h-[520px] flex items-center justify-center">
            {/* Background Image */}
            <Image
              src="/images/about/vision-bg.jpg"
              alt="Vision background"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
              className="object-cover object-center"
            />

            {/* Subtle overlay for optimal contrast */}
            <div className="absolute inset-0 bg-blue-950/15 pointer-events-none" />

            {/* Quote Content */}
            <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 py-6 sm:px-20 sm:py-16 text-center text-white">
              <p
                className={`${laBelleAurore.className} text-base sm:text-xl lg:text-[20px] xl:text-3xl text-white font-normal leading-relaxed tracking-wide max-w-sm sm:max-w-md`}
              >
                &ldquo;Pada hari-hari yang akan datang, Yakub akan berakar,
                Israel akan berkembang dan bertunas dan memenuhi muka bumi
                dengan hasilnya.&rdquo;
              </p>
              <span className="text-[11px] sm:text-sm tracking-widest text-white/90 font-medium uppercase mt-3 sm:mt-8">
                Yesaya 26 : 4
              </span>
            </div>
          </div>

          {/* RIGHT SIDE: Visi, Misi & Link Button */}
          <div className="flex flex-col justify-between py-2 sm:py-4 lg:py-6 pl-0 lg:pl-4">
            <div className="space-y-8 sm:space-y-12">
              {/* VISI */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 sm:gap-3.5">
                  <Lightbulb className="w-7 h-7 sm:w-8 sm:h-8 text-black stroke-[2.2] shrink-0" />
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black tracking-tight">
                    VISI
                  </h3>
                </div>
                <p className="text-slate-800 text-base sm:text-lg lg:text-xl font-normal leading-relaxed max-w-xl">
                  Bertumbuh, meluas, dan menjangkau bangsa-bangsa bagi Kristus.
                </p>
              </div>

              {/* MISI */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 sm:gap-3.5">
                  <Target className="w-7 h-7 sm:w-8 sm:h-8 text-black stroke-[2.2] shrink-0" />
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black tracking-tight">
                    MISI
                  </h3>
                </div>
                <p className="text-slate-800 text-base sm:text-lg lg:text-xl font-normal leading-relaxed max-w-xl">
                  Memperluas pelayanan, menjangkau jiwa, melangkah dalam iman,
                  dan membangun jemaat dengan karakter yang serupa Kristus.
                </p>
              </div>
            </div>

            {/* SELENGKAPNYA Button directing to Information Page */}
            <div className="flex justify-end pt-10 sm:pt-14 lg:pt-16">
              <Link
                href="/information"
                className="inline-flex items-center gap-2 bg-[#051438] hover:bg-[#0a235c] text-white text-xs sm:text-sm font-bold tracking-wider uppercase px-7 py-3 sm:px-8 sm:py-3.5 rounded-full shadow-lg shadow-[#051438]/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>SELENGKAPNYA</span>
                <ChevronRight className="w-4 h-4 stroke-[2.5]" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
