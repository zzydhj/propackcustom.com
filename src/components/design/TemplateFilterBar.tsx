import { Link } from '@/navigation';

// 模板库的筛选条（类型胶囊 + 搜索框），/design 与 /design/[productType] 共用一份。
//
// 为什么必须共用：之前只有 /design 有胶囊，点进分类后胶囊就消失了 ——
// 用户想换分类只能后退一步，这是断的（用户实测反馈）。现在两个页面都渲染它，
// 且当前分类的胶囊是选中态。
//
// 约定：分类走路径（/design/label），搜索与分页走查询（?q=&page=）；
// 搜索表单提交到**当前路径**，所以在分类页搜就还在分类内搜。

const chip = 'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition';
const chipOn = 'border-neutral-900 bg-neutral-900 text-white';
const chipOff = 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-900';

export type TypeFacet = { productType: string; count: number };

export function TemplateFilterBar({
    facets,
    current,
    q,
    basePath,
}: {
    facets: TypeFacet[];
    /** 当前分类；不传表示「全部」 */
    current?: string;
    /** 当前搜索词：切换分类时保留，所以胶囊链接自己拼 ?q= */
    q?: string;
    /** 搜索表单提交到哪：分类页传 /design/label，全部页传 /design */
    basePath: string;
}) {
    const allCount = facets.reduce((n, f) => n + f.count, 0);
    const qSuffix = q ? `?q=${encodeURIComponent(q)}` : '';

    return (
        <div className="mt-6 border-y border-neutral-200 py-3">
            <div className="flex flex-wrap items-center gap-2">
                {/* All 的计数取 facet 之和：list.total 已被分类/搜索收窄，不代表全部 */}
                <Link href={`/design${q ? `?q=${encodeURIComponent(q)}` : ''}`} className={`${chip} ${!current ? chipOn : chipOff}`}>
                    All · {allCount.toLocaleString('en-US')}
                </Link>
                {facets.map((f) => (
                    <Link
                        key={f.productType}
                        href={`/design/${f.productType}${qSuffix}`}
                        className={`${chip} capitalize ${f.productType === current ? chipOn : chipOff}`}
                    >
                        {f.productType} · {f.count.toLocaleString('en-US')}
                    </Link>
                ))}
            </div>

            {/* 搜索框另起一行靠左：右侧有 z-40 的浮动工具栏（FloatingHelp），
                靠右放会被它盖住，实测点提交会跳到 /quote */}
            <form method="GET" action={basePath} className="mt-3 flex max-w-sm items-center gap-2">
                <input name="q" defaultValue={q} placeholder="Search templates…" className="h-8 w-full rounded-md border border-neutral-300 px-3 text-xs outline-none focus:border-neutral-900" />
                <button type="submit" className={`${chip} ${chipOff} shrink-0`}>Search</button>
            </form>
        </div>
    );
}
