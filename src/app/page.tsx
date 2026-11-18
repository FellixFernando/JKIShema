import { getSystemConfig } from "@/services/config.service";

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

import HeroMottoCrossfade from "@/components/sections/hero/HeroMottoCrossfade";
import NewsSection from "@/components/sections/news/NewsSection";
import { mockNewsData } from "@/components/sections/news/news.mock";
import AboutSection from "@/components/sections/about/AboutSection";
import JadwalIbadahSection from "@/components/sections/jadwal/JadwalIbadahSection";
import GallerySection from "@/components/sections/gallery/GallerySection";
import YoutubeSection from "@/components/sections/youtube/YoutubeSection";
import ContactSection from "@/components/sections/contact/ContactSection";
import ChristmasPopup from "@/components/ui/ChristmasPopup";
import AnimatedBlobBackground from "@/components/ui/AnimatedBlobBg";

export const revalidate = 0;

export default async function HomePage() {
  const isRegistrationOpenConfig = await getSystemConfig(
    "is_registration_open",
    "true"
  );

  const isRegistrationOpen = isRegistrationOpenConfig === "true";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <Navbar isRegistrationOpen={isRegistrationOpen} />

      <main className="flex-1">
        <HeroMottoCrossfade isRegistrationOpen={isRegistrationOpen} />
        <NewsSection news={mockNewsData} />
        <AboutSection />
        <JadwalIbadahSection />

        {/* Shared section for Gallery & Youtube with floating animated gradient background */}
        <section id="gallery" className="relative isolate overflow-hidden bg-white">
          <AnimatedBlobBackground />
          <div className="pointer-events-none absolute inset-0 z-0 backdrop-blur-[75px]" />
          <div className="relative z-10">
            <GallerySection />
            <YoutubeSection />
          </div>
        </section>

        <ContactSection />
      </main>

      <Footer />
      <ChristmasPopup isRegistrationOpen={isRegistrationOpen} />
    </div>
  );
}