import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ locale: string; slug: string }> };

// 按 provider 拼播放地址：YouTube/Vimeo 用 embed，自托管直接用 videoUrl
function embedSrc(v: { provider: string; embedId: string | null; videoUrl: string | null }): string | null {
    if (v.provider === 'youtube' && v.embedId) return `https://www.youtube-nocookie.com/embed/${v.embedId}`;
    if (v.provider === 'vimeo' && v.embedId) return `https://player.vimeo.com/video/${v.embedId}`;
    return v.videoUrl;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { slug } = await params;
    const v = await prisma.video.findUnique({
        where: { slug },
        select: { title: true, description: true, seoTitle: true, seoDescription: true, coverImage: true },
    });
    if (!v) return {};
    const title = v.seoTitle ?? v.title;
    const description = v.seoDescription ?? v.description ?? '';
    return {
        title,
        description,
        openGraph: { type: 'video.other', title: v.title, description, images: v.coverImage ? [v.coverImage] : undefined },
    };
}

export default async function VideoPage({ params }: Params) {
    const { locale, slug } = await params;
    setRequestLocale(locale);
    const v = await prisma.video.findUnique({ where: { slug, status: 'PUBLISHED' } });
    if (!v) notFound();
    const src = embedSrc(v);

    // VideoObject 结构化数据：让视频进 Google 视频富结果
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: v.title,
        description: v.description ?? '',
        thumbnailUrl: v.coverImage ?? undefined,
        uploadDate: v.publishedAt?.toISOString(),
        duration: v.durationSec != null ? `PT${Math.floor(v.durationSec / 60)}M${v.durationSec % 60}S` : undefined,
        embedUrl: src ?? undefined,
    };

    return (
        <main className="mx-auto max-w-[900px] px-5 py-10">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

            <Link href="/videos" className="text-sm text-neutral-500 hover:text-neutral-900">← Back to videos</Link>
            <h1 className="mt-4 text-3xl font-black text-neutral-900">{v.title}</h1>

            <div className="mt-6 aspect-video overflow-hidden rounded-xl bg-black">
                {src ? (
                    <iframe
                        src={src}
                        title={v.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="h-full w-full"
                    />
                ) : (
                    <div className="grid h-full place-items-center text-sm text-neutral-400">Video source not configured</div>
                )}
            </div>

            {v.description && <p className="mt-6 leading-relaxed text-neutral-700">{v.description}</p>}

            {v.transcript && (
                <details className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
                    <summary className="cursor-pointer font-semibold text-neutral-800">Transcript</summary>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">{v.transcript}</p>
                </details>
            )}
        </main>
    );
}
