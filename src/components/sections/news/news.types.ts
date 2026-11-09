export type NewsCategory = "ACARA" | "BERITA" | "PELAYANAN";

export interface NewsItem {
    id: string;
    title: string;
    slug: string;
    category: NewsCategory;
    imageUrl: string;
    publishedAt: string;
    excerpt: string;
    content: string;
}

export interface ChurchEvent {
    id: string;
    title: string;
    description?: string;
    startDate: string;
    endDate?: string;
    location?: string;
    category?: string;
}
