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

type Props = { params: Promise<{ locale: string; productType: string }>; searchParams: Promise<{ template?: string; design?: string }> };

export default async function DesignPage({ params, searchParams }: Props) {
    const { locale, productType } = await params;
    const sp = await searchParams;
    setRequestLocale(locale);

    // 1) 载入已有作品（最高优先）：可继续编辑并保存回同一条
    const design = sp.design ? await prisma.userDesign.findUnique({ where: { id: sp.design } }) : null;
    if (design) {
        const tpl = design.templateId ? await prisma.designTemplate.findUnique({ where: { id: design.templateId } }) : null;
        return (
            <DesignStudio
                productType={productType}
                widthMm={tpl?.widthMm ?? 100}
                heightMm={tpl?.heightMm ?? 100}
                initialScene={JSON.stringify(design.sceneJson)}
                designId={design.id}
                templateId={design.templateId}
                name={design.name}
                templateName={tpl?.name}
                dielineSvg={tpl?.dielineSvg ?? undefined}
                bleedMm={tpl?.bleedMm ?? 3}
                safeAreaMm={tpl?.safeAreaMm ?? 3}
            />
        );
    }

    // 2) 选模板：套用尺寸 + 预置场景进入全屏编辑器（保存时关联 templateId）
    const selected = sp.template
        ? await prisma.designTemplate.findFirst({ where: { slug: sp.template, productType, active: true } })
        : null;
    if (selected) {
        const objects = (selected.sceneTemplate as { objects?: unknown[] } | null)?.objects ?? [];
        return (
            <DesignStudio
                productType={productType}
                widthMm={selected.widthMm ?? 100}
                heightMm={selected.heightMm ?? 100}
                templateId={selected.id}
                templateName={selected.name}
                dielineSvg={selected.dielineSvg ?? undefined}
                bleedMm={selected.bleedMm}
                safeAreaMm={selected.safeAreaMm}
                initialScene={objects.length ? JSON.stringify({ version: '7.4.0', objects }) : undefined}
            />
        );
    }

    // 3) 有该类型模板：展示模板库供选择（常规网格页，非全屏）
    const templates = await prisma.designTemplate.findMany({
        where: { productType, active: true },
        orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    if (templates.length > 0) {
        return (
            <main className="mx-auto max-w-[1440px] px-5 py-10 2xl:px-12">
                <h1 className="text-2xl font-black text-neutral-900 sm:text-3xl">Choose a template</h1>
                <p className="mt-2 text-neutral-600">
                    Start from a sized template for <span className="font-semibold text-neutral-900">{productType}</span>, or
                    <Link href={`/design/${productType}`} className="ml-1 font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">design from scratch</Link>.
                </p>
                <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {templates.map((tpl) => (
                        <Link
                            key={tpl.slug}
                            href={`/design/${tpl.productType}?template=${tpl.slug}`}
                            className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-900"
                        >
                            <div
                                className="mb-3 grid w-full place-items-center overflow-hidden rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-100 [&>svg]:h-auto [&>svg]:w-full"
                                style={{ aspectRatio: `${tpl.widthMm ?? 1} / ${tpl.heightMm ?? 1}` }}
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

    // 4) 该类型暂无模板：全屏空白画布
    return <DesignStudio productType={productType} />;
}
