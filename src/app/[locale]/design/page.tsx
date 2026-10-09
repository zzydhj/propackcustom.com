import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import {
    TEMPLATE_PAGE_SIZE,
    TEMPLATE_LIST_SELECT,
    listTemplates,
    templateTypeFacets,
    type TemplateListItem,
} from '@/lib/template-query';
import { Pager } from '@/components/ui/Pager';
import { TemplateCard } from '@/components/design/TemplateCard';
import { FreeDesignCallout } from '@/components/design/FreeDesignCallout';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Design Studio — Templates',
    description: 'Browse custom packaging and label templates, design online in your browser, then order.',
};

function qs(base: Record<string, string | undefined>, over: Record<string, string | undefined>) {
    const merged = { ...base, ...over };
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : '';
}

const chip = 'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition';
const chipOff = 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-900';
const chipOn = 'border-neutral-900 bg-neutral-900 text-white';

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
    const [list, facets] = await Promise.all([
        listTemplates<TemplateListItem>({ q: sp.q, productType: sp.type, activeOnly: true, page, take: TEMPLATE_PAGE_SIZE }, TEMPLATE_LIST_SELECT),
        templateTypeFacets({ q: sp.q, activeOnly: true }),
    ]);
    const href = (p: number) => `/design${qs(sp, { page: String(p) })}`;

    return (
        <main className="mx-auto max-w-[1440px] px-5 py-10 2xl:px-12">
            <h1 className="text-3xl font-black text-neutral-900 sm:text-4xl">Design Studio</h1>
            <p className="mt-2 max-w-2xl text-neutral-600">
                Pick a sized template, design your packaging right in the browser — text, artwork and dielines — then send it straight to order.
            </p>

            {/* 免费设计服务引导：模板库是自助入口，很多人卡在这一步就走掉 */}
            <FreeDesignCallout className="mt-6" />

            {/* 筛选条：类型按分组计数渲染（计数跟 q 走），两者都写进 URL，可分享可前进后退。
                搜索框故意另起一行靠左侧：右侧有 z-40 的浮动工具栏，靠右会被它盖住导致点到“Quote”。 */}
            <div className="mt-6 border-y border-neutral-200 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/design${qs(sp, { type: undefined, q: undefined, page: undefined })}`} className={`${chip} ${!sp.type && !sp.q ? chipOn : chipOff}`}>
                        {/* “All” 的计数不能选 list.total：那已经按当前 type 收窄了，会变成“选了 label 时 All 也显示 2” */}
                        All · {facets.reduce((n, f) => n + f.count, 0).toLocaleString('en-US')}
                    </Link>
                    {facets.map((f) => (
                        <Link key={f.productType} href={`/design${qs(sp, { type: f.productType, page: undefined })}`} className={`${chip} capitalize ${sp.type === f.productType ? chipOn : chipOff}`}>
                            {f.productType} · {f.count.toLocaleString('en-US')}
                        </Link>
                    ))}
                </div>
                <form method="GET" action="/design" className="mt-3 flex max-w-sm items-center gap-2">
                    {sp.type && <input type="hidden" name="type" value={sp.type} />}
                    <input name="q" defaultValue={sp.q} placeholder="Search templates…" className="h-8 w-full rounded-md border border-neutral-300 px-3 text-xs outline-none focus:border-neutral-900" />
                    <button type="submit" className={`${chip} ${chipOff} shrink-0`}>Search</button>
                </form>
            </div>

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
