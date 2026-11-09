import { Source_Serif_4 } from "next/font/google";
import { Lightbulb, Target } from "lucide-react";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export default function VisionMissionSection() {
  return (
    <section
      id="vision"
      className="pt-15 sm:pt-30 px-4 sm:px-6"
    >
      <div className="max-w-6xl mx-auto space-y-12">

        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900">TENTANG GEREJA KAMI</h2>
          <p className="text-slate-600 mt-2">
            Mengenal visi dan misi yang menjadi dasar setiap langkah pelayanan kami.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 md:gap-15 items-center justify-center py-6 md:py-10">

          {/*LEFT SIDE*/}
          <div className="flex bg-white/20 backdrop-blur-3xl border border-white/30 shadow-lg w-full min-h-[360px] md:min-h-0 md:h-[550] rounded-xl flex-col items-center justify-center md:justify-start px-6 py-12 md:px-0 md:py-30">
            <span className={`${sourceSerif.className} text-2xl md:text-3xl font-medium text-center w-full max-w-[370px] md:w-[370px] text-white md:text-[#001540]`}>
              "Pada hari-hari yang akan datang, Yakub akan berakar, Israel akan berkembang dan bertunas dan memenuhi muka bumi dengan hasilnya."
            </span>
            <span className={`${sourceSerif.className} text-lg md:text-xl text-white md:text-[#001540] pt-6 md:py-9`}>
              Yesaya 26 : 4
            </span>
          </div>

          {/*RIGHT SIDE*/}
          <div className="flex flex-col gap-5 w-full">

            {/*VISI*/}
            <div className="flex flex-col bg-white shadow-lg w-full min-h-[200px] lg:h-[260px] rounded-xl p-6 sm:p-7 lg:p-0">

              <div className="flex flex-row items-center gap-4 sm:gap-5 lg:pt-7 lg:pl-7">
                <div className="w-10 h-10 rounded-lg bg-[#001540] flex items-center justify-center shrink-0">
                  <Lightbulb className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl sm:text-3xl font-semibold text-slate-900">Visi</h3>
              </div>
              <span className="flex w-full px-4 sm:px-12 lg:px-20 pt-6 lg:pt-10 justify-center items-center text-lg sm:text-xl text-center text-slate-700">
                Bertumbuh, meluas, dan menjangkau bangsa-bangsa bagi Kristus.
              </span>
            </div>

            {/*MISI*/}
            <div className="flex flex-col bg-white shadow-lg w-full min-h-[240px] lg:h-[260px] rounded-xl p-6 sm:p-7 lg:p-0">

              <div className="flex flex-row items-center gap-4 sm:gap-5 lg:pl-7 lg:pt-7">
                <div className="w-10 h-10 rounded-lg bg-[#001540] flex items-center justify-center shrink-0">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl sm:text-3xl font-semibold text-slate-900">Misi</h3>
              </div>
              <span className="flex w-full pt-4 lg:pt-5 px-4 sm:px-12 lg:px-20 justify-center items-center text-base sm:text-xl text-center text-slate-700">
                Memperluas pelayanan, menjangkau jiwa, melangkah dalam iman, dan membangun jemaat dengan karakter yang serupa Kristus.
              </span>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}