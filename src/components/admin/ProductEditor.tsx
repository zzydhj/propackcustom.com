'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { updateProduct, upsertSpec, deleteSpec } from '@/features/admin/actions';
import { ProductConfiguratorBuilder } from './ProductConfiguratorBuilder';
import type { ProductConfig } from '@/lib/config-engine';

export type SpecOption = { value: string; adder: number };
export type SpecRow = { id: string; name: string; options: SpecOption[] };
export type CategoryOption = { id: string; slug: string; name: string };
export type ProductRow = {
    id: string;
    slug: string;
    name: string;
    description: string;
    basePrice: number;
    currency: string;
    categoryId: string;
    active: boolean;
    images: string[];
};

const inputCls = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

// 单个字段（规格）的编辑表单：名称 + 选项（每行 "选项 | 加价"）
function SpecForm({ productId, spec }: { productId: string; spec: SpecRow }) {
    const t = useTranslations('Admin');
    const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(upsertSpec, null);
    const optionsText = spec.options.map((o) => `${o.value} | ${o.adder}`).join('\n');

    return (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <form action={formAction} className="space-y-2">
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="specId" value={spec.id} />
                <input name="name" defaultValue={spec.name} placeholder={t('specName')} className={inputCls} />
                <textarea name="options" defaultValue={optionsText} rows={3} placeholder={t('specOptions')} className={`${inputCls} font-mono`} />
                <div className="flex items-center gap-2">
                    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
                        {pending ? '…' : t('save')}
                    </button>
                    {state?.ok && <span className="text-xs text-green-600">✓ {t('saved')}</span>}
                    {state?.error && <span className="text-xs text-[#ff4d4f]">{t('errInvalid')}</span>}
                </div>
            </form>
            <form action={deleteSpec} className="mt-2">
                <input type="hidden" name="id" value={spec.id} />
                <button type="submit" className="text-xs font-semibold text-[#ff4d4f] hover:underline">{t('deleteSpec')}</button>
            </form>
        </div>
    );
}

// 新增字段表单
function SpecAddForm({ productId }: { productId: string }) {
    const t = useTranslations('Admin');
    const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(upsertSpec, null);
    return (
        <form action={formAction} className="space-y-2 rounded-xl border border-dashed border-neutral-300 p-3">
            <input type="hidden" name="productId" value={productId} />
            <p className="text-sm font-semibold text-neutral-900">{t('addSpec')}</p>
            <input name="name" placeholder={t('specName')} className={inputCls} />
            <textarea name="options" rows={3} placeholder={t('specOptions')} className={`${inputCls} font-mono`} />
            <div className="flex items-center gap-2">
                <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
                    {pending ? '…' : t('add')}
                </button>
                {state?.error && <span className="text-xs text-[#ff4d4f]">{t('errInvalid')}</span>}
            </div>
        </form>
    );
}

export function ProductEditor({ product, categories, specs, config }: { product: ProductRow; categories: CategoryOption[]; specs: SpecRow[]; config: ProductConfig }) {
    const t = useTranslations('Admin');
    const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(updateProduct, null);

    return (
        <details className="rounded-2xl border border-neutral-200 bg-white" open={false}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
                <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">{product.name || product.slug}</p>
                    <p className="font-mono text-xs text-neutral-500">{product.slug}</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${product.active ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'}`}>
                        {product.active ? t('active') : t('inactive')}
                    </span>
                    <span className="font-bold text-neutral-900">{product.currency} {product.basePrice.toFixed(2)}</span>
                </div>
            </summary>

            <div className="border-t border-neutral-100 p-5">
                {/* 商品基本信息 */}
                <form action={formAction} className="space-y-3">
                    <p className="text-sm font-semibold text-neutral-900">{t('productEditor')}</p>
                    <input type="hidden" name="id" value={product.id} />
                    <label className="block text-xs text-neutral-500">{t('colName')}
                        <input name="name" defaultValue={product.name} className={inputCls} />
                    </label>
                    <label className="block text-xs text-neutral-500">{t('description')}
                        <textarea name="description" defaultValue={product.description} rows={3} className={inputCls} />
                    </label>
                    <div className="flex gap-3">
                        <label className="flex-1 text-xs text-neutral-500">{t('colPrice')}
                            <input name="basePrice" type="number" step="0.01" min="0" defaultValue={product.basePrice} className={inputCls} />
                        </label>
                        <label className="w-24 text-xs text-neutral-500">币种
                            <input name="currency" defaultValue={product.currency} className={`${inputCls} uppercase`} />
                        </label>
                    </div>
                    <label className="block text-xs text-neutral-500">{t('colCategory')}
                        <select name="categoryId" defaultValue={product.categoryId} className={inputCls}>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-xs text-neutral-500">{t('images')}
                        <textarea name="images" defaultValue={product.images.join('\n')} rows={3} className={`${inputCls} font-mono`} />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-700">
                        <input type="checkbox" name="active" defaultChecked={product.active} className="h-4 w-4" />
                        {t('active')}
                    </label>
                    <div className="flex items-center gap-2">
                        <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
                            {pending ? '…' : t('saveProduct')}
                        </button>
                        {state?.ok && <span className="text-xs text-green-600">✓ {t('saved')}</span>}
                        {state?.error && <span className="text-xs text-[#ff4d4f]">{t('errInvalid')}</span>}
                    </div>
                </form>
            </div>

            {/* 配置器：定价模式 + 数量阶梯 + 字段 */}
            <div className="border-t border-neutral-100 p-5">
                <p className="mb-3 text-sm font-semibold text-neutral-900">配置器与定价</p>
                <ProductConfiguratorBuilder productId={product.id} initial={config} />
            </div>
        </details>
    );
}
