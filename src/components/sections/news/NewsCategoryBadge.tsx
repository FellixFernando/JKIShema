import { NewsCategory } from "./news.types";

type NewsCategoryBadgeProps = {
    category: NewsCategory;
    className?: string;
};

const CATEGORY_STYLES: Record<NewsCategory, string> = {
    ACARA: "bg-blue-600/90 text-white border-blue-400/30 shadow-blue-900/30",
    BERITA: "bg-emerald-600/90 text-white border-emerald-400/30 shadow-emerald-900/30",
    PELAYANAN: "bg-amber-600/90 text-white border-amber-400/30 shadow-amber-900/30",
};

export default function NewsCategoryBadge({
    category,
    className = "",
}: NewsCategoryBadgeProps) {
    const style = CATEGORY_STYLES[category] || "bg-slate-700/90 text-white border-slate-500/30";

    return (
        <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase border backdrop-blur-md shadow-sm ${style} ${className}`}
        >
            {category}
        </span>
    );
}
