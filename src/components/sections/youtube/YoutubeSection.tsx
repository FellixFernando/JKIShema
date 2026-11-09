
export default function YoutubeSection() {
    const videoId = "bnB30kWxj5s";

    return (
        <section className="w-full px-4 py-16 sm:px-8">
            <div className="mx-auto max-w-5xl">
                <div className="overflow-hidden rounded-2xl border border-white/20 shadow-xl">
                    <div className="aspect-video w-full">
                        <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title="Video JKI Shema"
                            className="h-full w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            loading="lazy"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
