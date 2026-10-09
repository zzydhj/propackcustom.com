import { Link } from '@/navigation';

// 分页器：后台列表与前台模板库共用。只做展示，链接由调用方拼（要保留筛选条件）。
// 10 万级 → 上千页，所以只给上一页/下一页 + 跳页输入框，不给页码列表。

const btn = 'inline-flex h-8 items-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 transition hover:border-neutral-900';
const btnOff = 'inline-flex h-8 items-center rounded-md border border-neutral-200 bg-neutral-100 px-3 text-xs font-medium text-neutral-400';
const input = 'h-8 w-20 rounded-md border border-neutral-300 px-2 text-xs outline-none focus:border-neutral-900';

// 前台英文、后台中文，同一个分页器：文案集中在这里，不在调用方拼
const COPY = {
    en: { prev: '← Prev', next: 'Next →', jump: 'Go', summary: (t: string, total: string, page: number, pages: string) => `${total} ${t} · Page ${page} of ${pages}` },
    zh: { prev: '← 上一页', next: '下一页 →', jump: '跳转', summary: (t: string, total: string, page: number, pages: string) => `共 ${total} ${t} · 第 ${page} / ${pages} 页` },
} as const;

export function Pager({
    page,
    pages,
    total,
    unit = '条',
    href,
    action,
    hidden = {},
    lang = 'en',
}: {
    page: number;
    pages: number;
    total: number;
    unit?: string;
    href: (p: number) => string;
    /** 跳页表单提交到哪个地址；不传则不渲染跳页框 */
    action?: string;
    /** 跳页时要一起带上的筛选条件 */
    hidden?: Record<string, string | undefined>;
    lang?: 'en' | 'zh';
}) {
    if (total === 0) return null;
    const c = COPY[lang];

    return (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
            <span>
                {c.summary(unit, total.toLocaleString('en-US'), page, pages.toLocaleString('en-US'))}
            </span>

            <span className="flex items-center gap-2">
                {page > 1 ? (
                    <Link className={btn} href={href(page - 1)} scroll={false}>
                        {c.prev}
                    </Link>
                ) : (
                    <span className={btnOff}>{c.prev}</span>
                )}

                {action && pages > 1 && (
                    <form action={action} className="flex items-center gap-1">
                        {Object.entries(hidden).map(
                            ([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />,
                        )}
                        <input name="page" type="number" min={1} max={pages} defaultValue={page} className={input} />
                        <button type="submit" className={btn}>
                            {c.jump}
                        </button>
                    </form>
                )}

                {page < pages ? (
                    <Link className={btn} href={href(page + 1)} scroll={false}>
                        {c.next}
                    </Link>
                ) : (
                    <span className={btnOff}>{c.next}</span>
                )}
            </span>
        </nav>
    );
}
