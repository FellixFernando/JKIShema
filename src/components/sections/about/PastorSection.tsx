"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { La_Belle_Aurore } from "next/font/google";
import { X } from "lucide-react";

const laBelleAurore = La_Belle_Aurore({
  subsets: ["latin"],
  weight: ["400"],
});

export default function PastorsSection() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Close modal on Escape key press and prevent body scroll when open
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsModalOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isModalOpen]);

  return (
    <section id="pastors" className="w-full py-12 sm:py-20 pb-24 sm:pb-36">
      <div className="max-w-6xl mx-auto space-y-8 sm:space-y-12">
        {/* Header with Title, Subtitle, and Struktur Lengkap Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 sm:gap-6">
          <div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-slate-900 uppercase tracking-tight">
              GEMBALA &amp; PENATUA
            </h2>
            <p className="text-slate-600 mt-2 text-sm sm:text-base leading-relaxed max-w-md">
              Bersama melayani dan membimbing jemaat dalam kasih dan iman.
            </p>
          </div>
        </div>

        {/* 2-Column Pastor Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* Card 1: Ps. Didik Wahyudi & Ps. Tasina Raena */}
          <div className="relative rounded-[28px] sm:rounded-[36px] overflow-hidden shadow-xl sm:shadow-2xl shadow-blue-950/20 bg-gradient-to-b from-[#E6ECF6] via-[#5376a2] to-[#1e3a63] aspect-[16/10] sm:aspect-auto min-h-[220px] sm:min-h-[440px] lg:min-h-[460px] flex items-end">
            <div className="absolute inset-0 w-full h-full">
              <Image
                src="/images/gembala.png"
                alt="Ps. Didik Wahyudi & Ps. Tasina Raena"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
                className="object-contain object-bottom scale-110 sm:scale-115 origin-bottom -ml-8 sm:-ml-13"
              />
            </div>

            {/* Bottom Vignette Gradient */}
            <div className="absolute inset-x-0 bottom-0 h-32 sm:h-44 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />

            {/* Bottom-right Overlay Text */}
            <div className="relative z-10 w-full p-4 sm:p-8 flex flex-col items-end text-right text-white">
              <h3
                className={`${laBelleAurore.className} text-xl sm:text-3xl lg:text-[34px] font-normal leading-tight text-white drop-shadow-sm`}
              >
                Ps. Didik Wahyudi &amp;
                <br />
                Ps. Tasina Raena
              </h3>
              <p className="text-[9px] sm:text-xs font-semibold tracking-widest text-white/90 uppercase mt-1 sm:mt-2">
                GEMBALA SIDANG &amp; WAKIL GEMBALA
              </p>
            </div>
          </div>

          {/* Card 2: Pnt. Jusak Purnomo & Dkn. Lisa Inggawati */}
          <div className="relative rounded-[28px] sm:rounded-[36px] overflow-hidden shadow-xl sm:shadow-2xl shadow-blue-950/20 bg-gradient-to-b from-[#E6ECF6] via-[#5376a2] to-[#1e3a63] aspect-[16/10] sm:aspect-auto min-h-[220px] sm:min-h-[440px] lg:min-h-[460px] flex items-end">
            <div className="absolute inset-0 w-full h-full">
              <Image
                src="/images/penatua.png"
                alt="Pnt. Jusak Purnomo & Dkn. Lisa Inggawati"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
                className="object-contain object-bottom scale-110 sm:scale-115 origin-bottom ml-8 sm:ml-15"
              />
            </div>

            {/* Bottom Vignette Gradient */}
            <div className="absolute inset-x-0 bottom-0 h-32 sm:h-44 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />

            {/* Bottom-left Overlay Text */}
            <div className="relative z-10 w-full p-4 sm:p-8 flex flex-col items-start text-left text-white">
              <h3
                className={`${laBelleAurore.className} text-xl sm:text-3xl lg:text-[34px] font-normal leading-tight text-white drop-shadow-sm`}
              >
                Pnt. Jusak Purnomo &amp;
                <br />
                Dkn. Lisa Inggawati
              </h3>
              <p className="text-[9px] sm:text-xs font-semibold tracking-widest text-white/90 uppercase mt-1 sm:mt-2">
                PERINTIS
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-end mt-8">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="bg-[#051438] hover:bg-[#0a235c] text-white text-xs sm:text-sm font-bold tracking-wider uppercase px-6 py-2.5 sm:px-7 sm:py-3 rounded-full shadow-md shadow-[#051438]/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shrink-0"
          >
            STRUKTUR LENGKAP
          </button>
        </div>
      </div>

      {/* Pop-up Modal: Struktur Organisasi */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Struktur Organisasi JKI Shema"
        >
          <div
            className="relative w-full max-w-5xl bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl overflow-hidden flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button 'X' */}
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-3 right-3 sm:top-5 sm:right-5 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white flex items-center justify-center transition-all shadow-md hover:scale-105 active:scale-95"
              aria-label="Tutup"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Organization Structure Image */}
            <div className="relative w-full max-h-[80vh] flex items-center justify-center overflow-auto rounded-xl">
              <Image
                src="/images/about/struktur-jkishema.png"
                alt="Struktur Organisasi JKI Shema"
                width={1920}
                height={1080}
                priority
                className="w-full h-auto max-h-[75vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
