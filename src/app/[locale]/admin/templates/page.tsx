import { prisma } from '@/lib/prisma';
import { deleteTemplate } from '@/features/admin/actions';
import { TemplateEditor } from '@/components/admin/TemplateEditor';

export const dynamic = 'force-dynamic';

export default async function AdminTemplatesPage() {
    const tpls = await prisma.designTemplate.findMany({ orderBy: [{ productType: 'asc' }, { sort: 'asc' }] });

    return (
        <div className="space-y-8">
            <section>
                <h2 className="mb-3 text-base font-bold text-neutral-900">新建模板</h2>
                <TemplateEditor />
            </section>
            <section>
                <h2 className="mb-3 text-base font-bold text-neutral-900">现有模板 · {tpls.length}</h2>
                {tpls.length === 0 ? (
                    <p className="text-neutral-500">还没有模板，用上方表单创建，或运行 <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">node prisma/seed-templates.mjs</code>。</p>
                ) : (
                    <div className="grid gap-5 xl:grid-cols-2">
                        {tpls.map((t) => (
                            <div key={t.id} className="space-y-2">
                                <TemplateEditor tpl={t} />
                                <form action={deleteTemplate}>
                                    <input type="hidden" name="id" value={t.id} />
                                    <button className="text-xs text-[#ff4d4f] hover:underline">删除「{t.name}」</button>
                                </form>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
