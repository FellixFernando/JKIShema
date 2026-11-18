import Link from "next/link";

export default function GallerySection() {
    const items = [1, 2, 3, 4, 5];

    return (
        <div className="pt-16 sm:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    {items.slice(0, 1).map((item) => (
                        <div
                            key={item}
                            className="col-span-2 row-span-2 aspect-square md:aspect-auto md:min-h-[424px] bg-slate-200/80 backdrop-blur-sm rounded-2xl flex items-center justify-center text-slate-400 font-medium text-xs shadow-sm"
                        >
                            Dokumentasi Kegiatan {item}
                        </div>
                    ))}

                    {items.slice(1, 5).map((item) => (
                        <div
                            key={item}
                            className="aspect-square bg-slate-200/80 backdrop-blur-sm rounded-2xl flex items-center justify-center text-slate-400 font-medium text-xs shadow-sm"
                        >
                            Dokumentasi Kegiatan {item}
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