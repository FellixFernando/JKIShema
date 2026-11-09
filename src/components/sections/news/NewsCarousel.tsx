"use client";

import { useState, useEffect, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NewsItem } from "./news.types";
import NewsCard from "./NewsCard";

type NewsCarouselProps = {
    news: NewsItem[];
    onSelectNews: (news: NewsItem) => void;
    onOpenAgenda: () => void;
};

export default function NewsCarousel({
    news,
    onSelectNews,
    onOpenAgenda,
}: NewsCarouselProps) {
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        containScroll: "trimSnaps",
        dragFree: false,
        skipSnaps: false,
    });

    const [canPrev, setCanPrev] = useState(false);
    const [canNext, setCanNext] = useState(true);

    const onSelect = useCallback(() => {
        if (!emblaApi) return;
        setCanPrev(emblaApi.canScrollPrev());
        setCanNext(emblaApi.canScrollNext());
    }, [emblaApi]);

    useEffect(() => {
        if (!emblaApi) return;
        onSelect();
        emblaApi.on("select", onSelect);
        emblaApi.on("reInit", onSelect);

        return () => {
            emblaApi.off("select", onSelect);
            emblaApi.off("reInit", onSelect);
        };
    }, [emblaApi, onSelect]);

    const scrollPrev = useCallback(() => {
        if (emblaApi) emblaApi.scrollPrev();
    }, [emblaApi]);

    const scrollNext = useCallback(() => {
        if (emblaApi) emblaApi.scrollNext();
    }, [emblaApi]);

    return (
        <div className="relative w-full">
            {/* Carousel Viewport Container */}
            <div className="relative w-full overflow-hidden">
                {/* Embla Viewport */}
                <div ref={emblaRef} className="overflow-hidden">
                    <div className="flex gap-6 sm:gap-7 md:gap-8 touch-pan-y">
                        {news.map((item) => (
                            <div
                                key={item.id}
                                className="flex-[0_0_82%] sm:flex-[0_0_48%] lg:flex-[0_0_31%] min-w-0"
                            >
                                <NewsCard news={item} onClick={onSelectNews} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Edge Fade Effect */}
                {/* Seamless multi-stop fade that gradually blends partially visible cards into the section background */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 sm:w-24 md:w-36 lg:w-48 z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0)_0%,rgba(255,255,255,0.12)_30%,rgba(255,255,255,0.65)_65%,rgba(255,255,255,0.92)_88%,#ffffff_100%)]"
                />
            </div>

            {/* Bottom Controls Row: Agenda Button on Left, Navigation Buttons on Right */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mt-8 sm:mt-10 md:mt-12">
                {/* Agenda JKI Shema Button */}
                <button
                    type="button"
                    onClick={onOpenAgenda}
                    className="inline-flex items-center justify-center bg-[#0B1930] hover:bg-[#162a4d] text-white font-semibold text-xs sm:text-sm tracking-wider uppercase px-8 py-3.5 sm:py-4 rounded-full shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1930]"
                >
                    AGENDA JKI SHEMA
                </button>

                {/* Circular Navigation Buttons (Desktop & Tablet) */}
                <div className="flex items-center gap-3 self-end sm:self-auto">
                    <button
                        type="button"
                        onClick={scrollPrev}
                        disabled={!canPrev}
                        aria-label="Informasi sebelumnya"
                        className="w-12 h-12 rounded-full bg-[#0B1930] hover:bg-[#162a4d] text-white flex items-center justify-center shadow-md transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-[#0B1930] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1930] cursor-pointer"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>

                    <button
                        type="button"
                        onClick={scrollNext}
                        disabled={!canNext}
                        aria-label="Informasi berikutnya"
                        className="w-12 h-12 rounded-full bg-[#0B1930] hover:bg-[#162a4d] text-white flex items-center justify-center shadow-md transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-[#0B1930] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1930] cursor-pointer"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    );
}
