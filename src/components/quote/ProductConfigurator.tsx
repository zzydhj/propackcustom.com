'use client';

import { useEffect, useMemo, useState } from 'react';
import { useActionState } from 'react';
import { Link } from '@/navigation';
import { createProductOrder, type CheckoutState } from '@/features/order/actions';
import { R2FileUpload } from '@/components/ui/R2FileUpload';
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
    email,
}: {
    product: { id: string; slug: string; name: string; description: string };
    config: ProductConfig;
    isLoggedIn: boolean;
    loginHref: string;
    email?: string;
}) {
    const [cs, setCs] = useState<ConfigState>(() => computeConfigState(config, initialSelections(config), []));
    const [quantity, setQuantity] = useState<number>(config.quantityTiers[0]?.min ?? 100);
    const [artwork, setArtwork] = useState('');
    const [artworkId, setArtworkId] = useState('');
    // R2 未配置 / 网络异常时降级为「只记文件名」，绝不因此卡住下单
    const [uploadFallback, setUploadFallback] = useState(false);
    const [designId, setDesignId] = useState('');

    // M2a：从 localStorage 读取设计器传来的 designId（一次性，读完即清）
    useEffect(() => {
        const d = localStorage.getItem('pp_order_design');
        if (d) { setDesignId(d); localStorage.removeItem('pp_order_design'); }
    }, []);

    const [state, formAction, pending] = useActionState<CheckoutState | null, FormData>(createProductOrder, null);

    // 每次改动都用「全部已选」重算到不动点（级联 forced/prune，任意顺序都自洽）
    const setSel = (gid: string, v: Selections[string]) =>
        setCs((prev) => computeConfigState(config, { ...prev.selections, [gid]: v }, prev.autoChecked));

    const price = useMemo(() => computeConfigPrice(config, cs.selections, quantity, cs), [config, cs, quantity]);

    const tierButtons = useMemo(() => {
        const mins = new Set<number>([quantity, ...config.quantityTiers.map((t) => t.min)]);
        return [...mins].filter((m) => m > 0).sort((a, b) => a - b).slice(0, 8);
    }, [config.quantityTiers, quantity]);

    // 提交成功：强调「不用现在付款」，并给出免登录追踪链接（viewToken 即凭证）
    if (state?.ok && state.orderNo) {
        return (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
                <p className="text-lg font-bold text-green-800">Order submitted 🎉</p>
                <p className="mt-2 text-sm leading-relaxed text-green-700">
                    Order <strong>#{state.orderNo}</strong> is with our team.
                    <strong> No payment is needed right now.</strong> A packaging specialist checks feasibility, artwork and
                    freight, then emails your confirmed price with a payment link — usually within one business day.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                    {state.viewToken && (
                        <Link href={`/order/${state.viewToken}`} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
                            Track this order
                        </Link>
                    )}
                    {isLoggedIn && (
                        <Link href="/account/orders" className="rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-800">
                            Go to my orders
                        </Link>
                    )}
                </div>
                <p className="mt-3 text-xs text-green-700">
                    Bookmark this page or keep the confirmation email — the tracking link works without signing in.
                </p>
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
            <input type="hidden" name="artworkId" value={artworkId} />
            {designId && <input type="hidden" name="designId" value={designId} />}

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

            {/* 3. 联系方式与交货信息 */}
            <Sec id="delivery" title="Contact & Delivery">
                <div className="grid gap-3 sm:grid-cols-2">
                    <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        defaultValue={email ?? ''}
                        placeholder={isLoggedIn ? 'Email — your confirmation is sent here' : 'Email * — we send your confirmed price here'}
                        className={`${input} sm:col-span-2`}
                    />
                    <input name="company" autoComplete="organization" placeholder="Company name (optional — for quotes & invoicing)" className={`${input} sm:col-span-2`} />
                    <input name="recipient" placeholder="Recipient *" className={input} />
                    <input name="phone" placeholder="Phone *" className={input} />
                    <input name="country" placeholder="Country *" className={input} />
                    <input name="province" placeholder="State / Province" className={input} />
                    <input name="city" placeholder="City" className={input} />
                    <input name="postalCode" placeholder="Postal code *" className={input} />
                    <input name="line1" placeholder="Address line 1 *" className={`${input} sm:col-span-2`} />
                    <input name="line2" placeholder="Address line 2" className={`${input} sm:col-span-2`} />
                </div>
                {!isLoggedIn && (
                    <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                        No account needed. We&rsquo;ll email a secure link to track this order and pay later —{' '}
                        <Link href={loginHref} className="font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2">sign in</Link>{' '}
                        if you already have one.
                    </p>
                )}
            </Sec>

            {/* 4. 上传文件：浏览器直传 R2，不经过站点服务器（避开 4.5MB 请求体上限） */}
            <Sec id="upload" title="Upload Artwork" hint="optional">
                <p className="mb-3 text-sm text-neutral-500">Send print-ready artwork — our team reviews every file before production.</p>
                {uploadFallback ? (
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                        <p className="text-sm text-neutral-600">
                            Direct upload isn&rsquo;t available right now. Type your file name below and email the artwork to us
                            after submitting — your order won&rsquo;t be held up.
                        </p>
                        <input
                            type="text"
                            value={artwork}
                            onChange={(e) => setArtwork(e.target.value)}
                            placeholder="e.g. label-artwork-v3.pdf"
                            className={`${input} mt-2`}
                        />
                    </div>
                ) : (
                    <R2FileUpload
                        kind="artwork"
                        accept=".pdf,.ai,.psd,.png,.jpg,.jpeg,.svg,.cdr"
                        label={artwork ? `${artwork} — click to replace` : 'Click to upload your file'}
                        hint="PDF · AI · PSD · PNG · JPG · CDR"
                        onUnavailable={() => setUploadFallback(true)}
                        onUploaded={(f) => {
                            setArtwork(f.fileName);
                            setArtworkId(f.artworkId ?? '');
                        }}
                    />
                )}
                <textarea name="note" rows={2} placeholder="Order notes (optional) — e.g. PMS colors, special instructions" className={`${input} mt-3`} />
            </Sec>

            {state?.errors && state.errors.length > 0 && (
                <div className="rounded-xl border border-[#ff4d4f]/30 bg-red-50 p-4 text-sm text-[#ff4d4f]">
                    {state.errors.map((e, i) => (<p key={i}>• {e}</p>))}
                </div>
            )}

            {/* 5. 提交订单：不收款、不登录，直接进入人工对接（B 端批发语境） */}
            <section id="place-order" className="scroll-mt-28">
                <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-neutral-900"><span className="h-4 w-1.5 rounded bg-[#ffec5a]" />Start Your Wholesale Order</h3>
                <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#ffec5a] py-4 text-base font-black text-neutral-900 transition hover:brightness-95 disabled:opacity-60">
                    {pending ? 'Submitting…' : 'Get My Confirmed Price · No Payment Now'}
                </button>
                <p className="mt-3 text-center text-sm text-neutral-600">
                    Estimated total <strong className="text-neutral-900">{config.currency} {round2(price.total).toFixed(2)}</strong>
                    {' '}— a specialist confirms feasibility &amp; freight, then emails your invoice-ready quote.
                </p>
                <ul className="mt-3 grid gap-1.5 text-xs text-neutral-500 sm:grid-cols-2">
                    <li>✓ Factory-direct pricing · MOQ {config.quantityTiers[0]?.min ?? 100}+</li>
                    <li>✓ Quote held for 72 hours</li>
                    <li>✓ Free artwork &amp; dieline check</li>
                    <li>✓ Company invoicing &amp; T/T · Stripe</li>
                </ul>
            </section>
        </form>
    );
}
