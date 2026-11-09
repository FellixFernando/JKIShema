
"use client";

export default function AnimatedBlobBackground() {
    const gradient =
        "bg-[radial-gradient(ellipse_at_center,#000000_0%,#000000_6%,#0340A3_25%,#075BFF_45%,#60A5FA_68%,#DBEAFE_85%,transparent_100%)]";

    return (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-white">

            {/* Blob 1 — kiri atas */}
            <div
                className={`absolute -left-[20rem] sm:-left-[16rem] md:-left-72 -top-12 h-[34rem] w-[38rem] sm:h-[38rem] sm:w-[44rem] md:h-[42rem] md:w-[52rem] rounded-[42%_58%_65%_35%/45%_40%_60%_55%] ${gradient} blur-[55px] animate-blob`}
            />

            {/* Blob 2 — kanan bawah */}
            <div
                className={`absolute -right-[20rem] sm:-right-[16rem] md:-right-72 top-[60%] md:top-[30%] h-[36rem] w-[38rem] sm:h-[40rem] sm:w-[44rem] md:h-[46rem] md:w-[50rem] rounded-[60%_40%_35%_65%/50%_60%_40%_50%] ${gradient} blur-[65px] animate-blob animation-delay-2000`}
            />

        </div>
    );
}
