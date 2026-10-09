import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';
import { DesignStudio } from '@/components/design/DesignStudio';
import { TemplateCard } from '@/components/design/TemplateCard';
import { FreeDesignCallout } from '@/components/design/FreeDesignCallout';
import { Pager } from '@/components/ui/Pager';
import {
    TEMPLATE_PAGE_SIZE,
    TEMPLATE_LIST_SELECT,
    listTemplates,
    type TemplateListItem,
} from '@/lib/template-query';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Design Studio — Create Your Packaging Online',
    description: 'Design custom packaging and labels online — pick a template, edit text and artwork in your browser, then order directly.',
};

type Props = { params: Promise<{ locale: string; productType: string }>; searchParams: Promise<{ template?: string; design?: string; page?: string }> };

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

    // 3) 有该类型模板：展示模板库供选择（服务端分页，非全屏）——一个类型下可能挂几千个模板
    const page = Math.max(1, Number(sp.page) || 1);
    const list = await listTemplates<TemplateListItem>(
        { productType, activeOnly: true, page, take: TEMPLATE_PAGE_SIZE },
        TEMPLATE_LIST_SELECT,
    );
    if (list.total > 0) {
        return (
            <main className="mx-auto max-w-[1440px] px-5 py-10 2xl:px-12">
                <h1 className="text-2xl font-black text-neutral-900 sm:text-3xl">Choose a template</h1>
                <p className="mt-2 text-neutral-600">
                    <span className="font-semibold text-neutral-900">{list.total.toLocaleString('en-US')}</span> sized templates for{' '}
                    <span className="font-semibold text-neutral-900 capitalize">{productType}</span>, or
                    <Link href={`/design/${productType}`} className="ml-1 font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">design from scratch</Link>.
                </p>
                <FreeDesignCallout className="mt-6" />
                {list.capped && (
                    <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                        That page is too deep in the library — use the search box on the Design Studio home page to narrow it down.
                    </p>
                )}
                {list.rows.length > 0 && (
                    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        {list.rows.map((tpl) => (
                            <TemplateCard key={tpl.slug} tpl={tpl} />
                        ))}
                    </div>
                )}
                <div className="mt-8">
                    <Pager
                        page={list.page}
                        pages={list.pages}
                        total={list.total}
                        unit="templates"
                        href={(p) => `/design/${productType}?page=${p}`}
                    />
                </div>
            </main>
        );
    }

    // 4) 该类型暂无模板：全屏空白画布
    return <DesignStudio productType={productType} />;
}
