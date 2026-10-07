'use client';

import { useMemo, useState } from 'react';
import { useActionState } from 'react';
import { Link } from '@/navigation';
import { createProductOrder, type CheckoutState } from '@/features/order/actions';
import {
    computeConfigState, computeConfigPrice, initialSelections, round2,
    type ProductConfig, type ConfigState, type Selections, type Dimension, type CfgGroup, type CfgOption,
} from '@/lib/config-engine';

const input = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-neutral-900';
const chipBase = 'rounded-lg border px-3.5 py-2 text-sm transition';
const chipOn = 'border-neutral-900 bg-neutral-900 text-white';
const chipOff = 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900';
const chipDisabled = 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-300';

function Sec({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section id={id} className="scroll-mt-28 rounded-2xl border border-neutral-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-bold text-neutral-900">
                    <span className="h-4 w-1.5 rounded bg-[#ffec5a]" />
                    {title}
                </h3>
                {hint && <span className="text-xs text-neutral-400">{hint}</span>}
            </div>
            {children}
        </section>
    );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-4 border-b border-neutral-100 py-4 last:border-b-0">
            <div className="pt-0.5">
                <span className="inline-flex items-center rounded-md bg-neutral-100 px-2.5 py-1 text-sm font-semibold text-neutral-700">
                    {label}{required && <span className="ml-1 text-[#ff4d4f]">*</span>}
                </span>
            </div>
            <div className="min-w-0">
                {children}
                {hint && <p className="mt-1.5 text-xs text-neutral-400">{hint}</p>}
            </div>
        </div>
    );
}

function adderText(o: CfgOption): string {
    const v = Number(o.priceAdjust) || 0;
    if (!v) return '';
    return o.priceAdjustType === 'PERCENT' ? `+${v}%` : `+$${v.toFixed(2)}`;
}

function selectedIds(cs: ConfigState, groups: CfgGroup[]): Set<string> {
    const s = new Set<string>();
    for (const g of groups) {
        const v = cs.selections[g.id];
        if (typeof v === 'string' && v) s.add(v);
        else if (Array.isArray(v)) for (const x of v) s.add(String(x));
    }
    return s;
}

function optionName(config: ProductConfig, id: string): string {
    for (const g of config.groups) {
        const o = g.options.find((x) => x.id === id);
        if (o) return o.name;
    }
    return '';
}

// 找到「是哪个已选源选项」导致该选项不可用，用于悬停提示
function whyDisabled(config: ProductConfig, cs: ConfigState, groupId: string, optId: string): string {
    const sel = selectedIds(cs, config.groups);
    for (const r of config.rules) {
        if (r.targetGroupId !== groupId || !sel.has(r.sourceOptionId)) continue;
        const blocked = r.disabledOptionIds.includes(optId) || (r.allowedOptionIds.length > 0 && !r.allowedOptionIds.includes(optId));
        if (blocked) return `Not available with “${optionName(config, r.sourceOptionId)}”`;
    }
    return 'Not available for the current selection';
}

