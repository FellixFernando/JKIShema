"use client";

import { useState, useEffect, useRef } from "react";
import { NewsItem } from "./news.types";
import { mockNewsData } from "./news.mock";
import NewsCarousel from "./NewsCarousel";
import NewsDetailModal from "./NewsDetailModal";
import ChurchCalendarModal from "./ChurchCalendarModal";

type NewsSectionProps = {
    news?: NewsItem[];
};

export default function NewsSection({ news = mockNewsData }: NewsSectionProps) {
    const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef<HTMLElement | null>(null);

    // Section entrance animation using Intersection Observer (triggers only once)
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.15 }
        );

        if (sectionRef.current) {
            observer.observe(sectionRef.current);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <section
            id="news"
            ref={sectionRef}
            className="relative w-full bg-white min-h-screen min-h-[100dvh] flex flex-col justify-center py-12 sm:py-16 md:py-20 lg:py-24 overflow-hidden"
            aria-labelledby="news-section-heading"
        >
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto">
                {/* Section Header: Title and Subtitle */}
                <div
                    className={`mb-8 sm:mb-10 md:mb-12 transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
                        isVisible
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 translate-y-6"
                    }`}
                >
                    <h2
                        id="news-section-heading"
                        className="text-3xl sm:text-4xl md:text-5xl font-semibold text-slate-900 uppercase tracking-tight"
                    >
                        INFORMASI TERBARU
                    </h2>
                    <p className="text-sm sm:text-base md:text-lg text-slate-600 font-normal mt-2 sm:mt-2.5 max-w-2xl">
                        Bersama melayani dan membimbing jemaat dalam kasih dan iman.
                    </p>
                </div>

                {/* News Carousel */}
                <div
                    className={`transition-all duration-700 delay-150 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
                        isVisible
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 translate-y-8"
                    }`}
                >
                    <NewsCarousel
                        news={news}
                        onSelectNews={(item) => setSelectedNews(item)}
                        onOpenAgenda={() => setIsCalendarOpen(true)}
                    />
                </div>
            </div>

            {/* News Detail Popup Modal */}
            <NewsDetailModal
                news={selectedNews}
                onClose={() => setSelectedNews(null)}
            />

            {/* Church Agenda Calendar Popup Modal */}
            <ChurchCalendarModal
                isOpen={isCalendarOpen}
                onClose={() => setIsCalendarOpen(false)}
                events={[]}
            />
        </section>
    );
}
