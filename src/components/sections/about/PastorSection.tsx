import Image from "next/image";
import { Allura } from "next/font/google";

const allura = Allura({
    subsets: ["latin"],
    weight: ["400"],
});

export default function PastorsSection() {
    const pastors = [
        {
            name: (
                <>
                    Ps. Didik Wahyudi &amp;
                    <br />
                    Ps. Tasina Raena
                </>
            ),
            role: "Gembala Sidang - Wakil Gembala",
            image: "/images/gembala.png",
            alt: "Ps. Didik Wahyudi & Ps. Tasina Raena",
        },
        {
            name: (
                <>
                    Pnt. Jusak Purnomo &amp;
                    <br />
                    Dkn. Lisa Inggawati
                </>
            ),
            role: "Perintis",
            image: "/images/penatua.png",
            alt: "Pnt. Jusak Purnomo & Dkn. Lisa Inggawati",
        },
    ];

    return (
        <section id="pastors" className="w-full">
            <div className="max-w-5xl mx-auto space-y-10 sm:space-y-12 py-12 sm:py-20 pb-24 sm:pb-40">
                <div className="text-center max-w-2xl mx-auto">
                    <h2 className="text-3xl font-bold text-[#001540] tracking-tight">
                        GEMBALA &amp; PENATUA
                    </h2>
                    <p className="text-slate-600 mt-2">
                        Bersama melayani dan membimbing jemaat dalam kasih dan iman.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-15 max-w-4xl mx-auto">
                    {pastors.map((pastor, index) => (
                        <div
                            key={index}
                            className="flex flex-col rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl border border-white/60 bg-white/40 backdrop-blur-xl max-w-[300px] sm:max-w-xs md:max-w-none mx-auto w-full"
                        >
                            <div className="relative w-full h-56 sm:h-80">
                                <Image
                                    src={pastor.image}
                                    alt={pastor.alt}
                                    fill
                                    className="object-contain object-bottom scale-115 origin-bottom translate-y-[1px]"
                                    priority
                                />
                            </div>

                            <div className="bg-white py-4 px-4 sm:py-6 sm:px-6 text-center">
                                <h3 className={`${allura.className} text-2xl sm:text-3xl md:text-3xl lg:text-4xl text-[#001540] font-normal leading-tight sm:leading-snug`}>
                                    {pastor.name}
                                </h3>
                                <p className="text-xs sm:text-sm italic text-slate-500 mt-1.5 sm:mt-2">
                                    {pastor.role}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}