// 选项树布局：把同组内「父→子」选项排成深度优先顺序，并给出缩进层级
function layoutOptions(g: CfgGroup): { opt: CfgOption; depth: number }[] {
    const ids = new Set(g.options.map((o) => o.id));
    const children = new Map<string, CfgOption[]>();
    const roots: CfgOption[] = [];
    for (const o of g.options) {
        if (o.parentOptionId && ids.has(o.parentOptionId)) {
            const arr = children.get(o.parentOptionId) ?? [];
            arr.push(o);
            children.set(o.parentOptionId, arr);
        } else roots.push(o);
    }
    const out: { opt: CfgOption; depth: number }[] = [];
    const seen = new Set<string>();
    const walk = (o: CfgOption, depth: number) => {
        if (seen.has(o.id)) return;
        seen.add(o.id);
        out.push({ opt: o, depth });
        for (const c of children.get(o.id) ?? []) walk(c, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    for (const o of g.options) if (!seen.has(o.id)) { seen.add(o.id); out.push({ opt: o, depth: 0 }); }
    return out;
}

export function ProductConfigurator({
    product,
    config,
    isLoggedIn,
    loginHref,
}: {
    product: { id: string; slug: string; name: string; description: string };
    config: ProductConfig;
    isLoggedIn: boolean;
    loginHref: string;
}) {
    const [cs, setCs] = useState<ConfigState>(() => computeConfigState(config, initialSelections(config), []));
    const [quantity, setQuantity] = useState<number>(config.quantityTiers[0]?.min ?? 100);
    const [artwork, setArtwork] = useState('');
    const [state, formAction, pending] = useActionState<CheckoutState | null, FormData>(createProductOrder, null);

    // 每次改动都用「全部已选」重算到不动点（级联 forced/prune，任意顺序都自洽）
    const setSel = (gid: string, v: Selections[string]) =>
        setCs((prev) => computeConfigState(config, { ...prev.selections, [gid]: v }, prev.autoChecked));

    const price = useMemo(() => computeConfigPrice(config, cs.selections, quantity, cs), [config, cs, quantity]);

    const tierButtons = useMemo(() => {
        const mins = new Set<number>([quantity, ...config.quantityTiers.map((t) => t.min)]);
        return [...mins].filter((m) => m > 0).sort((a, b) => a - b).slice(0, 8);
    }, [config.quantityTiers, quantity]);

    if (state?.ok && state.orderNo) {
        return (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
                <p className="text-lg font-bold text-green-800">Order placed 🎉</p>
                <p className="mt-1 text-sm text-green-700">Order #{state.orderNo} is pending payment. Pay it from your balance in My Account.</p>
                <Link href="/account/orders" className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Go to my orders</Link>
            </div>
        );
    }

    const renderOptions = (g: CfgGroup) => {
        const laid = layoutOptions(g).filter((x) => !cs.optionState[x.opt.id]?.hidden);
        const hasTree = laid.some((x) => x.depth > 0);
        if (g.selectType === 'single' && g.displayType === 'dropdown') {
            return (
                <select className={`${input} max-w-xs`} value={(cs.selections[g.id] as string) ?? ''} onChange={(e) => setSel(g.id, e.target.value || undefined)}>
                    <option value="">Select…</option>
                    {laid.map(({ opt: o, depth }) => {
                        const st = cs.optionState[o.id];
                        const add = o.priceAdjust ? ` (${adderText(o)})` : '';
                        const prefix = depth > 0 ? '— '.repeat(depth) : '';
                        return <option key={o.id} value={o.id} disabled={!st?.selectable}>{prefix}{o.name}{add}{!st?.selectable ? ' — unavailable' : ''}</option>;
                    })}
                </select>
            );
        }
        const multi = g.selectType === 'multi';
        const arr = (cs.selections[g.id] as string[]) ?? [];
        return (
            <div className={hasTree ? 'flex flex-col items-start gap-1.5' : 'flex flex-wrap gap-2'}>
                {laid.map(({ opt: o, depth }) => {
                    const st = cs.optionState[o.id];
                    const on = multi ? arr.includes(o.id) : cs.selections[g.id] === o.id;
                    const locked = !!st?.forced;
                    const cls = `${chipBase} ${!st?.selectable ? chipDisabled : on ? chipOn : chipOff} ${locked ? ' ring-2 ring-[#ffec5a]' : ''}`;
                    return (
                        <button
                            type="button"
                            key={o.id}
                            style={hasTree ? { marginLeft: depth * 18 } : undefined}
                            aria-disabled={!st?.selectable || locked}
                            title={st?.selectable ? (locked ? 'Auto-selected and locked' : undefined) : whyDisabled(config, cs, g.id, o.id)}
                            onClick={() => {
                                if (!st?.selectable || locked) return;
                                if (multi) setSel(g.id, on ? arr.filter((x) => x !== o.id) : [...arr, o.id]);
                                else setSel(g.id, on ? undefined : o.id);
                            }}
                            className={cls}
                        >
                            {depth > 0 && <span className="mr-1 opacity-40">└</span>}
                            {multi && <span className={`mr-1.5 inline-block h-3 w-3 rounded-[3px] align-middle ${on ? 'bg-[#ffec5a]' : 'border border-current opacity-40'}`} />}
                            {o.name}
                            {o.priceAdjust ? <span className={`ml-1 text-xs ${on ? 'text-[#ffec5a]' : 'opacity-60'}`}>{adderText(o)}</span> : null}
                            {locked && <span className="ml-1 text-xs opacity-70">•</span>}
                        </button>
                    );
                })}
            </div>
        );
    };

    const renderGroup = (g: CfgGroup) => {
        if (cs.groupState[g.id]?.hidden) return null; // 结构层：父选项未选 → 整组隐藏
        if (g.selectType === 'dimension') {
            const dim = (cs.selections[g.id] as Dimension) ?? { width: 0, height: 0 };
            return (
                <Field key={g.id} label={g.name} required={g.isRequired} hint={[g.unit, g.min != null ? `min ${g.min}` : '', g.max != null ? `max ${g.max}` : ''].filter(Boolean).join(' · ') || undefined}>
                    <div className="flex max-w-md items-center gap-2">
                        <input type="number" min={g.min ?? undefined} max={g.max ?? undefined} placeholder="Width" className={input} value={dim.width || ''} onChange={(e) => setSel(g.id, { ...dim, width: Number(e.target.value) || 0 })} />
                        <span className="text-neutral-400">×</span>
                        <input type="number" min={g.min ?? undefined} max={g.max ?? undefined} placeholder="Height" className={input} value={dim.height || ''} onChange={(e) => setSel(g.id, { ...dim, height: Number(e.target.value) || 0 })} />
                        {g.unit && <span className="shrink-0 text-sm text-neutral-500">{g.unit}</span>}
                    </div>
                </Field>
            );
        }
        if (g.selectType === 'number') {
            return (
                <Field key={g.id} label={g.name} required={g.isRequired}>
                    <input type="number" min={g.min ?? undefined} max={g.max ?? undefined} className={`${input} max-w-[160px]`} value={(cs.selections[g.id] as number) ?? ''} onChange={(e) => setSel(g.id, Number(e.target.value) || 0)} />
                </Field>
            );
        }
        if (g.selectType === 'text') {
            return (
                <Field key={g.id} label={g.name} required={g.isRequired}>
                    <input type="text" className={`${input} max-w-sm`} value={(cs.selections[g.id] as string) ?? ''} onChange={(e) => setSel(g.id, e.target.value)} />
                </Field>
            );
        }
        if (g.selectType === 'file') {
            return (
                <Field key={g.id} label={g.name} required={g.isRequired}>
                    <input type="file" className={`${input} max-w-sm`} onChange={(e) => setSel(g.id, e.target.files?.[0]?.name ?? '')} />
                </Field>
            );
        }
        // single / multi
        return (
            <Field key={g.id} label={g.name} required={g.isRequired} hint={cs.groupState[g.id]?.unavailable ? 'No options available for the current combination.' : undefined}>
                {renderOptions(g)}
            </Field>
        );
    };

    return (
        <form action={formAction} className="space-y-6">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="quantity" value={quantity} />
            <input type="hidden" name="selections" value={JSON.stringify(cs.selections)} />
            <input type="hidden" name="artwork" value={artwork} />

            {/* 1. 规格配置 */}
            <Sec id="configuration" title="Configuration">
                {config.groups.length === 0 && <p className="text-sm text-neutral-500">This product has no options — just choose a quantity below.</p>}
                <div>{config.groups.map((g) => renderGroup(g))}</div>
            </Sec>

            {/* 2. 数量与价格 */}
            <Sec id="pricing" title="Quantity & Pricing" hint={`${config.currency} · factory-direct`}>
                <div className="flex flex-wrap items-center gap-2">
                    {tierButtons.map((q) => {
                        const unit = round2(computeConfigPrice(config, cs.selections, q, cs).finalUnit);
                        const active = quantity === q;
                        return (
                            <button type="button" key={q} onClick={() => setQuantity(q)} className={`min-w-[76px] rounded-lg border px-3 py-2 text-center ${active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700 hover:border-neutral-900'}`}>
                                <span className="block text-sm font-bold">{q.toLocaleString()}</span>
                                <span className={`block text-[11px] ${active ? 'text-[#ffec5a]' : 'text-neutral-400'}`}>{config.currency} {unit.toFixed(2)}</span>
                            </button>
                        );
                    })}
                    <label className="ml-1 text-sm text-neutral-500">Custom
                        <input type="number" min={1} className={`${input} ml-2 inline-block w-24`} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 0))} />
                    </label>
                </div>

                <div className="mt-5 rounded-xl bg-neutral-900 p-5 text-white">
                    <div className="flex items-center justify-between text-sm text-neutral-300">
                        <span>Unit price</span><span>{config.currency} {round2(price.finalUnit).toFixed(2)}</span>
                    </div>
                    {price.discountPct > 0 && (
                        <div className="mt-1 flex items-center justify-between text-sm text-[#ffec5a]"><span>Volume discount</span><span>−{price.discountPct}%</span></div>
                    )}
                    {price.surcharges.filter((s) => s.amount !== 0).map((s) => (
                        <div key={s.id} className="mt-1 flex items-center justify-between text-sm text-neutral-300">
                            <span>{s.name}</span><span>+{config.currency} {round2(s.amount).toFixed(2)}</span>
                        </div>
                    ))}
                    <div className="mt-3 flex items-end justify-between border-t border-white/10 pt-3">
                        <span className="text-sm text-neutral-300">Estimated total</span>
                        <span className="text-3xl font-black text-[#ffec5a]">{config.currency} {round2(price.total).toFixed(2)}</span>
                    </div>
                </div>
            </Sec>

            {/* 3. 交货信息 */}
            <Sec id="delivery" title="Delivery Information">
                <div className="grid gap-3 sm:grid-cols-2">
                    <input name="recipient" placeholder="Recipient *" className={input} />
                    <input name="phone" placeholder="Phone *" className={input} />
                    <input name="country" placeholder="Country *" className={input} />
                    <input name="province" placeholder="State / Province" className={input} />
                    <input name="city" placeholder="City" className={input} />
                    <input name="postalCode" placeholder="Postal code *" className={input} />
                    <input name="line1" placeholder="Address line 1 *" className={`${input} sm:col-span-2`} />
                    <input name="line2" placeholder="Address line 2" className={`${input} sm:col-span-2`} />
                </div>
            </Sec>

            {/* 4. 上传文件 */}
            <Sec id="upload" title="Upload Artwork" hint="optional">
                <p className="mb-3 text-sm text-neutral-500">Send print-ready artwork — our team reviews every file before production.</p>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-8 text-center transition hover:border-neutral-900">
                    <input type="file" accept=".pdf,.ai,.psd,.png,.jpg,.jpeg,.svg,.cdr" className="hidden" onChange={(e) => setArtwork(e.target.files?.[0]?.name ?? '')} />
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-neutral-400" aria-hidden>
                        <path d="M12 16V4m0 0 4 4m-4-4L8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span className="text-sm font-medium text-neutral-700">{artwork ? artwork : 'Click to upload or drop your file'}</span>
                    <span className="text-xs text-neutral-400">PDF · AI · PSD · PNG · JPG · CDR · up to 1000MB</span>
                </label>
                <textarea name="note" rows={2} placeholder="Order notes (optional) — e.g. PMS colors, special instructions" className={`${input} mt-3`} />
            </Sec>

            {state?.errors && state.errors.length > 0 && (
                <div className="rounded-xl border border-[#ff4d4f]/30 bg-red-50 p-4 text-sm text-[#ff4d4f]">
                    {state.errors.map((e, i) => (<p key={i}>• {e}</p>))}
                </div>
            )}

            {/* 5. 立即下单 */}
            <section id="place-order" className="scroll-mt-28">
                <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-neutral-900"><span className="h-4 w-1.5 rounded bg-[#ffec5a]" />Place Order</h3>
                {isLoggedIn ? (
                    <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#ffec5a] py-4 text-base font-black text-neutral-900 transition hover:brightness-95 disabled:opacity-60">
                        {pending ? 'Placing order…' : `Place order · ${config.currency} ${round2(price.total).toFixed(2)}`}
                    </button>
                ) : (
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 text-center text-sm text-neutral-600">
                        <Link href={loginHref} className="font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2">Sign in</Link> to place this order.
                    </div>
                )}
            </section>
        </form>
    );
}
