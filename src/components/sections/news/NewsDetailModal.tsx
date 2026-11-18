"use client";

import { useEffect, useRef, useCallback } from "react";
import { X, Calendar, Share2 } from "lucide-react";
import { NewsItem } from "./news.types";
import NewsCategoryBadge from "./NewsCategoryBadge";

type NewsDetailModalProps = {
    news: NewsItem | null;
    onClose: () => void;
};

export default function NewsDetailModal({
    news,
    onClose,
}: NewsDetailModalProps) {
    const closeBtnRef = useRef<HTMLButtonElement | null>(null);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        },
        [onClose]
    );

    useEffect(() => {
        if (!news) return;

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        if (closeBtnRef.current) {
            closeBtnRef.current.focus();
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [news, handleKeyDown]);

    if (!news) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 transition-opacity duration-300 ease-out"
            role="presentation"
        >
            {/* Dark Transparent Backdrop Overlay */}
            <div
                className="fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-300"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Dialog Card */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label={news.title}
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200"
            >
                {/* Close Button */}
                <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={onClose}
                    aria-label="Tutup detail informasi"
                    className="absolute top-3.5 right-3.5 z-30 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/20 backdrop-blur-md shadow-md transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer group"
                >
                    <X className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                </button>

                {/* Modal Header Banner Image (Matching 16/10 aspect ratio with object-contain to display full poster) */}
                <div className="relative w-full aspect-[16/10] bg-slate-950 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    <img
                        src={news.imageUrl}
                        alt={news.title}
                        className="w-full h-full object-contain"
                    />
                </div>

                {/* Modal Scrollable Content Area */}
                <div className="p-6 sm:p-8 overflow-y-auto space-y-4">
                    {/* Category Badge & Publication Date */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <NewsCategoryBadge category={news.category} />
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{news.publishedAt}</span>
                        </div>
                    </div>

                    {/* News Title */}
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 uppercase tracking-tight leading-snug">
                        {news.title}
                    </h2>

                    {/* Excerpt */}
                    {news.excerpt && (
                        <p className="text-base sm:text-lg font-medium text-slate-700 leading-relaxed border-l-4 border-blue-600 pl-4 py-1 italic bg-blue-50/50 rounded-r-lg">
                            {news.excerpt}
                        </p>
                    )}

                    {/* Full Description / Content */}
                    <div className="text-sm sm:text-base text-slate-600 leading-relaxed space-y-4 pt-2">
                        {news.content.split("\n\n").map((paragraph, index) => (
                            <p key={index}>{paragraph}</p>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
