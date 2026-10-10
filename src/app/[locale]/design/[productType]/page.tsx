import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';
import { withQuery } from '@/lib/query-string';
import { DesignStudio } from '@/components/design/DesignStudio';
import { TemplateCard } from '@/components/design/TemplateCard';
import { TemplateFilterBar } from '@/components/design/TemplateFilterBar';
import { FreeDesignCallout } from '@/components/design/FreeDesignCallout';
import { Pager } from '@/components/ui/Pager';
import {
    TEMPLATE_PAGE_SIZE,
    TEMPLATE_LIST_SELECT,
    listTemplates,
    templateTypeFacets,
    type TemplateListItem,
} from '@/lib/template-query';

export const dynamic = 'force-dynamic';

// 每个分类页一个标题/描述：之前五个分类页共用一个静态 metadata，等于五个 URL 一个标题
export async function generateMetadata({ params }: { params: Promise<{ productType: string }> }): Promise<Metadata> {
    const { productType } = await params;
    const label = productType.charAt(0).toUpperCase() + productType.slice(1);
    return {
        title: `${label} Templates — Design Online & Order`,
        description: `Pick a sized ${productType} template, edit text and artwork right in your browser, then send it straight to print.`,
    };
}

type Props = { params: Promise<{ locale: string; productType: string }>; searchParams: Promise<{ template?: string; design?: string; blank?: string; page?: string; q?: string }> };

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
                fullBleed={tpl?.fullBleed ?? false}
                templateSlug={tpl?.slug}
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
                fullBleed={selected.fullBleed}
                templateSlug={selected.slug}
                initialScene={objects.length ? JSON.stringify({ version: '7.4.0', objects }) : undefined}
            />
        );
    }

    // 3) 空白画布：?blank=1 才是“从零开始”。
    //    以前“design from scratch”链到 /design/[type] 本身，有模板的类型会回到同一个列表，永远走不到空白编辑器。
    if (sp.blank) {
        return <DesignStudio productType={productType} />;
    }

    // 4) 有该类型模板：展示模板库供选择（服务端分页，非全屏）——一个类型下可能挂几千个模板
    const page = Math.max(1, Number(sp.page) || 1);
    const [list, facets] = await Promise.all([
        listTemplates<TemplateListItem>({ productType, q: sp.q, activeOnly: true, page, take: TEMPLATE_PAGE_SIZE }, TEMPLATE_LIST_SELECT),
        // 胶囊的计数跟搜索词走，否则会出现“chip 写 48、点进去只有 3 个”
        templateTypeFacets({ q: sp.q, activeOnly: true }),
    ]);
    // 带搜索词时即使 0 结果也要给列表页（要让用户看到“没匹配”并清掉搜索），
    // 不能落到分支 5 的空白编辑器 —— 那等于把搜索失败伪装成“该分类没模板”
    if (list.total > 0 || sp.q) {
        return (
            <main className="mx-auto max-w-[1440px] px-5 py-10 2xl:px-12">
                {/* h1 带类型名：以前不管哪个类型都写“Choose a template”，五个分类页共用一个标题，对 SEO 和客户定位都没用 */}
                <h1 className="text-2xl font-black capitalize text-neutral-900 sm:text-3xl">{productType} templates</h1>
                <p className="mt-2 text-neutral-600">
                    <span className="font-semibold text-neutral-900">{list.total.toLocaleString('en-US')}</span> sized templates for{' '}
                    <span className="font-semibold text-neutral-900 capitalize">{productType}</span>, or
                    <Link href={`/design/${productType}?blank=1`} className="ml-1 font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">design from scratch</Link>.
                </p>
                <FreeDesignCallout className="mt-6" />
                {/* 与 /design 同一份筛选条：当前分类胶囊高亮，换分类不用先后退 */}
                <TemplateFilterBar facets={facets} current={productType} q={sp.q} basePath={`/design/${productType}`} />
                {list.capped && (
                    <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                        That page is too deep in the library — narrow your search or pick another category above.
                    </p>
                )}
                {list.rows.length === 0 ? (
                    <p className="mt-12 text-neutral-500">No {productType} templates match “{sp.q}”.</p>
                ) : (
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
                        href={(p) => `/design/${productType}${withQuery(sp, { page: String(p) })}`}
                    />
                </div>
            </main>
        );
    }

    // 5) 该类型暂无模板：全屏空白画布
    return <DesignStudio productType={productType} />;
}
