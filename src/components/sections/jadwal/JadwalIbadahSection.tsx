"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const schedules = [
    {
        title: "IBADAH UMUM",
        location: (
            <>
                Main Hall, Apartment Green Lake Sunter
                <br />
                Northern Park Residences Tower 2
                <br />
                Lantai UG
            </>
        ),
        time: "Minggu, 09.00 WIB",
    },
    {
        title: "SHEMA SUNDAY SCHOOL",
        location: (
            <>
                Function Room, Apartment Green Lake
                <br />
                Sunter Northern Park Residences Tower
                <br />
                2 Lantai UG
            </>
        ),
        time: "Minggu, 09.00 WIB",
    },
    {
        title: "SHEMA YOUTH OF GOD",
        location: (
            <>
                Main Hall, Apartment Green Lake Sunter
                <br />
                Northern Park Residences Tower 2
                <br />
                Lantai UG
            </>
        ),
        time: "Minggu, 11.30 WIB",
    },
    {
        title: "MENARA DOA",
        location: (
            <>
                Main Hall, Apartment Green Lake Sunter
                <br />
                Northern Park Residences Tower 2
                <br />
                Lantai UG
            </>
        ),
        time: "Jumat, 07.00 WIB",
    },
    {
        title: "PERSEKUTUAN WANITA PENOLONG",
        location: (
            <>
                Main Hall, Apartment Green Lake Sunter
                <br />
                Northern Park Residences Tower 2
                <br />
                Lantai UG
            </>
        ),
        time: "Rabu, 10.00 WIB",
    },
    {
        title: "KOMSEL",
        location: <>Online via Zoom Meeting</>,
        time: "Selasa, 19.00 WIB",
    },
];

export default function JadwalIbadahSection() {
    const sectionRef = useRef<HTMLElement>(null);
    const gradientCircleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let animationFrameId: number;

        const handleScroll = () => {
            if (!sectionRef.current || !gradientCircleRef.current) return;

            const rect = sectionRef.current.getBoundingClientRect();
            const windowHeight = window.innerHeight;

            // Hitung progress scroll saat seksi berada di viewport (0 = mulai masuk, 1 = lewat)
            const totalDistance = windowHeight + rect.height;
            const currentDistance = windowHeight - rect.top;
            const progress = Math.min(Math.max(currentDistance / totalDistance, 0), 1);

            // Interpolasi sudut rotasi:
            // Awal (+10deg): Biru hanya tampak sedikit di bagian bawah
            // Akhir (-45deg): Biru berputar naik menutupi seluruh sabit elips
            const startAngle = 10;
            const endAngle = -45;
            const currentAngle = startAngle + progress * (endAngle - startAngle);

            gradientCircleRef.current.style.transform = `rotate(${currentAngle}deg)`;
        };

        const onScroll = () => {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(handleScroll);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        handleScroll();

        return () => {
            window.removeEventListener("scroll", onScroll);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <section
            id="ibadah"
            ref={sectionRef}
            className="relative min-h-screen w-full bg-black py-16 sm:py-32 px-4 sm:px-8 lg:px-16 overflow-hidden flex items-center justify-center text-white"
        >
            <span id="services" className="sr-only" />
            {/* 2 LAPISAN ECLIPSE MENGGUNAKAN ELLIPSE-1.PNG & ELLIPSE-2.PNG */}
            <div className="pointer-events-none select-none absolute -left-[140px] top-6 w-[540px] h-[980px] sm:left-0 sm:top-1/2 sm:-translate-y-1/2 sm:w-[480px] sm:h-[960px] lg:w-[580px] lg:h-[1160px]">
                {/* Layer 1: Gradient Ellipse (Berputar saat di-scroll) */}
                <div
                    ref={gradientCircleRef}
                    className="absolute inset-0 w-full h-full will-change-transform"
                    style={{
                        transformOrigin: "0% 50%",
                        filter: "drop-shadow(0 0 30px rgba(7, 91, 255, 0.75)) drop-shadow(0 0 60px rgba(3, 64, 163, 0.45))",
                    }}
                >
                    <Image
                        src="/images/ellipse-1.png"
                        alt="Eclipse Gradient"
                        fill
                        className="object-contain object-left"
                        priority
                    />
                </div>

                {/* Layer 2: Solid Black Ellipse (Masking statis untuk efek sabit eclipse) */}
                <div className="absolute inset-0 w-full h-full -translate-x-3 sm:-translate-x-4 lg:-translate-x-5">
                    <Image
                        src="/images/ellipse-2.png"
                        alt="Eclipse Mask"
                        fill
                        className="object-contain object-left"
                        priority
                    />
                </div>
            </div>

            {/* KONTEN UTAMA: HEADER & 6 KARTU DI SISI KANAN */}
            <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-end">
                <div className="w-full lg:w-[60%] xl:w-[55%] flex flex-col items-center lg:items-end space-y-10">
                    {/* Header */}
                    <div className="text-center w-full max-w-xl">
                        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-wider text-white uppercase">
                            JADWAL IBADAH
                        </h2>
                        <p className="text-zinc-400 text-sm sm:text-base mt-2">
                            Kami menantikan kehadiran Anda dalam setiap persekutuan.
                        </p>
                    </div>

                    {/* 6 Cards */}
                    <div className="w-full max-w-xl space-y-3.5 sm:space-y-4">
                        {schedules.map((item, index) => (
                            <div
                                key={index}
                                className="bg-black/85 backdrop-blur-md border border-zinc-700/80 hover:border-zinc-500 hover:scale-[1.02] sm:hover:scale-[1.03] hover:shadow-[0_0_25px_rgba(7,91,255,0.25)] rounded-[20px] sm:rounded-2xl p-5 sm:p-6 transition-all duration-300 ease-out shadow-lg group cursor-pointer"
                            >
                                {/* Mobile View (< sm): Sesuai gambar referensi */}
                                <div className="sm:hidden flex flex-col space-y-2">
                                    <div className="flex items-start justify-between gap-2.5">
                                        <h3 className="text-base font-bold text-white tracking-wide uppercase leading-snug">
                                            {item.title}
                                        </h3>
                                        <span className="shrink-0 inline-flex items-center justify-center bg-[#075BFF] text-white text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap shadow-md">
                                            {item.time.replace(", ", " | ")}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-400 leading-relaxed">
                                        {item.location}
                                    </p>
                                </div>

                                {/* Desktop View (>= sm): 100% Asli Tidak Diubah */}
                                <div className="hidden sm:flex sm:items-center justify-between gap-4">
                                    <div className="space-y-1.5">
                                        <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                                            {item.title}
                                        </h3>
                                        <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                                            {item.location}
                                        </p>
                                    </div>
                                    <div className="self-center">
                                        <span className="inline-flex items-center justify-center bg-[#0340A3] group-hover:bg-[#075BFF] text-white text-xs sm:text-sm font-semibold px-5 py-2.5 rounded-full whitespace-nowrap shadow-md transition-colors duration-200">
                                            {item.time}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
