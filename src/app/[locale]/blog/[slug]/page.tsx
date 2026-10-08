import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { slug } = await params;
    const post = await prisma.post.findUnique({
        where: { slug },
        select: { title: true, excerpt: true, seoTitle: true, seoDescription: true, coverImage: true },
    });
    if (!post) return {};
    const title = post.seoTitle ?? post.title;
    const description = post.seoDescription ?? post.excerpt ?? '';
    return {
        title,
        description,
        openGraph: {
            type: 'article',
            title: post.title,
            description,
            images: post.coverImage ? [post.coverImage] : undefined,
        },
        twitter: { card: 'summary_large_image', title, description },
    };
}

export default async function PostPage({ params }: Params) {
    const { locale, slug } = await params;
    setRequestLocale(locale);
    const post = await prisma.post.findUnique({ where: { slug, status: 'PUBLISHED' } });
    if (!post) notFound();

    // Article 结构化数据：让 Google 出富摘要（标题/图/日期/作者）
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.excerpt ?? '',
        image: post.coverImage ?? undefined,
        datePublished: post.publishedAt?.toISOString(),
        dateModified: post.updatedAt.toISOString(),
        author: { '@type': 'Organization', name: post.author ?? 'ProPack Custom' },
        publisher: { '@type': 'Organization', name: 'ProPack Custom' },
    };

    return (
        <main className="mx-auto max-w-[760px] px-5 py-10">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

            <Link href="/blog" className="text-sm text-neutral-500 hover:text-neutral-900">← Back to blog</Link>
            <h1 className="mt-4 text-3xl font-black leading-tight text-neutral-900 sm:text-4xl">{post.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
                {post.publishedAt && <time dateTime={post.publishedAt.toISOString()}>{post.publishedAt.toISOString().slice(0, 10)}</time>}
                {post.author && <span>· {post.author}</span>}
            </div>
            {post.coverImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.coverImage} alt={post.title} className="mt-6 w-full rounded-xl object-cover" />
            )}

            {/* 正文：body 存 Markdown。骨架阶段按纯文本保留换行渲染，下一步接 react-markdown 做专业排版 */}
            <article className="mt-8 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-800">
                {post.body}
            </article>

            {post.tags.length > 0 && (
                <div className="mt-8 flex flex-wrap gap-2 border-t border-neutral-100 pt-6">
                    {post.tags.map((t) => (
                        <span key={t} className="rounded bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">{t}</span>
                    ))}
                </div>
            )}
        </main>
    );
}
