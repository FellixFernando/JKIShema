'use client';

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Target,
  Shield,
  Heart,
  Sparkles,
  BookOpen,
  Building2,
  Users,
  Flame,
  Crown,
  Compass,
  Quote,
  Globe,
  Sprout,
} from "lucide-react";
import Footer from "@/components/layout/Footer";

const sectionsMeta = [
  {
    id: "visi-misi",
    badge: "BAGIAN 01",
    name: "1. Visi & Misi",
    title: "VISI MISI 2027–2031",
    subtitle: "GEREJA JEMAAT KRISTEN INDONESIA SHEMA",
  },
  {
    id: "fokus-tahunan",
    badge: "BAGIAN 02",
    name: "2. Fokus Tahunan",
    title: "FOKUS TAHUNAN",
    subtitle: "TAHAPAN TEMATIK MENUJU VISI 2027–2031",
  },
  {
    id: "nilai-kehidupan",
    badge: "BAGIAN 03",
    name: "3. Nilai Kehidupan",
    title: "NILAI-NILAI KEHIDUPAN",
    subtitle: "GEREJA JEMAAT KRISTEN INDONESIA SHEMA",
  },
  {
    id: "tujuan-akhir",
    badge: "BAGIAN 04",
    name: "4. Tujuan Akhir",
    title: "TUJUAN AKHIR",
    subtitle: "GEREJA JEMAAT KRISTEN INDONESIA SHEMA",
  },
];

