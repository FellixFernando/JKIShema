"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import MottoSection from "@/components/sections/about/MottoSection";
import HeroSection from "@/components/sections/hero/HeroSection";

type ActiveSection = "motto" | "hero";

type HeroMottoCrossfadeProps = {
    isRegistrationOpen: boolean;
};

export default function HeroMottoCrossfade({
    isRegistrationOpen,
}: HeroMottoCrossfadeProps) {
    const [activeSection, setActiveSection] = useState<ActiveSection>("motto");
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isAtNormalScroll, setIsAtNormalScroll] = useState(false);

    const activeSectionRef = useRef<ActiveSection>("motto");
    const isTransitioningRef = useRef(false);
    const isAtNormalScrollRef = useRef(false);
    const heroSettledTimestamp = useRef<number>(0);
    const touchStartY = useRef<number | null>(null);
    const touchStartX = useRef<number | null>(null);

    // Forward crossfade: MottoSection -> HeroSection
    const startTransitionToHero = useCallback(() => {
        if (isTransitioningRef.current || activeSectionRef.current !== "motto") return;

        isTransitioningRef.current = true;
        setIsTransitioning(true);
        activeSectionRef.current = "hero";
        setActiveSection("hero");

        const prefersReducedMotion =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const duration = prefersReducedMotion ? 50 : 1000;

        window.setTimeout(() => {
            isTransitioningRef.current = false;
            setIsTransitioning(false);
            // Cooldown buffer to absorb trailing momentum from the initial scroll down
            heroSettledTimestamp.current = Date.now() + 350;
        }, duration);
    }, []);

    // Reverse crossfade: HeroSection -> MottoSection
    const startTransitionToMotto = useCallback(() => {
        if (isTransitioningRef.current || activeSectionRef.current !== "hero") return;

        isTransitioningRef.current = true;
        setIsTransitioning(true);
        activeSectionRef.current = "motto";
        setActiveSection("motto");

        const prefersReducedMotion =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const duration = prefersReducedMotion ? 50 : 1000;

        window.setTimeout(() => {
            isTransitioningRef.current = false;
            setIsTransitioning(false);
        }, duration);
    }, []);

    useEffect(() => {
        // If loaded already scrolled down or pointing to an anchor other than home/motto
        if (
            window.scrollY > 20 ||
            (window.location.hash &&
                window.location.hash !== "#home" &&
                window.location.hash !== "#motto")
        ) {
            activeSectionRef.current = "hero";
            setActiveSection("hero");
            isAtNormalScrollRef.current = true;
            setIsAtNormalScroll(true);
            return;
        }

        const handleHashChange = () => {
            if (
                window.location.hash &&
                window.location.hash !== "#home" &&
                window.location.hash !== "#motto"
            ) {
                activeSectionRef.current = "hero";
                setActiveSection("hero");
                isAtNormalScrollRef.current = true;
                setIsAtNormalScroll(true);
            }
        };

        const handleDocumentClick = (e: MouseEvent) => {
            const homeTarget = (e.target as HTMLElement).closest('a[href="#home"]');
            if (homeTarget) {
                if (activeSectionRef.current === "motto") {
                    e.preventDefault();
                    startTransitionToHero();
                }
                return;
            }

            const otherAnchor = (e.target as HTMLElement).closest('a[href^="#"]');
            if (otherAnchor) {
                activeSectionRef.current = "hero";
                setActiveSection("hero");
                isAtNormalScrollRef.current = true;
                setIsAtNormalScroll(true);
            }
        };

        // Helper to check if a modal or popup is currently active
        const isModalOpen = () => {
            return (
                typeof document !== "undefined" &&
                (document.body.style.overflow === "hidden" ||
                    document.querySelector('[role="dialog"]') !== null)
            );
        };

        // Desktop: Wheel / Trackpad scroll detection
        const handleWheel = (e: WheelEvent) => {
            if (isModalOpen()) return;

            // 1. While crossfade animation is active, prevent vertical movement
            if (isTransitioningRef.current) {
                e.preventDefault();
                return;
            }

            // 2. In Motto Section:
            if (activeSectionRef.current === "motto") {
                e.preventDefault();
                if (e.deltaY > 15) {
                    startTransitionToHero();
                }
                return;
            }

            // 3. User is actively in normal page scrolling (scrolled down into About, Jadwal, etc.)
            // Normal scrolling must remain completely unintercepted in both directions!
            if (window.scrollY > 5) {
                return;
            }

            // 4. In Hero Section (viewport is at or near scrollY === 0):
            if (activeSectionRef.current === "hero" || window.scrollY <= 5) {
                // Scroll DOWN from Hero:
                // DO NOT call preventDefault! Allow native smooth scrolling down to AboutSection!
                if (e.deltaY > 0) {
                    isAtNormalScrollRef.current = true;
                    setIsAtNormalScroll(true);
                    return;
                }

                // Scroll UP from Hero:
                if (e.deltaY < -15) {
                    // If still in cooldown period after arriving at HeroSection, absorb momentum
                    if (Date.now() < heroSettledTimestamp.current) {
                        e.preventDefault();
                        return;
                    }

                    // Deliberate upward scroll while stationary at HeroSection: trigger reverse crossfade to Motto!
                    e.preventDefault();
                    startTransitionToMotto();
                    return;
                }

                // Absorb slight upward jitter (< -0 and > -15) when at top
                if (e.deltaY < 0) {
                    e.preventDefault();
                }
            }
        };

        // Mobile: Touch gesture detection
        const handleTouchStart = (e: TouchEvent) => {
            if (isModalOpen() || window.scrollY > 5) return;
            if (e.touches.length > 0) {
                touchStartY.current = e.touches[0].clientY;
                touchStartX.current = e.touches[0].clientX;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (isModalOpen()) return;

            if (isTransitioningRef.current) {
                if (e.cancelable) e.preventDefault();
                return;
            }

            if (activeSectionRef.current === "motto") {
                if (e.cancelable) e.preventDefault();
                if (touchStartY.current !== null && touchStartX.current !== null) {
                    const diffY = touchStartY.current - e.touches[0].clientY;
                    const diffX = Math.abs(touchStartX.current - e.touches[0].clientX);
                    if (diffY > 30 && diffY > diffX) {
                        startTransitionToHero();
                    }
                }
                return;
            }

            // Normal scrolling when inside or navigating lower sections
            if (window.scrollY > 5) {
                return;
            }

            // At HeroSection at top of page (window.scrollY <= 5)
            if (touchStartY.current !== null && touchStartX.current !== null) {
                const diffY = touchStartY.current - e.touches[0].clientY;
                const diffX = Math.abs(touchStartX.current - e.touches[0].clientX);

                // Swipe UP = scrolling DOWN from Hero to About:
                // DO NOT call preventDefault! Allow native touch scroll down!
                if (diffY > 0) {
                    isAtNormalScrollRef.current = true;
                    setIsAtNormalScroll(true);
                    return;
                }

                // Swipe DOWN = scrolling UP from Hero:
                if (diffY < -30 && Math.abs(diffY) > diffX) {
                    if (Date.now() < heroSettledTimestamp.current) {
                        if (e.cancelable) e.preventDefault();
                        return;
                    }
                    if (e.cancelable) e.preventDefault();
                    startTransitionToMotto();
                    return;
                }
            }
        };

        const handleTouchEnd = () => {
            touchStartY.current = null;
            touchStartX.current = null;
        };

        // Keyboard navigation (PageDown/Up, ArrowDown/Up, Space)
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isModalOpen()) return;

            if (isTransitioningRef.current) {
                e.preventDefault();
                return;
            }

            const activeTag = document.activeElement?.tagName.toLowerCase();
            if (activeTag === "input" || activeTag === "textarea") return;

            if (activeSectionRef.current === "motto") {
                if (["ArrowDown", "PageDown", " "].includes(e.key)) {
                    e.preventDefault();
                    startTransitionToHero();
                }
            } else if (activeSectionRef.current === "hero" && window.scrollY <= 5) {
                if (["ArrowUp", "PageUp"].includes(e.key)) {
                    if (Date.now() >= heroSettledTimestamp.current) {
                        e.preventDefault();
                        startTransitionToMotto();
                    }
                } else if (["ArrowDown", "PageDown", " "].includes(e.key)) {
                    // Allow normal downward keyboard scroll
                    isAtNormalScrollRef.current = true;
                    setIsAtNormalScroll(true);
                }
            }
        };

        // Scroll listener: handles state detection when user scrolls between top and lower sections
        const handleScroll = () => {
            if (isModalOpen()) return;

            // Keep viewport locked at (0, 0) strictly during active crossfade or while in MottoSection
            if (isTransitioningRef.current || activeSectionRef.current === "motto") {
                if (window.scrollY !== 0) {
                    window.scrollTo(0, 0);
                }
                return;
            }

            // In Hero Section / Normal Scroll mode:
            if (window.scrollY <= 2) {
                // User has scrolled all the way back up to the top (HeroSection)
                if (isAtNormalScrollRef.current) {
                    isAtNormalScrollRef.current = false;
                    setIsAtNormalScroll(false);
                    // Cooldown to dissipate momentum from scrolling up from AboutSection
                    heroSettledTimestamp.current = Date.now() + 350;
                }
            } else {
                // User is scrolling through AboutSection or lower sections
                if (!isAtNormalScrollRef.current) {
                    isAtNormalScrollRef.current = true;
                    setIsAtNormalScroll(true);
                }
            }
        };

        window.addEventListener("hashchange", handleHashChange);
        document.addEventListener("click", handleDocumentClick);
        window.addEventListener("wheel", handleWheel, { passive: false });
        window.addEventListener("touchstart", handleTouchStart, { passive: true });
        window.addEventListener("touchmove", handleTouchMove, { passive: false });
        window.addEventListener("touchend", handleTouchEnd, { passive: true });
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("scroll", handleScroll);

        return () => {
            window.removeEventListener("hashchange", handleHashChange);
            document.removeEventListener("click", handleDocumentClick);
            window.removeEventListener("wheel", handleWheel);
            window.removeEventListener("touchstart", handleTouchStart);
            window.removeEventListener("touchmove", handleTouchMove);
            window.removeEventListener("touchend", handleTouchEnd);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("scroll", handleScroll);
        };
    }, [startTransitionToHero, startTransitionToMotto]);

    const isHeroVisible = activeSection === "hero";
    const isMottoVisible = activeSection === "motto";

    return (
        <div className="relative w-full min-h-svh overflow-hidden bg-black">
            {/* HeroSection (positioned in document flow, fades between 0 and 1) */}
            <div
                className={`w-full min-h-svh transition-opacity duration-1000 ease-in-out motion-reduce:transition-none motion-reduce:duration-0 ${
                    isHeroVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                }`}
            >
                <HeroSection isRegistrationOpen={isRegistrationOpen} />
            </div>

            {/* MottoSection (positioned absolute over HeroSection, fades between 0 and 1) */}
            <div
                className={`absolute inset-0 z-20 w-full h-full min-h-svh transition-opacity duration-1000 ease-in-out motion-reduce:transition-none motion-reduce:duration-0 ${
                    isMottoVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                }`}
                aria-hidden={!isMottoVisible}
            >
                <MottoSection
                    onProceed={startTransitionToHero}
                    showArrow={activeSection === "motto" && !isTransitioning}
                />
            </div>
        </div>
    );
}
