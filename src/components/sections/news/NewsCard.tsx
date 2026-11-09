"use client";

import { NewsItem } from "./news.types";
import NewsCategoryBadge from "./NewsCategoryBadge";

type NewsCardProps = {
    news: NewsItem;
    onClick: (news: NewsItem) => void;
};

export default function NewsCard({ news, onClick }: NewsCardProps) {
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick(news);
        }
    };

    return (
        <article
            role="button"
            tabIndex={0}
            onClick={() => onClick(news)}
            onKeyDown={handleKeyDown}
            aria-label={`Lihat detail informasi: ${news.title}`}
            className="group cursor-pointer flex flex-col w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-2xl transition-all duration-300"
        >
            {/* Banner Image Container with Category Badge */}
            <div className="relative overflow-hidden w-full aspect-[16/10] bg-slate-100 rounded-2xl sm:rounded-[26px] shadow-sm transition-shadow duration-300 group-hover:shadow-lg">
                <NewsCategoryBadge
                    category={news.category}
                    className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 z-10"
                />

                <img
                    src={news.imageUrl}
                    alt={news.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:transform-none"
                />
            </div>

            {/* Publication Date */}
            <time
                dateTime={news.publishedAt}
                className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-3.5 sm:mt-4"
            >
                {news.publishedAt}
            </time>

            {/* News Title */}
            <h3 className="text-base sm:text-lg md:text-xl font-semibold text-slate-900 uppercase tracking-tight mt-1 line-clamp-2 leading-snug group-hover:text-blue-900 transition-colors">
                {news.title}
            </h3>
        </article>
    );
}
