import VisionMissionSection from "./VisionMissionSection";
import PastorsSection from "./PastorSection";

export default function AboutSection() {
    return (
        <section
            id="about"
            className="bg-white">
            {/* Tentang JKI Shema */}
            <div className="px-4 sm:px-6">
                <VisionMissionSection />
                <PastorsSection />
            </div>
        </section>
    );
}