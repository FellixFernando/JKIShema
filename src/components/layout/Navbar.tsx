"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

type NavbarProps = {
    isRegistrationOpen: boolean;
};

const navItems = [
    { label: "Beranda", href: "#home", id: "home" },
    { label: "Tentang Kami", href: "#about", id: "about" },
    { label: "Ibadah", href: "#ibadah", id: "ibadah" },
    { label: "Kegiatan", href: "#gallery", id: "gallery" },
    { label: "Kontak", href: "#contact", id: "contact" },
];

export default function Navbar({ isRegistrationOpen }: NavbarProps) {
    const [activeSection, setActiveSection] = useState<string>("home");
    const [hoveredSection, setHoveredSection] = useState<string | null>(null);

    const navContainerRef = useRef<HTMLElement | null>(null);
    const navItemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

    const [indicatorStyle, setIndicatorStyle] = useState<{
        left: number;
        width: number;
        opacity: number;
    }>({
        left: 0,
        width: 0,
        opacity: 0,
    });

    const updateIndicator = useCallback(() => {
        const targetId = hoveredSection || activeSection;
        const targetEl = navItemRefs.current[targetId];
        const containerEl = navContainerRef.current;

        if (targetEl && containerEl) {
            const containerRect = containerEl.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();

            setIndicatorStyle({
                left: targetRect.left - containerRect.left,
                width: targetRect.width,
                opacity: 1,
            });
        }
    }, [hoveredSection, activeSection]);

    useEffect(() => {
        updateIndicator();
    }, [updateIndicator]);

    useEffect(() => {
        const handleResize = () => {
            updateIndicator();
        };

        window.addEventListener("resize", handleResize);
        const timer = setTimeout(updateIndicator, 50);

        return () => {
            window.removeEventListener("resize", handleResize);
            clearTimeout(timer);
        };
    }, [updateIndicator]);

    useEffect(() => {
        const sectionIds = navItems.map((item) => item.id);

        const handleScroll = () => {
            const scrollPosition = window.scrollY;

            // When scrolled to the bottom of the page, activate the last section ("contact")
            if (
                window.innerHeight + scrollPosition >=
                document.documentElement.scrollHeight - 100
            ) {
                setActiveSection("contact");
                return;
            }

            // Find current active section from bottom to top
            for (let i = sectionIds.length - 1; i >= 0; i--) {
                const section = document.getElementById(sectionIds[i]);
                if (section) {
                    const top = section.offsetTop;
                    if (scrollPosition >= top - 100) {
                        setActiveSection(sectionIds[i]);
                        return;
                    }
                }
            }

            // Default to first section when at top
            setActiveSection("home");
        };

        // Check if initial hash matches one of the sections
        if (typeof window !== "undefined" && window.location.hash) {
            const currentHash = window.location.hash.replace("#", "");
            if (sectionIds.includes(currentHash)) {
                setActiveSection(currentHash);
            }
        } else {
            handleScroll();
        }

        window.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("hashchange", handleScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("hashchange", handleScroll);
        };
    }, []);

    const handleNavClick = (id: string) => {
        setActiveSection(id);
        setHoveredSection(null);
    };

    return (
        <header className="fixed w-full top-0 z-50 bg-gradient-to-b from-black/70 via-black/30 to-transparent">
            <div className="max-w-7xl mx-auto px-10 sm:px-15 h-20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <a href="#home" onClick={() => handleNavClick("home")}>
                        <Image
                            src="/images/logo-jkishema.png"
                            alt="Logo JKI Shema"
                            width={200}
                            height={100}
                            priority
                            className="h-13 w-auto object-contain cursor-pointer"
                        />
                    </a>
                </div>

                <nav
                    ref={navContainerRef}
                    onMouseLeave={() => setHoveredSection(null)}
                    className="relative hidden md:flex items-center space-x-20 text-sm text-white py-1"
                >
                    {navItems.map((item) => {
                        const isSelected = activeSection === item.id;
                        return (
                            <a
                                key={item.id}
                                ref={(el) => {
                                    navItemRefs.current[item.id] = el;
                                }}
                                href={item.href}
                                onClick={() => handleNavClick(item.id)}
                                onMouseEnter={() => setHoveredSection(item.id)}
                                className="group relative inline-flex flex-col items-center justify-center py-1 text-white cursor-pointer select-none"
                            >
                                {/* Visible label: selected is bold, otherwise medium. Hover does NOT bold. */}
                                <span
                                    className={`transition-colors duration-150 ${
                                        isSelected ? "font-bold text-white" : "font-medium text-white"
                                    }`}
                                >
                                    {item.label}
                                </span>

                                {/* Invisible bold clone to permanently reserve bold width so text never moves */}
                                <span
                                    className="font-bold invisible h-0 select-none pointer-events-none"
                                    aria-hidden="true"
                                >
                                    {item.label}
                                </span>
                            </a>
                        );
                    })}

                    {/* Single shared sliding underline moving along with hover and snapping back to selected */}
                    <span
                        className="pointer-events-none absolute bottom-0 h-[2px] bg-white rounded-full transition-all duration-300 ease-out"
                        style={{
                            left: `${indicatorStyle.left}px`,
                            width: `${indicatorStyle.width}px`,
                            opacity: indicatorStyle.opacity,
                        }}
                    />
                </nav>

                <div>
                    {isRegistrationOpen ? (
                        <Link
                            href="/register"
                            className="inline-flex items-center justify-center rounded-full border border-white bg-transparent px-5 py-2.5 text-sm font-semibold tracking-wide text-white transition-all duration-300 ease-out hover:border-[#9E1C3C] hover:bg-[#9E1C3C] hover:shadow-[0_0_20px_rgba(158,28,60,0.55)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
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