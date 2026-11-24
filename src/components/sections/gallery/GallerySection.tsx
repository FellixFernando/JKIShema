import Link from "next/link";
import Image from "next/image";
import { mockGalleryItems, GalleryItem } from "./gallery.mock";

export default function GallerySection({
    items = mockGalleryItems,
}: {
    items?: GalleryItem[];
}) {
    const featuredItem = items[0];
    const gridItems = items.slice(1, 5);

    return (
        <div className="pt-16 sm:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    {/* Featured Large Image (Item 1) */}
                    {featuredItem && (
                        <div
                            key={featuredItem.id}
                            className="group relative col-span-2 row-span-2 aspect-square md:aspect-auto md:min-h-[424px] bg-slate-200/80 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm"
                        >
                            <Image
                                src={featuredItem.src}
                                alt={featuredItem.alt}
                                fill
                                sizes="(max-width: 768px) 100vw, 50vw"
                                priority
                                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:transform-none"
                            />
                        </div>
                    )}

                    {/* 4 Grid Images (Items 2-5) */}
                    {gridItems.map((item) => (
                        <div
                            key={item.id}
                            className="group relative aspect-square bg-slate-200/80 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm"
                        >
                            <Image
                                src={item.src}
                                alt={item.alt}
                                fill
                                sizes="(max-width: 768px) 50vw, 25vw"
                                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:transform-none"
                            />
                        </div>
                    ))}
                </div>

                <div className="flex justify-center">
                    <Link
                        href="/gallery"
                        className="bg-[#051438] hover:bg-[#0a235c] text-white text-xs sm:text-sm font-bold tracking-wider uppercase px-6 py-2.5 sm:px-7 sm:py-3 rounded-full shadow-md shadow-[#051438]/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shrink-0"
                    >
                        LIHAT SEMUA
                    </Link>
                </div>
            </div>
        </div>
    );
}
