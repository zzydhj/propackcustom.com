'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { saveProductConfig } from '@/features/admin/actions';

type BOption = {
    id: string; name: string; sort: number; parentOptionId?: string | null;
    defaultState: 'enabled' | 'disabled' | 'hidden'; isDefaultChecked: boolean;
    priceAdjustType: 'FIXED' | 'PERCENT'; priceAdjust: number;
};
type BGroup = {
    id: string; name: string; selectType: string; displayType: string; unit?: string | null;
    isRequired: boolean; sort: number; min?: number | null; max?: number | null;
    parentOptionId?: string | null; options: BOption[];
};
type BRule = {
    id: string; sourceOptionId: string; targetGroupId: string;
    allowedOptionIds: string[]; disabledOptionIds: string[]; hiddenOptionIds: string[];
    forcedCheckedOptionId?: string | null; priority: number;
};
type BPriceRule = { id: string; name: string; optionId: string | null; chargeType: 'ONE_TIME' | 'PER_UNIT' | 'PER_AREA' | 'PERCENT'; priceValue: number; sort: number };
type Tier = { min: number; discountPct: number };
type Initial = {
    pricingMode: 'FIXED' | 'AREA'; basePrice: number; pricePerSqm: number | null;
    quantityTiers: Tier[]; groups: BGroup[]; rules: BRule[]; priceRules: BPriceRule[];
};

const uid = () => Math.random().toString(36).slice(2, 9);
const input = 'rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900';
const btn = 'rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60';
const ghost = 'rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50';
const del = 'text-xs font-semibold text-[#ff4d4f] hover:underline';

const SELECT_TYPES = [
    { value: 'single', label: '单选' },
    { value: 'multi', label: '多选' },
    { value: 'number', label: '数字输入' },
    { value: 'text', label: '文本输入' },
    { value: 'dimension', label: '尺寸（长×宽）' },
    { value: 'file', label: '文件上传' },
];
const DISPLAY_TYPES = [
    { value: 'button', label: '平铺按钮' },
    { value: 'radio', label: '单选圆点' },
    { value: 'checkbox', label: '复选框' },
    { value: 'dropdown', label: '下拉框' },
];
const hasOpts = (g: BGroup) => g.selectType === 'single' || g.selectType === 'multi';
const MARKS = [
    { key: 'none', label: '无' },
    { key: 'allowed', label: '允许' },
    { key: 'disabled', label: '禁用' },
    { key: 'hidden', label: '隐藏' },
] as const;
type Mark = (typeof MARKS)[number]['key'];

