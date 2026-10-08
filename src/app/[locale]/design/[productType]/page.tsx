import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';
import { DesignStudio } from '@/components/design/DesignStudio';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Design Studio — Create Your Packaging Online',
    description: 'Design custom packaging and labels online — pick a template, edit text and artwork in your browser, then order directly.',
};

type Props = { params: Promise<{ locale: string; productType: string }>; searchParams: Promise<{ template?: string }> };

export default async function DesignPage({ params, searchParams }: Props) {
    const { locale, productType } = await params;
    const sp = await searchParams;
    setRequestLocale(locale);

    const selected = sp.template
        ? await prisma.designTemplate.findFirst({ where: { slug: sp.template, productType, active: true } })
        : null;

    const templates = await prisma.designTemplate.findMany({
        where: { productType, active: true },
        orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });

    // 选中模板：套用其尺寸 + 预置场景进入编辑器
    if (selected) {
        const objects = (selected.sceneTemplate as { objects?: unknown[] } | null)?.objects ?? [];
        return (
            <main className="mx-auto max-w-[1440px] px-5 py-8 2xl:px-12">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/design/${productType}`} className="text-sm text-neutral-500 hover:text-neutral-900">← Choose another template</Link>
                    <span className="text-sm font-medium text-neutral-700">
                        {selected.name} · {selected.widthMm ?? '—'}×{selected.heightMm ?? '—'}mm
                    </span>
                </div>
                <DesignStudio
                    productType={productType}
                    widthMm={selected.widthMm ?? 100}
                    heightMm={selected.heightMm ?? 100}
                    initialScene={objects.length ? JSON.stringify({ version: '7.4.0', objects }) : undefined}
                />
            </main>
        );
    }

    // 有该类型模板：先展示模板库供选择
    if (templates.length > 0) {
        return (
            <main className="mx-auto max-w-[1440px] px-5 py-10 2xl:px-12">
                <h1 className="text-2xl font-black text-neutral-900 sm:text-3xl">Choose a template</h1>
                <p className="mt-2 text-neutral-600">
                    Start from a sized template for <span className="font-semibold text-neutral-900">{productType}</span>, or
                    <Link href={`/design/${productType}?template=__blank`} className="ml-1 font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">design from scratch</Link>.
                </p>
                <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {templates.map((tpl) => (
                        <Link
                            key={tpl.slug}
                            href={`/design/${productType}?template=${tpl.slug}`}
                            className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-900"
                        >
                            <div
                                className="mb-3 grid w-full place-items-center overflow-hidden rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-100 [&>svg]:h-auto [&>svg]:w-full"
                                style={{ aspectRatio: `${tpl.widthMm ?? 1} / ${tpl.heightMm ?? 1}` }}
                                // 模板自带刀版 SVG 作为预览（内容来自后台/seed，可信）
                                dangerouslySetInnerHTML={{ __html: tpl.dielineSvg ?? '<svg viewBox="0 0 1 1"></svg>' }}
                            />
                            <p className="font-semibold text-neutral-900 group-hover:underline">{tpl.name}</p>
                            <p className="mt-0.5 text-xs text-neutral-500">{tpl.widthMm ?? '—'} × {tpl.heightMm ?? '—'} mm · bleed {tpl.bleedMm}mm</p>
                        </Link>
                    ))}
                </div>
            </main>
        );
    }

    // 该类型暂无模板：回退空白画布
    return (
        <main className="mx-auto max-w-[1440px] px-5 py-8 2xl:px-12">
            <DesignStudio productType={productType} />
        </main>
    );
}
