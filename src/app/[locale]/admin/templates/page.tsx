import { prisma } from '@/lib/prisma';
import { Link } from '@/navigation';
import {
    ADMIN_PAGE_SIZE,
    TEMPLATE_LIST_SELECT,
    listTemplates,
    templateTypeFacets,
    type TemplateListItem,
} from '@/lib/template-query';
import { deleteTemplate, toggleTemplate } from '@/features/admin/actions';
import { TemplateEditor } from '@/components/admin/TemplateEditor';
import { Pager } from '@/components/ui/Pager';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

const input = 'h-9 rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-900';
const cellBtn =
    'rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:border-neutral-900';

/** 在当前筛选条件上覆盖若干参数拼查询串（分页/排序/编辑态都靠 URL，不用客户端状态） */
function qs(base: Record<string, string | undefined>, over: Record<string, string | undefined>) {
    const merged = { ...base, ...over };
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : '';
}

export default async function AdminTemplatesPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const raw = await searchParams;
    const sp: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(raw)) sp[k] = Array.isArray(v) ? v[0] : v;

    const page = Math.max(1, Number(sp.page) || 1);
    const [list, facets] = await Promise.all([
        listTemplates<TemplateListItem>({ q: sp.q, productType: sp.type, page, take: ADMIN_PAGE_SIZE }, TEMPLATE_LIST_SELECT),
        templateTypeFacets({ activeOnly: false }), // 后台下拉给全量类型，不受 q 影响（否则搜一个词就把可选类型筛没了）
    ]);
    // 编辑态用 URL 参数驱动，整页只渲染一个表单；表单要完整字段，所以单独按 id 取全量
    const editing = sp.edit ? await prisma.designTemplate.findUnique({ where: { id: sp.edit } }) : null;

    const href = (p: number) => `/admin/templates${qs(sp, { page: String(p), edit: undefined })}`;
    const hasFilter = Boolean(sp.q || sp.type);

    return (
        <div className="space-y-6">
            <section className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-base font-bold text-neutral-900">模板库 · {list.total.toLocaleString('en-US')}</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                        每页 {ADMIN_PAGE_SIZE} 条，服务端分页 + 索引查询；缩略图优先用 previewImage，没有则回退内联刀版 SVG。
                    </p>
                </div>
                {!sp.new && (
                    <Link href={`/admin/templates${qs(sp, { new: '1', edit: undefined })}`} className={`${cellBtn} inline-flex items-center bg-neutral-900 text-white hover:bg-neutral-700`}>
                        ＋ 新建模板
                    </Link>
                )}
            </section>

            <form method="GET" action="/admin/templates" className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3">
                <input name="q" defaultValue={sp.q} placeholder="搜索名称 / slug / 分类" className={`${input} min-w-[220px] flex-1`} />
                <select name="type" defaultValue={sp.type ?? ''} className={input}>
                    <option value="">全部类型</option>
                    {facets.map((f) => (
                        <option key={f.productType} value={f.productType}>
                            {f.productType} ({f.count})
                        </option>
                    ))}
                </select>
                {/* 保留当前页码：跳页/筛选时不丢上下文 */}
                <input type="hidden" name="page" value="1" />
                <button className={cellBtn} type="submit">筛选</button>
                {hasFilter && (
                    <Link href="/admin/templates" className={`${cellBtn} text-neutral-500`}>
                        清除
                    </Link>
                )}
            </form>

            {sp.new && (
                <section className="space-y-2 rounded-xl border border-neutral-900 bg-neutral-50 p-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-neutral-900">新建模板</h3>
                        <Link href={`/admin/templates${qs(sp, { new: undefined })}`} className={cellBtn}>
                            关闭
                        </Link>
                    </div>
                    <TemplateEditor />
                </section>
            )}

            {editing && (
                <section className="space-y-2 rounded-xl border border-neutral-900 bg-neutral-50 p-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-neutral-900">
                            编辑：{editing.name} <span className="font-mono text-xs text-neutral-500">/{editing.slug}</span>
                        </h3>
                        <Link href={`/admin/templates${qs(sp, { edit: undefined })}`} className={cellBtn}>
                            关闭
                        </Link>
                    </div>
                    <TemplateEditor tpl={editing} />
                </section>
            )}

            {list.capped && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    第 {page.toLocaleString('en-US')} 页已超出翻页上限（offset 扫到几万行会明显变慢）。请用搜索或类型筛选收窄范围。
                </p>
            )}

            {list.rows.length === 0 ? (
                <EmptyState label={hasFilter ? '没有匹配的模板，试试清除筛选条件' : '还没有模板，用右上角新建，或运行 node prisma/seed-templates.mjs'} />
            ) : (
                <section className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                    <table className="w-full min-w-[820px] text-left text-sm">
                        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                            <tr>
                                <th className="px-3 py-2 font-medium">缩略</th>
                                <th className="px-3 py-2 font-medium">名称 / slug</th>
                                <th className="px-3 py-2 font-medium">类型</th>
                                <th className="px-3 py-2 font-medium">尺寸 (mm)</th>
                                <th className="px-3 py-2 font-medium">状态</th>
                                <th className="px-3 py-2 font-medium">更新</th>
                                <th className="px-3 py-2 text-right font-medium">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {list.rows.map((t) => (
                                <tr key={t.id} className="hover:bg-neutral-50">
                                    <td className="px-3 py-2">
                                        {t.previewImage ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={t.previewImage} alt="" className="h-10 w-10 rounded border border-neutral-200 object-cover" />
                                        ) : t.dielineSvg ? (
                                            <span
                                                className="block h-10 w-10 overflow-hidden rounded border border-neutral-200 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                                                dangerouslySetInnerHTML={{ __html: t.dielineSvg }}
                                            />
                                        ) : (
                                            <span className="block h-10 w-10 rounded bg-neutral-100" />
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <p className="font-medium text-neutral-900">{t.name}</p>
                                        <p className="font-mono text-xs text-neutral-400">/{t.slug}</p>
                                        {t.tags.length > 0 && (
                                            <p className="mt-1 flex flex-wrap gap-1">
                                                {t.tags.map((tag) => (
                                                    <span key={tag} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-neutral-600">
                                        {t.productType}
                                        {t.category && <span className="block text-xs text-neutral-400">{t.category}</span>}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs text-neutral-600">
                                        {t.widthMm}×{t.heightMm}
                                        <span className="block text-neutral-400">出血 {t.bleedMm} / 安全 {t.safeAreaMm}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span
                                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${t.active ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-500'
                                                }`}
                                        >
                                            {t.active ? '已上架' : '已下架'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-neutral-500">{t.updatedAt.toISOString().slice(0, 10)}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Link href={`/admin/templates${qs(sp, { edit: t.id })}`} className={cellBtn} scroll={false}>
                                                编辑
                                            </Link>
                                            <form action={toggleTemplate} className="inline">
                                                <input type="hidden" name="id" value={t.id} />
                                                <input type="hidden" name="active" value={String(t.active)} />
                                                <button className={cellBtn} type="submit">
                                                    {t.active ? '下架' : '上架'}
                                                </button>
                                            </form>
                                            <form action={deleteTemplate} className="inline">
                                                <input type="hidden" name="id" value={t.id} />
                                                <button className={`${cellBtn} text-[#ff4d4f]`} type="submit">
                                                    删除
                                                </button>
                                            </form>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            <Pager lang="zh" page={list.page} pages={list.pages} total={list.total} unit="个模板" href={href} action="/admin/templates" hidden={{ q: sp.q, type: sp.type }} />
        </div>
    );
}