export function ProductConfiguratorBuilder({ productId, initial }: { productId: string; initial: Initial }) {
    const [pricingMode, setPricingMode] = useState(initial.pricingMode);
    const [basePrice, setBasePrice] = useState(initial.basePrice);
    const [pricePerSqm, setPricePerSqm] = useState<number | ''>(initial.pricePerSqm ?? '');
    const [tiers, setTiers] = useState<Tier[]>(initial.quantityTiers ?? []);
    const [groups, setGroups] = useState<BGroup[]>(initial.groups ?? []);
    const [rules, setRules] = useState<BRule[]>(initial.rules ?? []);
    const [priceRules, setPriceRules] = useState<BPriceRule[]>(initial.priceRules ?? []);
    const [sourceId, setSourceId] = useState<string>('');
    const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(saveProductConfig, null);

    const allOptions = groups.flatMap((g) => g.options.map((o) => ({ id: o.id, name: o.name || '(空)', groupName: g.name || '(未命名组)', groupId: g.id })));
    const optLabel = (id: string) => { const o = allOptions.find((x) => x.id === id); return o ? `${o.groupName} · ${o.name}` : id; };

    // ── 组 / 选项 编辑 ──
    const patchGroup = (i: number, patch: Partial<BGroup>) => setGroups((p) => p.map((g, gi) => (gi === i ? { ...g, ...patch } : g)));
    const addGroup = () => setGroups((p) => [...p, { id: uid(), name: '', selectType: 'single', displayType: 'button', isRequired: false, sort: p.length, options: [{ id: uid(), name: '', sort: 0, defaultState: 'enabled', isDefaultChecked: false, priceAdjustType: 'FIXED', priceAdjust: 0 }] }]);
    const removeGroup = (i: number) => {
        const g = groups[i];
        const optIds = new Set(g.options.map((o) => o.id));
        setGroups((p) => p.filter((_, gi) => gi !== i));
        // 清理引用该组/其选项的规则
        setRules((p) => p
            .filter((r) => r.targetGroupId !== g.id && !optIds.has(r.sourceOptionId))
            .map((r) => ({
                ...r,
                allowedOptionIds: r.allowedOptionIds.filter((x) => !optIds.has(x)),
                disabledOptionIds: r.disabledOptionIds.filter((x) => !optIds.has(x)),
                hiddenOptionIds: r.hiddenOptionIds.filter((x) => !optIds.has(x)),
                forcedCheckedOptionId: r.forcedCheckedOptionId && optIds.has(r.forcedCheckedOptionId) ? null : r.forcedCheckedOptionId,
            })));
        setPriceRules((p) => p.filter((pr) => !pr.optionId || !optIds.has(pr.optionId)));
    };
    const moveGroup = (i: number, dir: -1 | 1) => setGroups((p) => { const j = i + dir; if (j < 0 || j >= p.length) return p; const n = [...p];[n[i], n[j]] = [n[j], n[i]]; return n; });
    const patchOption = (i: number, j: number, patch: Partial<BOption>) => setGroups((p) => p.map((g, gi) => (gi === i ? { ...g, options: g.options.map((o, oj) => (oj === j ? { ...o, ...patch } : o)) } : g)));
    const addOption = (i: number) => patchGroup(i, { options: [...groups[i].options, { id: uid(), name: '', sort: groups[i].options.length, defaultState: 'enabled', isDefaultChecked: false, priceAdjustType: 'FIXED', priceAdjust: 0 }] });
    const removeOption = (i: number, j: number) => {
        const oid = groups[i].options[j].id;
        patchGroup(i, { options: groups[i].options.filter((_, oj) => oj !== j) });
        setRules((p) => p
            .filter((r) => r.sourceOptionId !== oid)
            .map((r) => ({
                ...r,
                allowedOptionIds: r.allowedOptionIds.filter((x) => x !== oid),
                disabledOptionIds: r.disabledOptionIds.filter((x) => x !== oid),
                hiddenOptionIds: r.hiddenOptionIds.filter((x) => x !== oid),
                forcedCheckedOptionId: r.forcedCheckedOptionId === oid ? null : r.forcedCheckedOptionId,
            })));
        setPriceRules((p) => p.filter((pr) => pr.optionId !== oid));
    };
    const moveOption = (i: number, j: number, dir: -1 | 1) => { const opts = groups[i].options; const k = j + dir; if (k < 0 || k >= opts.length) return; const n = [...opts];[n[j], n[k]] = [n[k], n[j]]; patchGroup(i, { options: n }); };

    // ── 规则（矩阵）编辑 ──
    const getRule = (src: string, tgt: string) => rules.find((r) => r.sourceOptionId === src && r.targetGroupId === tgt);
    const upsertRule = (src: string, tgt: string, fn: (r: BRule) => BRule) =>
        setRules((p) => {
            const idx = p.findIndex((r) => r.sourceOptionId === src && r.targetGroupId === tgt);
            if (idx >= 0) { const n = [...p]; n[idx] = fn(n[idx]); return n; }
            return [...p, fn({ id: uid(), sourceOptionId: src, targetGroupId: tgt, allowedOptionIds: [], disabledOptionIds: [], hiddenOptionIds: [], forcedCheckedOptionId: null, priority: 0 })];
        });
    const markOf = (r: BRule | undefined, oid: string): Mark => {
        if (!r) return 'none';
        if (r.hiddenOptionIds.includes(oid)) return 'hidden';
        if (r.disabledOptionIds.includes(oid)) return 'disabled';
        if (r.allowedOptionIds.includes(oid)) return 'allowed';
        return 'none';
    };
    const setMark = (src: string, tgt: string, oid: string, mark: Mark) =>
        upsertRule(src, tgt, (r) => {
            const allowed = r.allowedOptionIds.filter((x) => x !== oid);
            const disabled = r.disabledOptionIds.filter((x) => x !== oid);
            const hidden = r.hiddenOptionIds.filter((x) => x !== oid);
            if (mark === 'allowed') allowed.push(oid);
            else if (mark === 'disabled') disabled.push(oid);
            else if (mark === 'hidden') hidden.push(oid);
            return { ...r, allowedOptionIds: allowed, disabledOptionIds: disabled, hiddenOptionIds: hidden };
        });

    const sourceGroup = groups.find((g) => g.options.some((o) => o.id === sourceId));
    const targetGroups = groups.filter((g) => g.id !== sourceGroup?.id && hasOpts(g));

    // ── 计价规则（附加费/一次性费用）编辑 ──
    const addPriceRule = () => setPriceRules((p) => [...p, { id: uid(), name: '', optionId: null, chargeType: 'ONE_TIME', priceValue: 0, sort: p.length }]);
    const patchPriceRule = (i: number, patch: Partial<BPriceRule>) => setPriceRules((p) => p.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));
    const removePriceRule = (i: number) => setPriceRules((p) => p.filter((_, xi) => xi !== i));

    const configJson = JSON.stringify({
        groups: groups.map((g, gi) => ({ ...g, sort: gi, options: g.options.map((o, oi) => ({ ...o, sort: oi })) })),
        rules,
        priceRules: priceRules.map((pr, i) => ({ ...pr, sort: i })),
    });

    return (
        <form action={formAction} className="space-y-4">
            <input type="hidden" name="id" value={productId} />
            <input type="hidden" name="pricingMode" value={pricingMode} />
            <input type="hidden" name="basePrice" value={basePrice} />
            <input type="hidden" name="pricePerSqm" value={pricePerSqm === '' ? '' : pricePerSqm} />
            <input type="hidden" name="quantityTiers" value={JSON.stringify(tiers)} />
            <input type="hidden" name="config" value={configJson} />

            {/* 定价 */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <p className="mb-2 text-sm font-semibold text-neutral-900">定价</p>
                <div className="flex flex-wrap items-center gap-3">
                    <select className={input} value={pricingMode} onChange={(e) => setPricingMode(e.target.value as 'FIXED' | 'AREA')}>
                        <option value="FIXED">固定价（基础价+选项）</option>
                        <option value="AREA">按面积（长×宽 × 每m²单价）</option>
                    </select>
                    <label className="text-xs text-neutral-500">基础价
                        <input type="number" step="0.01" min="0" className={`${input} ml-1 w-24`} value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value) || 0)} />
                    </label>
                    {pricingMode === 'AREA' && (
                        <label className="text-xs text-neutral-500">每平方米价
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
                            <label>起订量<input type="number" min="1" className={`${input} ml-1 w-24`} value={t.min} onChange={(e) => setTiers((p) => p.map((x, xi) => (xi === i ? { ...x, min: Number(e.target.value) || 0 } : x)))} /></label>
                            <label>折扣%<input type="number" min="0" max="100" className={`${input} ml-1 w-20`} value={t.discountPct} onChange={(e) => setTiers((p) => p.map((x, xi) => (xi === i ? { ...x, discountPct: Number(e.target.value) || 0 } : x)))} /></label>
                            <button type="button" className={del} onClick={() => setTiers((p) => p.filter((_, xi) => xi !== i))}>移除</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* 属性组 + 选项 */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-neutral-900">属性组</p>
                    <button type="button" className={ghost} onClick={addGroup}>+ 添加属性组</button>
                </div>
                {groups.length === 0 && <p className="text-xs text-neutral-500">暂无属性组，客户只需选择数量。</p>}
                <div className="space-y-3">
                    {groups.map((g, i) => (
                        <div key={g.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <input placeholder="组名（如 材料）" className={`${input} w-40`} value={g.name} onChange={(e) => patchGroup(i, { name: e.target.value })} />
                                <select className={input} value={g.selectType} onChange={(e) => patchGroup(i, { selectType: e.target.value })}>
                                    {SELECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                {hasOpts(g) && (
                                    <select className={input} value={g.displayType} onChange={(e) => patchGroup(i, { displayType: e.target.value })}>
                                        {DISPLAY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                )}
                                <label className="flex items-center gap-1 text-xs text-neutral-600"><input type="checkbox" className="h-4 w-4" checked={g.isRequired} onChange={(e) => patchGroup(i, { isRequired: e.target.checked })} /> 必填</label>
                                {(g.selectType === 'dimension' || g.selectType === 'number') && (
                                    <>
                                        <input placeholder="单位" className={`${input} w-16`} value={g.unit ?? ''} onChange={(e) => patchGroup(i, { unit: e.target.value })} />
                                        <input placeholder="最小" type="number" className={`${input} w-20`} value={g.min ?? ''} onChange={(e) => patchGroup(i, { min: e.target.value === '' ? null : Number(e.target.value) })} />
                                        <input placeholder="最大" type="number" className={`${input} w-20`} value={g.max ?? ''} onChange={(e) => patchGroup(i, { max: e.target.value === '' ? null : Number(e.target.value) })} />
                                    </>
                                )}
                                <span className="ml-auto flex items-center gap-2">
                                    <button type="button" className={ghost} onClick={() => moveGroup(i, -1)}>↑</button>
                                    <button type="button" className={ghost} onClick={() => moveGroup(i, 1)}>↓</button>
                                    <button type="button" className={del} onClick={() => removeGroup(i)}>移除组</button>
                                </span>
                            </div>

                            {/* 结构层：父选项（仅当该选项被选中时显示本组） */}
                            <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                仅当此选项被选中时显示本组（结构父子，如 模切→刀版）：
                                <select className={input} value={g.parentOptionId ?? ''} onChange={(e) => patchGroup(i, { parentOptionId: e.target.value || null })}>
                                    <option value="">（无 · 始终显示）</option>
                                    {allOptions.filter((o) => o.groupId !== g.id).map((o) => <option key={o.id} value={o.id}>{o.groupName} · {o.name}</option>)}
                                </select>
                            </label>

                            {hasOpts(g) && (
                                <div className="mt-2 space-y-2 pl-2">
                                    {g.options.map((o, j) => (
                                        <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-100 bg-neutral-50/60 p-2">
                                            <input placeholder="选项名" className={`${input} w-40`} value={o.name} onChange={(e) => patchOption(i, j, { name: e.target.value })} />
                                            <input type="number" step="0.01" title="加价" className={`${input} w-24`} value={o.priceAdjust} onChange={(e) => patchOption(i, j, { priceAdjust: Number(e.target.value) || 0 })} />
                                            <select className={input} value={o.priceAdjustType} onChange={(e) => patchOption(i, j, { priceAdjustType: e.target.value as 'FIXED' | 'PERCENT' })}>
                                                <option value="FIXED">+ 固定</option>
                                                <option value="PERCENT">+ 百分比</option>
                                            </select>
                                            <select className={input} value={o.defaultState} onChange={(e) => patchOption(i, j, { defaultState: e.target.value as BOption['defaultState'] })}>
                                                <option value="enabled">默认可选</option>
                                                <option value="disabled">默认禁用</option>
                                                <option value="hidden">默认隐藏</option>
                                            </select>
                                            {g.options.length > 1 && (
                                                <select className={input} title="父选项：仅当父选项被选中时才显示本项（选项级父子树）" value={o.parentOptionId ?? ''} onChange={(e) => patchOption(i, j, { parentOptionId: e.target.value || null })}>
                                                    <option value="">（无父级）</option>
                                                    {g.options.filter((x) => x.id !== o.id).map((x) => <option key={x.id} value={x.id}>↳ 父：{x.name || '(空)'}</option>)}
                                                </select>
                                            )}
                                            <label className="flex items-center gap-1 text-xs text-neutral-600"><input type="checkbox" className="h-4 w-4" checked={o.isDefaultChecked} onChange={(e) => patchOption(i, j, { isDefaultChecked: e.target.checked })} /> 默认勾选</label>
                                            <span className="ml-auto flex items-center gap-2">
                                                <button type="button" className={ghost} onClick={() => moveOption(i, j, -1)}>↑</button>
                                                <button type="button" className={ghost} onClick={() => moveOption(i, j, 1)}>↓</button>
                                                <button type="button" className={del} onClick={() => removeOption(i, j)}>×</button>
                                            </span>
                                        </div>
                                    ))}
                                    <button type="button" className={ghost} onClick={() => addOption(i)}>+ 添加选项</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* 联动规则（勾选矩阵） */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <p className="mb-2 text-sm font-semibold text-neutral-900">联动规则（源选项 → 目标组）</p>
                <label className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                    当被选中的源选项：
                    <select className={`${input} min-w-[220px]`} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                        <option value="">（选择源选项）</option>
                        {allOptions.map((o) => <option key={o.id} value={o.id}>{o.groupName} · {o.name}</option>)}
                    </select>
                </label>

                {sourceId && targetGroups.length === 0 && <p className="mt-2 text-xs text-neutral-400">没有可作为目标的选项组。</p>}

                <div className="mt-3 space-y-3">
                    {sourceId && targetGroups.map((tg) => {
                        const r = getRule(sourceId, tg.id);
                        return (
                            <div key={tg.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                                <div className="mb-2 flex flex-wrap items-center gap-3">
                                    <span className="text-sm font-semibold text-neutral-800">目标组：{tg.name || '(未命名)'}</span>
                                    <label className="text-xs text-neutral-500">优先级(小者先)
                                        <input type="number" className={`${input} ml-1 w-16`} value={r?.priority ?? 0} onChange={(e) => upsertRule(sourceId, tg.id, (x) => ({ ...x, priority: Number(e.target.value) || 0 }))} />
                                    </label>
                                    <label className="text-xs text-neutral-500">强制勾选
                                        <select className={`${input} ml-1`} value={r?.forcedCheckedOptionId ?? ''} onChange={(e) => upsertRule(sourceId, tg.id, (x) => ({ ...x, forcedCheckedOptionId: e.target.value || null }))}>
                                            <option value="">（无）</option>
                                            {tg.options.map((o) => <option key={o.id} value={o.id}>{o.name || '(空)'}</option>)}
                                        </select>
                                    </label>
                                </div>
                                <div className="space-y-1">
                                    {tg.options.map((o) => {
                                        const m = markOf(r, o.id);
                                        return (
                                            <div key={o.id} className="flex flex-wrap items-center gap-2 text-xs">
                                                <span className="w-40 truncate text-neutral-700">{o.name || '(空)'}</span>
                                                <span className="flex gap-1">
                                                    {MARKS.map((mk) => (
                                                        <button type="button" key={mk.key} onClick={() => setMark(sourceId, tg.id, o.id, mk.key)}
                                                            className={`rounded border px-2 py-0.5 ${m === mk.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600 hover:border-neutral-900'}`}>
                                                            {mk.label}
                                                        </button>
                                                    ))}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 全部规则一览 */}
                {rules.length > 0 && (
                    <div className="mt-4 border-t border-neutral-200 pt-3">
                        <p className="mb-1 text-xs font-semibold text-neutral-600">已配置 {rules.length} 条规则</p>
                        <ul className="space-y-1 text-xs text-neutral-500">
                            {rules.map((r) => {
                                const tg = groups.find((g) => g.id === r.targetGroupId);
                                return (
                                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                                        <span className="text-neutral-700">{optLabel(r.sourceOptionId)}</span> → <span>{tg?.name || '(组已删)'}</span>
                                        <span className="text-neutral-400">允许{r.allowedOptionIds.length}/禁用{r.disabledOptionIds.length}/隐藏{r.hiddenOptionIds.length}{r.forcedCheckedOptionId ? ` · 强制「${optLabel(r.forcedCheckedOptionId)}」` : ''} · p{r.priority}</span>
                                        <button type="button" className={del} onClick={() => setRules((p) => p.filter((x) => x.id !== r.id))}>删除</button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>

            {/* 计价规则（附加费 / 一次性费用） */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-neutral-900">计价规则（附加费 / 一次性费用）</p>
                    <button type="button" className={ghost} onClick={addPriceRule}>+ 添加计价规则</button>
                </div>
                <p className="mb-2 text-xs text-neutral-400">在数量折扣之后叠加。选项自带的固定/百分比加价请在上方「属性组」里设置。</p>
                {priceRules.length === 0 && <p className="text-xs text-neutral-500">暂无附加费。</p>}
                <div className="space-y-2">
                    {priceRules.map((pr, i) => (
                        <div key={pr.id} className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                            <input placeholder="费用名称（如 刀版费）" className={`${input} w-40`} value={pr.name} onChange={(e) => patchPriceRule(i, { name: e.target.value })} />
                            <select className={input} value={pr.optionId ?? ''} onChange={(e) => patchPriceRule(i, { optionId: e.target.value || null })}>
                                <option value="">始终收取</option>
                                {allOptions.map((o) => <option key={o.id} value={o.id}>选中「{o.groupName} · {o.name}」时</option>)}
                            </select>
                            <select className={input} value={pr.chargeType} onChange={(e) => patchPriceRule(i, { chargeType: e.target.value as BPriceRule['chargeType'] })}>
                                <option value="ONE_TIME">一次性</option>
                                <option value="PER_UNIT">× 数量</option>
                                <option value="PER_AREA">× 面积 × 数量</option>
                                <option value="PERCENT">% 货值</option>
                            </select>
                            <input type="number" step="0.01" min="0" placeholder="金额" className={`${input} w-24`} value={pr.priceValue} onChange={(e) => patchPriceRule(i, { priceValue: Number(e.target.value) || 0 })} />
                            <button type="button" className={del} onClick={() => removePriceRule(i)}>移除</button>
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
