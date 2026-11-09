type HeroSectionProps = {
    isRegistrationOpen?: boolean;
};

export default function HeroSection({
    isRegistrationOpen,
}: HeroSectionProps) {
    return (
        <section
            id="home"
            className="relative flex min-h-svh w-full items-center justify-center overflow-hidden"
        >
            {/* Banner Khusus Mobile (< sm) */}
            <div
                className="sm:hidden absolute inset-0 bg-[url('/images/hero/welcome-poster-mobile.png')] bg-cover bg-center"
                role="img"
                aria-label="Welcome to JKI Shema (Mobile)"
            />

            {/* Banner Desktop (>= sm) */}
            <div
                className="hidden sm:block absolute inset-0 bg-[url('/images/hero/welcome-poster.png')] bg-cover bg-center"
                role="img"
                aria-label="Welcome to JKI Shema"
            />
        </section>
    );
}