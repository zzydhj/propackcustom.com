'use client';

import { useActionState } from 'react';
import { saveTemplate } from '@/features/admin/actions';

const input = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

type Tpl = {
    id: string; slug: string; name: string; productType: string; category: string | null;
    widthMm: number | null; heightMm: number | null; bleedMm: number; safeAreaMm: number;
    dielineSvg: string | null; sceneTemplate: unknown; active: boolean; sort: number;
};

// 单个模板的编辑/新建表单。删除按钮由外层管理页提供（HTML 不允许嵌套 form）。
export function TemplateEditor({ tpl }: { tpl?: Tpl }) {
    const [state, action, pending] = useActionState(saveTemplate, null);
    const objects = (tpl?.sceneTemplate as { objects?: unknown[] } | undefined)?.objects ?? [];

    return (
        <form action={action} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
            {tpl && <input type="hidden" name="id" value={tpl.id} />}
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">Slug</span>
                    <input name="slug" defaultValue={tpl?.slug} className={input} required /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">名称</span>
                    <input name="name" defaultValue={tpl?.name} className={input} required /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">产品类型（label/card/tag/box…）</span>
                    <input name="productType" defaultValue={tpl?.productType} className={input} required /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">分类（可选）</span>
                    <input name="category" defaultValue={tpl?.category ?? ''} className={input} /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">宽 (mm)</span>
                    <input name="widthMm" type="number" step="0.1" defaultValue={tpl?.widthMm ?? 100} className={input} required /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">高 (mm)</span>
                    <input name="heightMm" type="number" step="0.1" defaultValue={tpl?.heightMm ?? 100} className={input} required /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">出血 (mm)</span>
                    <input name="bleedMm" type="number" step="0.1" defaultValue={tpl?.bleedMm ?? 3} className={input} /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">安全区 (mm)</span>
                    <input name="safeAreaMm" type="number" step="0.1" defaultValue={tpl?.safeAreaMm ?? 3} className={input} /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">排序</span>
                    <input name="sort" type="number" defaultValue={tpl?.sort ?? 0} className={input} /></label>
                <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="active" defaultChecked={tpl?.active ?? true} /> 启用</label>
            </div>
            <label className="grid gap-1 text-sm"><span className="text-neutral-600">刀版 SVG（dieline，可选）</span>
                <textarea name="dielineSvg" rows={2} defaultValue={tpl?.dielineSvg ?? ''} className={`${input} font-mono text-xs`} /></label>
            <label className="grid gap-1 text-sm"><span className="text-neutral-600">预置内容 objects（Fabric JSON 数组，可选）</span>
                <textarea name="sceneJson" rows={2} defaultValue={objects.length ? JSON.stringify(objects) : ''} className={`${input} font-mono text-xs`} /></label>
            <div className="flex items-center gap-3">
                <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60" disabled={pending}>
                    {pending ? '保存中…' : tpl ? '更新模板' : '新建模板'}
                </button>
                {state?.ok && <span className="text-xs text-green-600">已保存 ✓</span>}
                {state && !state.ok && <span className="text-xs text-[#ff4d4f]">保存失败：{state.error}</span>}
            </div>
        </form>
    );
}
