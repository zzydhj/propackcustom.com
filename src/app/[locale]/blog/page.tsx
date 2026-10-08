import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Packaging Blog — Materials, Printing & Sourcing',
    description: 'In-depth guides on custom packaging materials, printing methods, dielines and B2B sourcing for wholesale buyers.',
};

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const posts = await prisma.post.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        take: 60,
        select: { slug: true, title: true, excerpt: true, coverImage: true, tags: true, publishedAt: true },
    });

    return (
        <main className="mx-auto max-w-[960px] px-5 py-10">
            <h1 className="text-3xl font-black text-neutral-900 sm:text-4xl">Packaging Blog</h1>
            <p className="mt-2 max-w-2xl text-neutral-600">
                Materials, printing, dielines and sourcing — in-depth, professional guides for B2B buyers.
            </p>

            {posts.length === 0 ? (
                <p className="mt-12 text-neutral-500">No articles published yet — check back soon.</p>
            ) : (
                <div className="mt-8 grid gap-6 sm:grid-cols-2">
                    {posts.map((p) => (
                        <Link key={p.slug} href={`/blog/${p.slug}`} className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-900">
                            {p.coverImage && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.coverImage} alt="" className="mb-4 h-40 w-full rounded-lg object-cover" />
                            )}
                            <h2 className="text-lg font-bold text-neutral-900 group-hover:underline">{p.title}</h2>
                            {p.excerpt && <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{p.excerpt}</p>}
                            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                                {p.tags.map((t) => (
                                    <span key={t} className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{t}</span>
                                ))}
                                {p.publishedAt && (
                                    <span className="ml-auto text-xs text-neutral-400">{p.publishedAt.toISOString().slice(0, 10)}</span>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
