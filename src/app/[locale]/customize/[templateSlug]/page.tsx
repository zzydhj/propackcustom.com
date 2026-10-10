import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { GuidedStudio } from '@/components/design/GuidedStudio';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; templateSlug: string }> };

// 每个模板一个可分享的定制页：既是转化入口，也是将来 SEO 的落点
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { templateSlug } = await params;
    const tpl = await prisma.designTemplate.findFirst({ where: { slug: templateSlug, active: true } });
    if (!tpl) return { title: 'Template not found' };
    return {
        title: `${tpl.name} — Quick Customize`,
        description: `Fill in your text and logo on a pre-press checked ${tpl.widthMm ?? ''}×${tpl.heightMm ?? ''}mm ${tpl.productType} template, then send it straight to order.`,
    };
}

export default async function CustomizePage({ params }: Props) {
    const { locale, templateSlug } = await params;
    setRequestLocale(locale);

    const tpl = await prisma.designTemplate.findFirst({ where: { slug: templateSlug, active: true } });
    if (!tpl) notFound();

    const objects = (tpl.sceneTemplate as { objects?: unknown[] } | null)?.objects ?? [];
    return (
        <GuidedStudio
            productType={tpl.productType}
            templateId={tpl.id}
            templateSlug={tpl.slug}
            templateName={tpl.name}
            widthMm={tpl.widthMm ?? 100}
            heightMm={tpl.heightMm ?? 100}
            bleedMm={tpl.bleedMm}
            safeAreaMm={tpl.safeAreaMm}
            dielineSvg={tpl.dielineSvg ?? undefined}
            fullBleed={tpl.fullBleed}
            initialScene={objects.length ? JSON.stringify({ version: '7.4.0', objects }) : undefined}
        />
    );
}
