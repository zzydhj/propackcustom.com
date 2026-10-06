'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { saveProductConfig } from '@/features/admin/actions';
import type { ProductAttribute, QuantityTier, AttrType, AdderType, AttrOption } from '@/lib/pricing';

type Initial = {
    pricingMode: 'FIXED' | 'AREA';
    basePrice: number;
    pricePerSqm: number | null;
    attributes: ProductAttribute[];
    quantityTiers: QuantityTier[];
};

const uid = () => Math.random().toString(36).slice(2, 9);
const input = 'rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900';
const btn = 'rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60';
const ghost = 'rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50';
const del = 'text-xs font-semibold text-[#ff4d4f] hover:underline';

const ATTR_TYPES: { value: AttrType; label: string }[] = [
    { value: 'SELECT', label: '单选' },
    { value: 'MULTI', label: '多选' },
    { value: 'DIMENSION', label: '尺寸（长×宽）' },
    { value: 'NUMBER', label: '数字' },
    { value: 'TEXT', label: '文本' },
];

export function ProductConfiguratorBuilder({ productId, initial }: { productId: string; initial: Initial }) {
    const [pricingMode, setPricingMode] = useState(initial.pricingMode);
    const [basePrice, setBasePrice] = useState(initial.basePrice);
    const [pricePerSqm, setPricePerSqm] = useState<number | ''>(initial.pricePerSqm ?? '');
    const [attrs, setAttrs] = useState<ProductAttribute[]>(initial.attributes);
    const [tiers, setTiers] = useState<QuantityTier[]>(initial.quantityTiers);
    const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(saveProductConfig, null);

    const patchAttr = (i: number, patch: Partial<ProductAttribute>) =>
        setAttrs((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

    const patchOption = (i: number, j: number, patch: Partial<AttrOption>) =>
        setAttrs((prev) => prev.map((a, idx) => (idx === i ? { ...a, options: (a.options ?? []).map((o, oj) => (oj === j ? { ...o, ...patch } : o)) } : a)));

    return (
        <form action={formAction} className="space-y-4">
            <input type="hidden" name="id" value={productId} />
            <input type="hidden" name="pricingMode" value={pricingMode} />
            <input type="hidden" name="basePrice" value={basePrice} />
            <input type="hidden" name="pricePerSqm" value={pricePerSqm === '' ? '' : pricePerSqm} />
            <input type="hidden" name="attributes" value={JSON.stringify(attrs)} />
            <input type="hidden" name="quantityTiers" value={JSON.stringify(tiers)} />

            {/* 定价模式 */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <p className="mb-2 text-sm font-semibold text-neutral-900">定价</p>
                <div className="flex flex-wrap items-center gap-3">
                    <select className={input} value={pricingMode} onChange={(e) => setPricingMode(e.target.value as 'FIXED' | 'AREA')}>
                        <option value="FIXED">固定价（基础价+选项）</option>
                        <option value="AREA">按面积（长×宽 × 每m²单价）</option>
                    </select>
                    <label className="text-xs text-neutral-500">
                        基础价
                        <input type="number" step="0.01" min="0" className={`${input} ml-1 w-24`} value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value) || 0)} />
                    </label>
                    {pricingMode === 'AREA' && (
                        <label className="text-xs text-neutral-500">
                            每平方米价
                            <input type="number" step="0.01" min="0" className={`${input} ml-1 w-24`} value={pricePerSqm} onChange={(e) => setPricePerSqm(e.target.value === '' ? '' : Number(e.target.value))} />
                        </label>
                    )}
                </div>
            </div>

            {/* 数量阶梯 */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-neutral-900">数量阶梯</p>
                    <button type="button" className={ghost} onClick={() => setTiers((t) => [...t, { min: 100, discountPct: 0 }])}>+ 添加阶梯</button>
                </div>
                {tiers.length === 0 && <p className="text-xs text-neutral-500">无阶梯，按数量线性计价。</p>}
                <div className="space-y-2">
                    {tiers.map((t, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                            <label>起订量
                                <input type="number" min="1" className={`${input} ml-1 w-24`} value={t.min} onChange={(e) => setTiers((prev) => prev.map((x, xi) => (xi === i ? { ...x, min: Number(e.target.value) || 0 } : x)))} />
                            </label>
                            <label>折扣%
                                <input type="number" min="0" max="100" step="1" className={`${input} ml-1 w-20`} value={t.discountPct} onChange={(e) => setTiers((prev) => prev.map((x, xi) => (xi === i ? { ...x, discountPct: Number(e.target.value) || 0 } : x)))} />
                            </label>
                            <button type="button" className={del} onClick={() => setTiers((prev) => prev.filter((_, xi) => xi !== i))}>移除</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* 字段构建器 */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-neutral-900">字段（属性）</p>
                    <button type="button" className={ghost} onClick={() => setAttrs((a) => [...a, { id: uid(), label: '', type: 'SELECT', required: false, options: [{ id: uid(), label: '', adder: 0, adderType: 'FIXED' }] }])}>
                        + 添加字段
                    </button>
                </div>
                {attrs.length === 0 && <p className="text-xs text-neutral-500">暂无字段，客户只需选择数量。</p>}
                <div className="space-y-3">
                    {attrs.map((a, i) => (
                        <div key={a.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <input placeholder="字段名称" className={`${input} flex-1`} value={a.label} onChange={(e) => patchAttr(i, { label: e.target.value })} />
                                <select className={input} value={a.type} onChange={(e) => patchAttr(i, { type: e.target.value as AttrType })}>
                                    {ATTR_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                                </select>
                                <label className="flex items-center gap-1 text-xs text-neutral-600">
                                    <input type="checkbox" className="h-4 w-4" checked={a.required} onChange={(e) => patchAttr(i, { required: e.target.checked })} /> 必填
                                </label>
                                {(a.type === 'DIMENSION' || a.type === 'NUMBER') && (
                                    <>
                                        <input placeholder="单位" className={`${input} w-16`} value={a.unit ?? ''} onChange={(e) => patchAttr(i, { unit: e.target.value })} />
                                        <input placeholder="最小" type="number" className={`${input} w-20`} value={a.min ?? ''} onChange={(e) => patchAttr(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                                        <input placeholder="最大" type="number" className={`${input} w-20`} value={a.max ?? ''} onChange={(e) => patchAttr(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} />
                                    </>
                                )}
                                <button type="button" className={del} onClick={() => setAttrs((prev) => prev.filter((_, xi) => xi !== i))}>移除</button>
                            </div>

                            {(a.type === 'SELECT' || a.type === 'MULTI') && (
                                <div className="mt-2 space-y-1.5 pl-2">
                                    {(a.options ?? []).map((o, j) => (
                                        <div key={o.id} className="flex flex-wrap items-center gap-2">
                                            <input placeholder="选项" className={`${input} flex-1`} value={o.label} onChange={(e) => patchOption(i, j, { label: e.target.value })} />
                                            <input type="number" step="0.01" className={`${input} w-24`} value={o.adder} onChange={(e) => patchOption(i, j, { adder: Number(e.target.value) || 0 })} />
                                            <select className={input} value={o.adderType} onChange={(e) => patchOption(i, j, { adderType: e.target.value as AdderType })}>
                                                <option value="FIXED">+ 固定</option>
                                                <option value="PERCENT">+ 百分比</option>
                                            </select>
                                            <button type="button" className={del} onClick={() => patchAttr(i, { options: (a.options ?? []).filter((_, xj) => xj !== j) })}>×</button>
                                        </div>
                                    ))}
                                    <button type="button" className={ghost} onClick={() => patchAttr(i, { options: [...(a.options ?? []), { id: uid(), label: '', adder: 0, adderType: 'FIXED' }] })}>
                                        + 添加选项
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button type="submit" disabled={pending} className={btn}>{pending ? '保存中…' : '保存配置'}</button>
                {state?.ok && <span className="text-xs text-green-600">✓ 已保存</span>}
                {state?.error && <span className="text-xs text-[#ff4d4f]">数据无效</span>}
            </div>
        </form>
    );
}
