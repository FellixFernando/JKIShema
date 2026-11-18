"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { ChurchEvent } from "./news.types";

type ChurchCalendarModalProps = {
    isOpen: boolean;
    onClose: () => void;
    events?: ChurchEvent[];
};

const MONTH_NAMES_ID = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
];

const DAY_NAMES_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export default function ChurchCalendarModal({
    isOpen,
    onClose,
    events = [],
}: ChurchCalendarModalProps) {
    const today = new Date();
    const [currentDate, setCurrentDate] = useState(new Date());
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
        if (!isOpen) return;

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
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Calculate days in month and starting day
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const handlePrevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const handleCurrentMonth = () => {
        setCurrentDate(new Date());
    };

    const isCurrentMonth =
        today.getFullYear() === year && today.getMonth() === month;

    // Filter events for current selected month (ready for future backend integration)
    const currentMonthEvents = events.filter((ev) => {
        const evDate = new Date(ev.startDate);
        return evDate.getFullYear() === year && evDate.getMonth() === month;
    });

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 transition-opacity duration-300 ease-out"
            role="presentation"
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-300"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Card */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Kalender Agenda JKI Shema"
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 w-full max-w-xl max-h-[90vh] flex flex-col bg-white rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200"
            >
                {/* Close Button at Top-Right Corner */}
                <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={onClose}
                    aria-label="Tutup kalender agenda"
                    className="absolute top-4 right-4 z-20 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Calendar Content Area */}
                <div className="p-5 sm:p-6 pt-5 sm:pt-6 overflow-y-auto space-y-5">
                    {/* Month and Year Navigation */}
                    <div className="flex items-center justify-between pr-10">
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                                {MONTH_NAMES_ID[month]}
                            </span>
                            <span className="text-lg sm:text-xl font-medium text-slate-400">
                                {year}
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                            {!isCurrentMonth && (
                                <button
                                    type="button"
                                    onClick={handleCurrentMonth}
                                    className="px-2.5 py-1 text-xs font-semibold text-[#0B1930] bg-slate-100 hover:bg-slate-200 rounded-full transition-colors mr-1 cursor-pointer"
                                >
                                    Hari Ini
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={handlePrevMonth}
                                aria-label="Bulan sebelumnya"
                                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                type="button"
                                onClick={handleNextMonth}
                                aria-label="Bulan berikutnya"
                                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Calendar Grid Table */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                        {/* Day Names Row */}
                        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 text-center py-2.5">
                            {DAY_NAMES_ID.map((dayName, idx) => (
                                <span
                                    key={dayName}
                                    className={`text-xs font-bold tracking-wider ${
                                        idx === 0 ? "text-red-500" : "text-slate-600"
                                    }`}
                                >
                                    {dayName}
                                </span>
                            ))}
                        </div>

                        {/* Calendar Days Matrix */}
                        <div className="grid grid-cols-7 text-center divide-x divide-y divide-slate-100">
                            {/* Preceding month padding days */}
                            {Array.from({ length: firstDayIndex }).map((_, i) => {
                                const prevDay = prevMonthDays - firstDayIndex + 1 + i;
                                return (
                                    <div
                                        key={`prev-${i}`}
                                        className="h-10 sm:h-12 flex items-center justify-center text-xs font-medium text-slate-300 bg-slate-50/50"
                                    >
                                        {prevDay}
                                    </div>
                                );
                            })}

                            {/* Current month active days */}
                            {Array.from({ length: totalDaysInMonth }).map((_, i) => {
                                const dayNum = i + 1;
                                const isToday =
                                    isCurrentMonth && today.getDate() === dayNum;

                                return (
                                    <div
                                        key={`day-${dayNum}`}
                                        className={`h-10 sm:h-12 flex items-center justify-center relative transition-colors ${
                                            isToday
                                                ? "bg-blue-50/80 font-bold"
                                                : "hover:bg-slate-50"
                                        }`}
                                    >
                                        <span
                                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs sm:text-sm ${
                                                isToday
                                                    ? "bg-[#0B1930] text-white font-extrabold shadow-md"
                                                    : "text-slate-800 font-semibold"
                                            }`}
                                        >
                                            {dayNum}
                                        </span>
                                    </div>
                                );
                            })}

                            {/* Trailing month padding days to complete grid */}
                            {Array.from({
                                length: (7 - ((firstDayIndex + totalDaysInMonth) % 7)) % 7,
                            }).map((_, i) => (
                                <div
                                    key={`next-${i}`}
                                    className="h-10 sm:h-12 flex items-center justify-center text-xs font-medium text-slate-300 bg-slate-50/50"
                                >
                                    {i + 1}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Empty State Banner (As specifically required) */}
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 flex flex-col items-center justify-center text-center">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                            <CalendarIcon className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-semibold text-slate-600">
                            Belum ada agenda yang tersedia.
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Jadwal kegiatan untuk bulan {MONTH_NAMES_ID[month]} {year} akan diumumkan segera.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
