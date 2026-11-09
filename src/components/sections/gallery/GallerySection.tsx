import Link from "next/link";

export default function GallerySection() {
    const items = [1, 2, 3, 4, 5];

    return (
        <section
            id="gallery"
            className="py-16 sm:py-24 px-4 sm:px-6 bg-black"
        >

            <div className="max-w-5xl mx-auto space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    {items.slice(0, 1).map((item) => (
                        <div
                            key={item}
                            className="col-span-2 row-span-2 aspect-square md:aspect-auto md:min-h-[424px] bg-slate-200 rounded-2xl flex items-center justify-center text-slate-400 font-medium text-xs"
                        >
                            Dokumentasi Kegiatan {item}
                        </div>
                    ))}

                    {items.slice(1, 5).map((item) => (
                        <div
                            key={item}
                            className="aspect-square bg-slate-200 rounded-2xl flex items-center justify-center text-slate-400 font-medium text-xs"
                        >
                            Dokumentasi Kegiatan {item}
                        </div>
                    ))}
                </div>

                <div className="flex justify-center">


                    <Link
                        href="/gallery"
                        className="animated-gradient-border inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-semibold text-white"
                    >
                        LIHAT SEMUA
                    </Link>


                </div>
            </div>

        </section>
    );
}