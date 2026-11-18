import { ChevronDown } from "lucide-react";

interface MottoSectionProps {
    onProceed?: () => void;
    showArrow?: boolean;
}

export default function MottoSection({
    onProceed,
    showArrow = true,
}: MottoSectionProps) {
    return (
        <section
            id="motto"
            className="relative w-full h-full min-h-svh flex items-center justify-center overflow-hidden bg-black py-20 sm:py-28 md:py-36 px-4 sm:px-6"
        >
            {/* Background Video */}
            <video
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 h-full w-full object-cover"
                aria-hidden="true"
            >
                <source src="/videos/ocean.mp4" type="video/mp4" />
                Your browser does not support the video tag.
            </video>

            {/* Black Transparent Overlay */}
            <div
                className="absolute inset-0 bg-black/60 sm:bg-black/65 backdrop-contrast-105 pointer-events-none"
                aria-hidden="true"
            />

            {/* Content Container */}
            <div className="relative z-10 flex flex-col items-center justify-center text-center max-w-4xl mx-auto">
                {/* Quote Text */}
                <p className="font-mono text-base min-[400px]:text-lg sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-relaxed sm:leading-relaxed md:leading-[1.75] tracking-tight sm:tracking-normal drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
                    “ Sebagai Murid Kristus
                    <br />
                    yang penuh Roh Kudus,
                    <br />
                    hidup bersama menyatakan
                    <br />
                    kebenaran, kasih dan
                    <br />
                    melayani, berhati hamba
                    <br />
                    bermental prajurit”
                </p>

                {/* Motto Subheading & Church Name */}
                <div className="mt-12 sm:mt-16 md:mt-20 flex flex-col items-center gap-2">
                    <h2 className="font-sans font-bold text-sm sm:text-base md:text-lg tracking-[0.25em] text-white uppercase drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
                        MOTTO
                    </h2>
                    <p className="font-sans font-medium text-xs sm:text-sm md:text-base tracking-[0.18em] text-white/85 uppercase drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
                        GEREJA JEMAAT KRISTEN INDONESIA SHEMA
                    </p>
                </div>
            </div>

            {/* Scroll Down Indicator */}
            <button
                type="button"
                onClick={onProceed}
                disabled={!showArrow}
                aria-label="Lanjut ke bagian berikutnya"
                className={`absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 text-white/70 hover:text-white transition-opacity duration-300 cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-full p-2.5 ${
                    showArrow ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                }`}
            >
                <span className="sr-only">Scroll ke bawah</span>
                <ChevronDown className="w-6 h-6 sm:w-7 sm:h-7 animate-gentle-bounce drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] transition-transform duration-300 group-hover:scale-110" />
            </button>
        </section>
    );
}
