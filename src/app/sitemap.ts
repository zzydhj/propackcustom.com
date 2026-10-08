import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'https://propackcustom.com';

// 动态 sitemap：静态页 + 全部已发布产品/博客/视频。内容更新后自动反映，无需手工维护
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const [products, posts, videos] = await Promise.all([
        prisma.product.findMany({ where: { active: true }, select: { slug: true } }),
        prisma.post.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
        prisma.video.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
    ]);
    const now = new Date();

    const statics: MetadataRoute.Sitemap = [
        { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
        { url: `${BASE}/products`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
        { url: `${BASE}/quote`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
        { url: `${BASE}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
        { url: `${BASE}/videos`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    ];
    const productUrls: MetadataRoute.Sitemap = products.map((p) => ({
        url: `${BASE}/products/${p.slug}`, lastModified: now, changeFrequency: 'weekly', priority: 0.9,
    }));
    const postUrls: MetadataRoute.Sitemap = posts.map((p) => ({
        url: `${BASE}/blog/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly', priority: 0.7,
    }));
    const videoUrls: MetadataRoute.Sitemap = videos.map((v) => ({
        url: `${BASE}/videos/${v.slug}`, lastModified: v.updatedAt, changeFrequency: 'monthly', priority: 0.6,
    }));

    return [...statics, ...productUrls, ...postUrls, ...videoUrls];
}
