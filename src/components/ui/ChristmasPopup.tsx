"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { X } from "lucide-react";

type ChristmasPopupProps = {
    isRegistrationOpen: boolean;
};

export default function ChristmasPopup({
    isRegistrationOpen,
}: ChristmasPopupProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        // Wait for exit transition to complete before unmounting from DOM
        const prefersReducedMotion =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const exitDuration = prefersReducedMotion ? 0 : 300;

        window.setTimeout(() => {
            setIsMounted(false);
            if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") {
                previousFocusRef.current.focus();
            }
        }, exitDuration);
    }, []);

    // 1. Trigger popup 600ms (500–800ms) after initial page load
    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (typeof document !== "undefined") {
                previousFocusRef.current = document.activeElement as HTMLElement | null;
            }
            setIsMounted(true);
            setIsOpen(true);
        }, 600);

        return () => window.clearTimeout(timer);
    }, []);

    // 2. Body scroll locking and Escape key listener while popup is open
    useEffect(() => {
        if (!isOpen) return;

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        // Shift focus to close button for accessibility
        if (closeButtonRef.current) {
            closeButtonRef.current.focus();
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                handleClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, handleClose]);

    if (!isMounted) return null;

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
                isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
            role="presentation"
        >
            {/* Dark Transparent Background Overlay covering the entire viewport */}
            <div
                className="fixed inset-0 bg-black/60 transition-opacity duration-300 ease-out motion-reduce:transition-none"
                onClick={handleClose}
                aria-hidden="true"
            />

            {/* Modal Dialog Card */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Pendaftaran Christmas Celebration JKI Shema"
                onClick={(e) => e.stopPropagation()}
                className={`relative z-10 w-full max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl bg-black rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/20 transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
                    isOpen
                        ? "opacity-100 scale-100 translate-y-0"
                        : "opacity-0 scale-95 translate-y-4"
                }`}
            >
                {/* Close Button (X) in Top-Right Corner */}
                <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={handleClose}
                    aria-label="Tutup popup pendaftaran"
                    className="absolute top-3 right-3 sm:top-5 sm:right-5 z-30 flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/70 hover:bg-black/90 text-white/80 hover:text-white border border-white/30 backdrop-blur-md shadow-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer group"
                >
                    <X className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-200 group-hover:scale-110" />
                </button>

                {/* Poster Container */}
                <div className="relative w-full flex flex-col items-center overflow-hidden bg-black">
                    <div className="relative w-full contain">
                        {/* Christmas Poster Image */}
                        <img
                            src="/images/hero/Poster Christmas Concert LANDSCAPE (1).jpg.jpeg"
                            alt="Christmas Celebration JKI Shema"
                            className="w-full h-auto object-cover max-h-[70vh] sm:max-h-[75vh] md:max-h-[80vh] block"
                        />
                        {/* Gradient overlay for seamless transition to button section */}
                        <div className="absolute inset-x-0 bottom-0 h-32 sm:h-36 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />
                    </div>

                    {/* Registration Button Section */}
                    <div className="relative -mt-12 sm:-mt-16 mb-6 sm:mb-8 z-20 flex flex-col items-center justify-center w-full px-4 gap-2.5 sm:gap-3.5">
                        {isRegistrationOpen ? (
                            <div className="animate-float">
                                <Link
                                    href="/register"
                                    onClick={handleClose}
                                    className="w-auto text-center inline-flex items-center justify-center
                                        bg-[#ffffff]
                                        backdrop-blur-xl
                                        border border-[#E85D7A]/50
                                        hover:bg-[#9E1C3C]/55
                                        hover:border-[#FF8AA3]/70
                                        text-[#9E1C3C] font-extrabold text-sm sm:text-base md:text-lg
                                        hover:text-[#ffffff]
                                        px-7 py-3 sm:px-9 sm:py-4 rounded-full
                                        shadow-[0_0_20px_rgba(158,28,60,0.35)]
                                        hover:shadow-[0_0_35px_rgba(158,28,60,0.7)]
                                        hover:scale-105
                                        transition-all duration-300"
                                >
                                    Daftar Sekarang!
                                </Link>
                            </div>
                        ) : (
                            <div className="animate-float">
                                <div
                                    className="w-auto text-center inline-flex items-center justify-center
                                        bg-[#9E1C3C]/20
                                        backdrop-blur-xl
                                        border border-[#9E1C3C]/40
                                        text-white/90 font-medium text-xs sm:text-sm md:text-base
                                        px-6 py-3 sm:px-8 sm:py-3.5 rounded-xl"
                                >
                                    🔒 Pendaftaran Saat Ini Telah Ditutup
                                </div>
                            </div>
                        )}

                        {/* Info Sponsorship Text Button */}
                        <Link
                            href="/sponsorship"
                            onClick={handleClose}
                            className="text-xs sm:text-sm md:text-base text-white hover:text-white/80 underline underline-offset-4 decoration-white/40 hover:decoration-white font-medium transition-colors duration-200 cursor-pointer"
                        >
                            info sponsorship
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
