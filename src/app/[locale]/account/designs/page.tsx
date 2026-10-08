import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 我的设计：列出当前用户（userId 或邮箱认领）的在线设计作品，点击回到编辑器继续修改
export default async function AccountDesignsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const session = await auth();
    const userId = session?.user?.id;
    const email = session?.user?.email;

    const or: { userId?: string; email?: string }[] = [];
    if (userId) or.push({ userId });
    if (email) or.push({ email });
    const designs = or.length
        ? await prisma.userDesign.findMany({ where: { OR: or }, orderBy: { updatedAt: 'desc' }, take: 100 })
        : [];

    // 模板尺寸信息（软引用，单独批查）
    const tplIds = [...new Set(designs.map((d) => d.templateId).filter((x): x is string => !!x))];
    const tpls = tplIds.length ? await prisma.designTemplate.findMany({ where: { id: { in: tplIds } } }) : [];
    const tplMap = new Map(tpls.map((tp) => [tp.id, tp]));

    return (
        <section>
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-xl font-bold text-neutral-900">My designs</h1>
                <Link href="/design" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700">
                    New design
                </Link>
            </div>

            {designs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
                    <p className="text-neutral-600">You haven&rsquo;t created any designs yet.</p>
                    <Link href="/design" className="mt-3 inline-block text-sm font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">
                        Open Design Studio →
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {designs.map((d) => {
                        const tp = d.templateId ? tplMap.get(d.templateId) : undefined;
                        return (
                            <Link
                                key={d.id}
                                href={`/design/${d.productType ?? 'label'}?design=${d.id}` as never}
                                className="group rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-900"
                            >
                                <p className="truncate font-semibold text-neutral-900 group-hover:underline">{d.name}</p>
                                <p className="mt-1 text-xs text-neutral-500">
                                    {d.productType ?? 'label'}
                                    {tp ? ` · ${tp.widthMm ?? '—'}×${tp.heightMm ?? '—'}mm` : ''}
                                </p>
                                <div className="mt-3 flex items-center gap-2 text-xs">
                                    <span className={`rounded-full px-2 py-0.5 font-medium ${d.status === 'DRAFT' ? 'bg-neutral-100 text-neutral-600' : 'bg-green-50 text-green-700'}`}>
                                        {d.status.toLowerCase()}
                                    </span>
                                    <span className="text-neutral-400">Updated {d.updatedAt.toLocaleDateString('en-US')}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