export default function InformationPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const fokusTahunan = [
    {
      year: "2027",
      title: "BERBAJUZIRAHKAN IMAN",
      theme: "Meneladani Tokoh-tokoh Iman",
      verse: "Ibrani 11",
      icon: Shield,
    },
    {
      year: "2028",
      title: "BERBAJUZIRAHKAN KASIH",
      theme: "Menghidupi Hukum Yang Terutama",
      verse: "Markus 12:30",
      icon: Heart,
    },
    {
      year: "2029",
      title: "KETOPONG PENGHARAPAN KESELAMATAN",
      theme: "Pengharapan Dalam Kristus Tidak Mengecewakan",
      verse: "Roma 5:1-11",
      icon: Crown,
    },
    {
      year: "2030",
      title: "MAJU BERPERANG DENGAN PEDANG ROH FIRMAN TUHAN",
      theme: "Memenangkan Peperangan Dengan Pedang Roh Firman Tuhan",
      verse: "Efesus 6:16-17",
      icon: BookOpen,
    },
    {
      year: "2031",
      title: "MEWUJUDKAN SHEMA CONVENTION CENTER",
      theme: "JKI SHEMA Sebagai Pusat Pelayanan Di Bumi Seperti Di Surga",
      verse: "Kolose 3:1-4",
      icon: Building2,
    },
  ];

  const nilaiKehidupan = [
    {
      number: "01",
      nameEn: "BLESSEDNESS",
      nameId: "KEKUDUSAN",
      verseRef: "IMAMAT 20:26",
      verseText:
        "Kuduslah kamu bagi-Ku, sebab Aku ini, TUHAN, kudus dan Aku telah memisahkan kamu dari bangsa-bangsa lain, supaya kamu menjadi milik-Ku.",
      icon: Crown,
      borderColor: "hover:border-amber-400",
      badgeBg: "bg-amber-50 text-amber-900 border-amber-200",
    },
    {
      number: "02",
      nameEn: "LOVE",
      nameId: "KASIH",
      verseRef: "GALATIA 5:22-23",
      verseText:
        "Tetapi buah Roh ialah: kasih, sukacita, damai sejahtera, kesabaran, kemurahan, kebaikan, kesetiaan, kelemahlembutan, penguasaan diri. Tidak ada hukum yang menentang hal-hal itu.",
      icon: Heart,
      borderColor: "hover:border-rose-400",
      badgeBg: "bg-rose-50 text-rose-900 border-rose-200",
    },
    {
      number: "03",
      nameEn: "TRUTH",
      nameId: "KEBENARAN",
      verseRef: "EFESUS 4:15",
      verseText:
        "tetapi dengan teguh berpegang kepada kebenaran di dalam kasih kita bertumbuh di dalam segala hal ke arah Dia, Kristus, yang adalah Kepala.",
      icon: Compass,
      borderColor: "hover:border-blue-400",
      badgeBg: "bg-blue-50 text-blue-900 border-blue-200",
    },
    {
      number: "04",
      nameEn: "TOGETHERNESS",
      nameId: "KEBERSAMAAN",
      verseRef: "2 KORINTUS 1:21-22",
      verseText:
        "Sebab Dia yang telah meneguhkan kami bersama-sama dengan kamu di dalam Kristus, adalah Allah yang telah mengurapi, memeteraikan tanda milik-Nya atas kita dan yang memberikan Roh Kudus di dalam hati kita sebagai jaminan dari semua yang telah disediakan untuk kita",
      icon: Users,
      borderColor: "hover:border-indigo-400",
      badgeBg: "bg-indigo-50 text-indigo-900 border-indigo-200",
    },
    {
      number: "05",
      nameEn: "FULL OF HOLY SPIRIT",
      nameId: "PENUH DENGAN ROH KUDUS",
      verseRef: "KISAH PARA RASUL 4:31",
      verseText:
        "Dan ketika mereka sedang berdoa, goyanglah tempat mereka berkumpul itu dan mereka semua penuh dengan Roh Kudus, lalu mereka memberitakan firman Allah dengan berani.",
      icon: Flame,
      borderColor: "hover:border-orange-400",
      badgeBg: "bg-orange-50 text-orange-900 border-orange-200",
    },
  ];

  // Parallax scroll listener: maps vertical page scroll into active horizontal slide index
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalScrollable = rect.height - window.innerHeight;
      if (totalScrollable <= 0) return;

      const scrolled = -rect.top;
      const progress = Math.min(Math.max(scrolled / totalScrollable, 0), 1);

      let index = 0;
      if (progress < 0.22) {
        index = 0;
      } else if (progress < 0.52) {
        index = 1;
      } else if (progress < 0.82) {
        index = 2;
      } else {
        index = 3;
      }

      setActiveIndex(index);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Smoothly keep the active tab visible in the horizontal navbar on mobile
  useEffect(() => {
    const activeTab = tabRefs.current[activeIndex];
    if (activeTab && navScrollRef.current) {
      activeTab.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeIndex]);

  // Jump smoothly to a specific slide position in the parallax track
  const goToSlide = (index: number) => {
    if (!containerRef.current) {
      setActiveIndex(index);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const containerTop = window.scrollY + rect.top;
    const totalScrollable = rect.height - window.innerHeight;
    const targets = [0.03, 0.35, 0.67, 0.97];
    const targetScroll = containerTop + targets[index] * totalScrollable;
    window.scrollTo({ top: targetScroll, behavior: "smooth" });
    setActiveIndex(index);
  };

  // Horizontal touch swipe handling for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const diffX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const diffY = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // Detect deliberate horizontal swipe
    if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.3) {
      if (diffX < 0 && activeIndex < 3) {
        goToSlide(activeIndex + 1);
      } else if (diffX > 0 && activeIndex > 0) {
        goToSlide(activeIndex - 1);
      }
    }
  };

  const currentMeta = sectionsMeta[activeIndex];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-[#001540] selection:text-white">
      {/* Top Bar with 'Kembali' Button: Transparent Gradient overlaying the full-bleed blue hero */}
      <header className="absolute top-0 left-0 w-full z-50 bg-gradient-to-b from-black/70 via-black/25 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-12 h-16 sm:h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <Image
              src="/images/logo-jkishema.png"
              alt="Logo JKI Shema"
              width={200}
              height={100}
              priority
              className="h-9 sm:h-12 w-auto object-contain cursor-pointer transition group-hover:opacity-90"
            />
          </Link>

          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-sm font-semibold text-white transition px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border border-white/40 hover:border-white hover:bg-white/15 backdrop-blur-xs cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Kembali ke Beranda</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner Section: Blue image fills the top completely behind the transparent gradient bar */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#000d28] via-[#001540] to-[#0B1E3F] text-white pt-20 pb-10 sm:pt-28 sm:pb-16 px-4 sm:px-6">
        <div className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none">
          <Image
            src="/images/about/vision-bg.jpg"
            alt="Hero Background"
            fill
            priority
            className="object-cover object-center"
          />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.28),transparent_60%)] pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10 space-y-2 sm:space-y-2.5">
          <span className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-0.5 sm:px-3.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold tracking-widest uppercase bg-white/10 backdrop-blur-md text-blue-200 border border-white/20">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-300" />
            ARAH &amp; PONDASI PELAYANAN GEREJA
          </span>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-white uppercase drop-shadow-md">
            JKI SHEMA SUNTER
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            Menelusuri visi masa depan, fokus tahunan, nilai kehidupan, dan tujuan akhir dalam panggilan Ilahi bagi Tubuh Kristus.
          </p>
        </div>
      </section>

      {/* Sticky Section Navigation Bar: Horizontal scrollable with active indicator */}
      <nav
        aria-label="Navigasi Bagian"
        className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-xs"
      >
        <div className="max-w-5xl mx-auto px-2 sm:px-6">
          <div
            ref={navScrollRef}
            className="flex items-center justify-start sm:justify-center gap-1.5 sm:gap-6 overflow-x-auto py-1.5 sm:py-2.5 no-scrollbar scroll-smooth px-2"
          >
            {sectionsMeta.map((section, idx) => {
              const isActive = activeIndex === idx;
              return (
                <button
                  key={section.id}
                  ref={(el) => {
                    tabRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => goToSlide(idx)}
                  className={`group relative shrink-0 py-1 px-3 sm:px-4 rounded-full text-xs sm:text-sm transition-all duration-300 cursor-pointer whitespace-nowrap flex items-center gap-1.5 sm:gap-2 ${
                    isActive
                      ? "font-bold text-[#001540] bg-blue-50/90 border border-blue-200 shadow-xs"
                      : "font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                      isActive
                        ? "bg-[#001540] scale-125 ring-2 ring-blue-200"
                        : "bg-slate-300 group-hover:bg-slate-400"
                    }`}
                  />
                  <span>{section.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Parallax Container: 420vh tall scroll track with pinned viewport inside */}
      <div ref={containerRef} className="relative h-[420vh] bg-slate-50">
        <div className="sticky top-[42px] sm:top-[50px] h-[calc(100dvh-42px)] sm:h-[calc(100vh-50px)] flex flex-col justify-start overflow-hidden">
          {/* Pinned Title & Subtitle Header in One Constant Place */}
          <div className="text-center pt-3 pb-1.5 sm:pt-7 sm:pb-3 px-4 shrink-0 transition-all duration-500">
            <span className="inline-block text-[9px] sm:text-[10px] font-extrabold text-[#001540] tracking-widest uppercase bg-blue-50 border border-blue-200 px-2 sm:px-2.5 py-0.5 rounded-full mb-0.5 sm:mb-1">
              {currentMeta.badge}
            </span>
            <h2 className="text-lg sm:text-2xl md:text-3xl font-black text-slate-900 tracking-tight uppercase">
              {currentMeta.title}
            </h2>
            <p className="text-[9px] sm:text-xs font-semibold tracking-wider text-slate-500 uppercase mt-0.5">
              {currentMeta.subtitle}
            </p>
          </div>

          {/* Sliding Content Area: Horizontal Track */}
          <div
            className="relative flex-1 w-full overflow-hidden flex flex-col justify-start pt-1 sm:pt-3 touch-pan-y"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="flex h-full w-[400%] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform"
              style={{ transform: `translateX(-${activeIndex * 25}%)` }}
            >
              {/* ========================================================= */}
              {/* SLIDE 1: VISI MISI (2027-2031) */}
              {/* ========================================================= */}
              <div className="w-1/4 h-full px-3 sm:px-6 flex flex-col items-center justify-start overflow-y-auto sm:overflow-hidden pt-1 pb-4">
                <div className="max-w-4xl w-full">
                  <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg shadow-blue-950/20 bg-gradient-to-br from-[#001540] via-[#052b6b] to-[#001540] text-white p-4 sm:p-7 md:p-8 flex flex-col justify-between group">
                    <div className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none">
                      <Image
                        src="/images/about/vision-bg.jpg"
                        alt="Visi Background"
                        fill
                        className="object-cover object-center"
                      />
                    </div>
                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10 space-y-3 sm:space-y-5">
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 py-0.5 sm:px-3 sm:py-0.5 rounded-full bg-white/15 text-blue-200 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider backdrop-blur-md border border-white/20">
                          <Target className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-300" />
                          <span>Visi Pelayanan 5 Tahun</span>
                        </div>
                        <h3 className="text-base sm:text-2xl md:text-3xl font-black text-white leading-tight tracking-tight drop-shadow-md">
                          &ldquo;HIDUP DI BUMI SEPERTI DI SURGA MEWUJUDKAN SHEMA CONVENTION CENTER&rdquo;
                        </h3>
                      </div>

                      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl sm:rounded-2xl p-3 sm:p-5 space-y-2 sm:space-y-2.5 shadow-md">
                        <div className="flex items-center justify-between border-b border-white/15 pb-1.5 sm:pb-2">
                          <span className="text-[11px] sm:text-xs font-bold tracking-widest text-blue-200 uppercase flex items-center gap-1.5 sm:gap-2">
                            <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            1 TESALONIKA 5:8-11
                          </span>
                          <Quote className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/40" />
                        </div>
                        <p className="text-[11px] sm:text-sm text-slate-100 font-normal leading-relaxed italic">
                          &ldquo;Tetapi kita, yang adalah orang-orang siang, baiklah kita sadar, berbajuzirahkan iman dan kasih, dan berketopongkan pengharapan keselamatan. Karena Allah tidak menetapkan kita untuk ditimpa murka, tetapi untuk beroleh keselamatan oleh Yesus Kristus, Tuhan kita, yang sudah mati untuk kita, supaya entah kita berjaga-jaga, entah kita tidur, kita hidup bersama-sama dengan Dia. Karena itu nasihatilah seorang akan yang lain dan saling membangunlah kamu seperti yang memang kamu lakukan.&rdquo;
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ========================================================= */}
              {/* SLIDE 2: FOKUS TAHUNAN (2027-2031) - Clean Full-Width Roadmap Cards */}
              {/* ========================================================= */}
              <div className="w-1/4 h-full px-3 sm:px-6 flex flex-col items-center justify-start overflow-y-auto sm:overflow-hidden pt-1 pb-4">
                <div className="max-w-4xl w-full space-y-1.5 sm:space-y-2.5">
                  {fokusTahunan.map((fokus) => {
                    const IconComponent = fokus.icon;
                    return (
                      <div
                        key={fokus.year}
                        className="relative bg-white rounded-xl sm:rounded-2xl p-2 sm:py-2.5 sm:px-4 border border-slate-200/90 shadow-2xs hover:shadow-xs hover:border-blue-900/30 transition-all duration-300 flex items-center justify-between gap-2.5 sm:gap-3 group"
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-[#001540] to-blue-900 text-white flex flex-col items-center justify-center shrink-0 shadow-2xs">
                            <IconComponent className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="text-[7px] sm:text-[8px] font-extrabold tracking-widest opacity-90">
                              {fokus.year}
                            </span>
                          </div>

                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex items-center justify-between sm:justify-start gap-2">
                              <span className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-blue-50 text-[#001540] border border-blue-200 inline-block">
                                Fokus {fokus.year}
                              </span>
                              {/* On mobile: verse badge is rendered inline here */}
                              <span className="sm:hidden inline-flex items-center gap-1 text-[9px] font-bold text-[#001540] bg-blue-50/70 border border-blue-200/80 px-1.5 py-0.5 rounded-full">
                                <BookOpen className="w-2.5 h-2.5 text-blue-700" />
                                <span>{fokus.verse}</span>
                              </span>
                            </div>
                            <h3 className="text-[11px] sm:text-sm font-black text-slate-900 tracking-tight group-hover:text-[#001540] transition-colors leading-tight sm:leading-snug truncate sm:whitespace-normal">
                              {fokus.title}
                            </h3>
                            <p className="text-[10px] sm:text-xs text-slate-600 font-medium leading-tight sm:leading-snug truncate sm:whitespace-normal">
                              <span className="font-semibold text-slate-800">Tema {fokus.year}:</span>{" "}
                              {fokus.theme}
                            </p>
                          </div>
                        </div>

                        {/* On desktop: show verse pill on the right side */}
                        <div className="hidden sm:block shrink-0 self-center">
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#001540] bg-blue-50/70 border border-blue-200/80 px-2.5 py-1 rounded-full shadow-2xs">
                            <BookOpen className="w-3.5 h-3.5 text-blue-700" />
                            <span>{fokus.verse}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ========================================================= */}
              {/* SLIDE 3: NILAI-NILAI KEHIDUPAN (CORE VALUES) - Balanced 3 + 2 Centered Layout */}
              {/* ========================================================= */}
              <div className="w-1/4 h-full px-3 sm:px-6 flex flex-col items-center justify-start overflow-y-auto sm:overflow-hidden pt-1 pb-4">
                <div className="max-w-4xl w-full space-y-1.5 sm:space-y-3">
                  {/* Top Row: 3 Cards on desktop */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-3">
                    {nilaiKehidupan.slice(0, 3).map((val) => {
                      const IconComponent = val.icon;
                      return (
                        <div
                          key={val.number}
                          className={`bg-white rounded-xl sm:rounded-2xl p-2 sm:p-3.5 border border-slate-200/90 shadow-2xs hover:shadow-sm transition-all duration-300 flex flex-col justify-between gap-1 sm:gap-2 group ${val.borderColor}`}
                        >
                          <div className="space-y-1 sm:space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-[#001540] to-blue-900 text-white flex items-center justify-center shadow-2xs shrink-0">
                                  <IconComponent className="w-3 h-3 sm:w-4 sm:h-4" />
                                </div>
                                <div className="min-w-0">
                                  <span className="block text-[8px] sm:text-[9px] font-extrabold tracking-widest text-slate-400 uppercase truncate">
                                    {val.nameEn}
                                  </span>
                                  <h3 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight truncate">
                                    {val.nameId}
                                  </h3>
                                </div>
                                {/* On mobile: verse ref badge sits inline in the header */}
                                <span className={`sm:hidden text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider border shrink-0 ${val.badgeBg}`}>
                                  {val.verseRef}
                                </span>
                              </div>
                              <span className="text-base sm:text-2xl font-black text-slate-200 group-hover:text-blue-900/30 transition-colors shrink-0">
                                {val.number}
                              </span>
                            </div>

                            <p className="text-[10px] sm:text-[11.5px] text-slate-600 leading-snug italic bg-slate-50 p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-slate-100">
                              &ldquo;{val.verseText}&rdquo;
                            </p>
                          </div>

                          {/* On desktop: show verse ref badge at bottom */}
                          <div className="hidden sm:flex pt-1 items-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${val.badgeBg}`}>
                              {val.verseRef}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Row: 2 Cards Centered with matching card width on desktop */}
                  <div className="flex flex-col sm:flex-row justify-center gap-1.5 sm:gap-3 w-full">
                    {nilaiKehidupan.slice(3).map((val) => {
                      const IconComponent = val.icon;
                      return (
                        <div
                          key={val.number}
                          className={`w-full sm:w-[calc((100%-1.5rem)/3)] bg-white rounded-xl sm:rounded-2xl p-2 sm:p-3.5 border border-slate-200/90 shadow-2xs hover:shadow-sm transition-all duration-300 flex flex-col justify-between gap-1 sm:gap-2 group ${val.borderColor}`}
                        >
                          <div className="space-y-1 sm:space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-[#001540] to-blue-900 text-white flex items-center justify-center shadow-2xs shrink-0">
                                  <IconComponent className="w-3 h-3 sm:w-4 sm:h-4" />
                                </div>
                                <div className="min-w-0">
                                  <span className="block text-[8px] sm:text-[9px] font-extrabold tracking-widest text-slate-400 uppercase truncate">
                                    {val.nameEn}
                                  </span>
                                  <h3 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight truncate">
                                    {val.nameId}
                                  </h3>
                                </div>
                                {/* On mobile: verse ref badge sits inline in the header */}
                                <span className={`sm:hidden text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider border shrink-0 ${val.badgeBg}`}>
                                  {val.verseRef}
                                </span>
                              </div>
                              <span className="text-base sm:text-2xl font-black text-slate-200 group-hover:text-blue-900/30 transition-colors shrink-0">
                                {val.number}
                              </span>
                            </div>

                            <p className="text-[10px] sm:text-[11.5px] text-slate-600 leading-snug italic bg-slate-50 p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-slate-100">
                              &ldquo;{val.verseText}&rdquo;
                            </p>
                          </div>

                          {/* On desktop: show verse ref badge at bottom */}
                          <div className="hidden sm:flex pt-1 items-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${val.badgeBg}`}>
                              {val.verseRef}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ========================================================= */}
              {/* SLIDE 4: TUJUAN AKHIR (ULTIMATE PURPOSE) */}
              {/* ========================================================= */}
              <div className="w-1/4 h-full px-3 sm:px-6 flex flex-col items-center justify-start overflow-y-auto sm:overflow-hidden pt-1 pb-4">
                <div className="max-w-4xl w-full">
                  <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg bg-gradient-to-br from-[#0B1930] via-[#001540] to-[#040B17] text-white p-3.5 sm:p-7 space-y-2.5 sm:space-y-4 border border-white/15">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10 space-y-2.5 sm:space-y-3.5">
                      <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 py-0.5 sm:px-3 sm:py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[10px] sm:text-[11px] font-bold tracking-widest uppercase text-blue-200">
                        <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-300" />
                        <span>MANDAT KERAJAAN ALLAH</span>
                      </div>

                      <div className="relative p-2.5 sm:p-5 bg-white/5 backdrop-blur-md rounded-lg sm:rounded-2xl border border-white/15 shadow-inner">
                        <Quote className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-blue-300/40 mb-1 sm:mb-1.5" />
                        <p className="text-[11px] sm:text-sm md:text-base text-slate-100 font-normal leading-relaxed tracking-wide">
                          &ldquo;GEREJA JKI SHEMA menjadi gereja yang melaksanakan Amanat Agung Tuhan, berkembang menghasilkan buah yang tetap dengan setiap anggota jemaatnya mengalami Pertumbuhan Iman dan menjadi katalis transformasi, seorang murid Kristus yang hidupnya mencerminkan pengajaran dan kehidupan Kristus, secara aktif berusaha membangun karakteristik tersebut pada orang lain dimanapun dia berada sehingga siap menyambut kedatangan Kristus kedua kali.&rdquo;
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 pt-0.5 sm:pt-1">
                        <div className="bg-white/10 backdrop-blur-md p-2 sm:p-3 rounded-lg sm:rounded-xl border border-white/15 space-y-1 sm:space-y-1.5">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md sm:rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                            <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-300" />
                          </div>
                          <h4 className="font-bold text-[11px] sm:text-xs text-white">
                            Amanat Agung
                          </h4>
                          <p className="text-[9px] sm:text-[10px] text-slate-300 leading-snug">
                            Melaksanakan penginjilan bagi keselamatan jiwa-jiwa.
                          </p>
                        </div>

                        <div className="bg-white/10 backdrop-blur-md p-2 sm:p-3 rounded-lg sm:rounded-xl border border-white/15 space-y-1 sm:space-y-1.5">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md sm:rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                            <Sprout className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-300" />
                          </div>
                          <h4 className="font-bold text-[11px] sm:text-xs text-white">
                            Pertumbuhan Iman
                          </h4>
                          <p className="text-[9px] sm:text-[10px] text-slate-300 leading-snug">
                            Menghasilkan buah tetap dan bertumbuh kuat.
                          </p>
                        </div>

                        <div className="bg-white/10 backdrop-blur-md p-2 sm:p-3 rounded-lg sm:rounded-xl border border-white/15 space-y-1 sm:space-y-1.5">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md sm:rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
                            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-300" />
                          </div>
                          <h4 className="font-bold text-[11px] sm:text-xs text-white">
                            Transformasi
                          </h4>
                          <p className="text-[9px] sm:text-[10px] text-slate-300 leading-snug">
                            Membangun karakter Kristus di mana pun berada.
                          </p>
                        </div>

                        <div className="bg-white/10 backdrop-blur-md p-2 sm:p-3 rounded-lg sm:rounded-xl border border-white/15 space-y-1 sm:space-y-1.5">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md sm:rounded-lg bg-yellow-500/20 border border-yellow-400/30 flex items-center justify-center">
                            <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-300" />
                          </div>
                          <h4 className="font-bold text-[11px] sm:text-xs text-white">
                            Kedatangan-Nya
                          </h4>
                          <p className="text-[9px] sm:text-[10px] text-slate-300 leading-snug">
                            Siap menyambut kedatangan Kristus kedua kali.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
