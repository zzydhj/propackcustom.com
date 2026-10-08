import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Packaging Videos — Factory, Printing & How-to',
    description: 'Factory tours, printing processes and custom packaging how-to videos for B2B buyers.',
};

export default async function VideosPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const videos = await prisma.video.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        take: 60,
        select: { slug: true, title: true, description: true, coverImage: true, durationSec: true },
    });

    return (
        <main className="mx-auto max-w-[960px] px-5 py-10">
            <h1 className="text-3xl font-black text-neutral-900 sm:text-4xl">Videos</h1>
            <p className="mt-2 text-neutral-600">Factory tours, printing processes and packaging how-tos.</p>

            {videos.length === 0 ? (
                <p className="mt-12 text-neutral-500">No videos published yet — check back soon.</p>
            ) : (
                <div className="mt-8 grid gap-6 sm:grid-cols-2">
                    {videos.map((v) => (
                        <Link key={v.slug} href={`/videos/${v.slug}`} className="group rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-900">
                            <div className="relative mb-3 aspect-video overflow-hidden rounded-lg bg-neutral-100">
                                {v.coverImage ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={v.coverImage} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="grid h-full place-items-center text-4xl text-neutral-300">▶</span>
                                )}
                                {v.durationSec != null && (
                                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                                        {Math.floor(v.durationSec / 60)}:{String(v.durationSec % 60).padStart(2, '0')}
                                    </span>
                                )}
                            </div>
                            <h2 className="font-bold text-neutral-900 group-hover:underline">{v.title}</h2>
                            {v.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{v.description}</p>}
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
