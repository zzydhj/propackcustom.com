import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
    TEMPLATE_PAGE_SIZE,
    TEMPLATE_LIST_SELECT,
    listTemplates,
    templateTypeFacets,
    type TemplateListItem,
} from '@/lib/template-query';
import { Pager } from '@/components/ui/Pager';
import { withQuery } from '@/lib/query-string';
import { TemplateCard } from '@/components/design/TemplateCard';
import { TemplateFilterBar } from '@/components/design/TemplateFilterBar';
import { FreeDesignCallout } from '@/components/design/FreeDesignCallout';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Design Studio — Templates',
    description: 'Browse custom packaging and label templates, design online in your browser, then order.',
};

export default async function DesignHomePage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);

    const raw = await searchParams;
    const sp: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(raw)) sp[k] = Array.isArray(v) ? v[0] : v;

    const page = Math.max(1, Number(sp.page) || 1);
    // 这一页只管“全部 + 搜索”；分类已搬到路径上（/design/label），?type= 由 proxy 301 过去，不留两个地址
    const [list, facets] = await Promise.all([
        listTemplates<TemplateListItem>({ q: sp.q, activeOnly: true, page, take: TEMPLATE_PAGE_SIZE }, TEMPLATE_LIST_SELECT),
        templateTypeFacets({ q: sp.q, activeOnly: true }),
    ]);
    const href = (p: number) => `/design${withQuery(sp, { page: String(p) })}`;

    return (
        <main className="mx-auto max-w-[1440px] px-5 py-10 2xl:px-12">
            <h1 className="text-3xl font-black text-neutral-900 sm:text-4xl">Design Studio</h1>
            <p className="mt-2 max-w-2xl text-neutral-600">
                Pick a sized template, design your packaging right in the browser — text, artwork and dielines — then send it straight to order.
            </p>

            {/* 免费设计服务引导：模板库是自助入口，很多人卡在这一步就走掉 */}
            <FreeDesignCallout className="mt-6" />

            {/* 胶囊 + 搜索：与分类页共用同一个组件（之前只在这一页有，点进分类就断了） */}
            <TemplateFilterBar facets={facets} q={sp.q} basePath="/design" />

            {list.capped && (
                <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    That page is too deep in the library — narrow your search or pick a category to see more results.
                </p>
            )}

            {list.rows.length === 0 ? (
                <p className="mt-12 text-neutral-500">No templates match those filters yet.</p>
            ) : (
                <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {list.rows.map((tpl) => (
                        <TemplateCard key={tpl.slug} tpl={tpl} />
                    ))}
                </div>
            )}

            <div className="mt-8">
                <Pager page={list.page} pages={list.pages} total={list.total} unit="templates" href={href} />
            </div>
        </main>
    );
}
