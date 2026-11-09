import VisionMissionSection from "./VisionMissionSection";
import PastorsSection from "./PastorSection";
import AnimatedBlobBackground from "@/components/ui/AnimatedBlobBg";

export default function AboutSection() {
    return (
        <div
            id="about"
            className="relative isolate overflow-hidden bg-white scroll-mt-20 min-h-svh">

            <AnimatedBlobBackground />

            <div className="pointer-events-none absolute inset-0 z-0 backdrop-blur-[75px]" />

            {/* Tentang JKI Shema */}
            <div className="relative z-10 px-4 sm:px-6 bg-transparent">
                <VisionMissionSection />
                <PastorsSection />
            </div>
        </div>
    );
}