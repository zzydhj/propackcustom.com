'use client';

import { useMemo, useState } from 'react';
import { useActionState } from 'react';
import { Link } from '@/navigation';
import { createProductOrder, type CheckoutState } from '@/features/order/actions';
import { computePrice, round2, type PricingProduct, type Selections, type Dimension } from '@/lib/pricing';

const input = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

export function ProductConfigurator({
    product,
    isLoggedIn,
    loginHref,
}: {
    product: { id: string; slug: string; name: string; description: string; pricing: PricingProduct };
    isLoggedIn: boolean;
    loginHref: string;
}) {
    const { pricing } = product;
    const [selections, setSelections] = useState<Selections>({});
    const [quantity, setQuantity] = useState<number>(pricing.quantityTiers[0]?.min ?? 100);
    const [state, formAction, pending] = useActionState<CheckoutState | null, FormData>(createProductOrder, null);

    const setSel = (id: string, v: Selections[string]) => setSelections((prev) => ({ ...prev, [id]: v }));
    const price = useMemo(() => computePrice(pricing, selections, quantity), [pricing, selections, quantity]);

    const tierButtons = useMemo(() => {
        const mins = new Set<number>([quantity, ...pricing.quantityTiers.map((t) => t.min)]);
        return [...mins].filter((m) => m > 0).sort((a, b) => a - b).slice(0, 8);
    }, [pricing.quantityTiers, quantity]);

    if (state?.ok && state.orderNo) {
        return (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
                <p className="text-lg font-bold text-green-800">Order placed 🎉</p>
                <p className="mt-1 text-sm text-green-700">Order #{state.orderNo} is pending payment. Pay it from your balance in My Account.</p>
                <Link href="/account/orders" className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Go to my orders</Link>
            </div>
        );
    }

    return (
        <form action={formAction} className="space-y-6">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="quantity" value={quantity} />
            <input type="hidden" name="selections" value={JSON.stringify(selections)} />

            {/* 配置字段 */}
            <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6">
                {pricing.attributes.length === 0 && <p className="text-sm text-neutral-500">This product has no options — just choose a quantity below.</p>}
                {pricing.attributes.map((attr) => {
                    if (attr.type === 'DIMENSION') {
                        const dim = (selections[attr.id] as Dimension) ?? { width: 0, height: 0 };
                        return (
                            <Field key={attr.id} label={attr.label} required={attr.required} hint={attr.unit ? `mm · min ${attr.min ?? '-'} · max ${attr.max ?? '-'}` : undefined}>
                                <div className="flex items-center gap-2">
                                    <input type="number" min={attr.min} max={attr.max} placeholder="Width" className={input} value={dim.width || ''} onChange={(e) => setSel(attr.id, { ...dim, width: Number(e.target.value) || 0 })} />
                                    <span className="text-neutral-400">×</span>
                                    <input type="number" min={attr.min} max={attr.max} placeholder="Height" className={input} value={dim.height || ''} onChange={(e) => setSel(attr.id, { ...dim, height: Number(e.target.value) || 0 })} />
                                    {attr.unit && <span className="text-sm text-neutral-500">{attr.unit}</span>}
                                </div>
                            </Field>
                        );
                    }
                    if (attr.type === 'SELECT') {
                        return (
                            <Field key={attr.id} label={attr.label} required={attr.required}>
                                <div className="flex flex-wrap gap-2">
                                    {(attr.options ?? []).map((o) => {
                                        const active = selections[attr.id] === o.id;
                                        return (
                                            <button type="button" key={o.id} onClick={() => setSel(attr.id, active ? undefined : o.id)} className={`rounded-lg border px-3 py-2 text-sm ${active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900'}`}>
                                                {o.label}{o.adder ? <span className="ml-1 text-xs opacity-70">{o.adderType === 'PERCENT' ? `+${o.adder}%` : `+$${o.adder}`}</span> : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Field>
                        );
                    }
                    if (attr.type === 'MULTI') {
                        const arr = (selections[attr.id] as string[]) ?? [];
                        return (
                            <Field key={attr.id} label={attr.label} required={attr.required}>
                                <div className="flex flex-wrap gap-2">
                                    {(attr.options ?? []).map((o) => {
                                        const on = arr.includes(o.id);
                                        return (
                                            <button type="button" key={o.id} onClick={() => setSel(attr.id, on ? arr.filter((x) => x !== o.id) : [...arr, o.id])} className={`rounded-lg border px-3 py-2 text-sm ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900'}`}>
                                                {o.label}{o.adder ? <span className="ml-1 text-xs opacity-70">{o.adderType === 'PERCENT' ? `+${o.adder}%` : `+$${o.adder}`}</span> : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Field>
                        );
                    }
                    if (attr.type === 'NUMBER') {
                        return (
                            <Field key={attr.id} label={attr.label} required={attr.required}>
                                <input type="number" min={attr.min} max={attr.max} className={input} value={(selections[attr.id] as number) ?? ''} onChange={(e) => setSel(attr.id, Number(e.target.value) || 0)} />
                            </Field>
                        );
                    }
                    return (
                        <Field key={attr.id} label={attr.label} required={attr.required}>
                            <input type="text" className={input} value={(selections[attr.id] as string) ?? ''} onChange={(e) => setSel(attr.id, e.target.value)} />
                        </Field>
                    );
                })}
            </div>

            {/* 数量 */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                <p className="mb-3 text-sm font-semibold text-neutral-900">Quantity</p>
                <div className="flex flex-wrap items-center gap-2">
                    {tierButtons.map((q) => (
                        <button type="button" key={q} onClick={() => setQuantity(q)} className={`rounded-lg border px-4 py-2 text-sm font-medium ${quantity === q ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700 hover:border-neutral-900'}`}>
                            {q.toLocaleString()}
                        </button>
                    ))}
                    <label className="ml-2 text-sm text-neutral-500">Custom
                        <input type="number" min={1} className={`${input} ml-2 inline-block w-28`} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 0))} />
                    </label>
                </div>
            </div>

            {/* 价格汇总 */}
            <div className="rounded-2xl border border-neutral-200 bg-neutral-900 p-6 text-white">
                <div className="flex items-center justify-between text-sm text-neutral-300">
                    <span>Unit price</span><span>{pricing.currency} {round2(price.finalUnit).toFixed(2)}</span>
                </div>
                {price.discountPct > 0 && (
                    <div className="flex items-center justify-between text-sm text-[#ffec5a]"><span>Volume discount</span><span>−{price.discountPct}%</span></div>
                )}
                <div className="mt-3 flex items-end justify-between border-t border-white/10 pt-3">
                    <span className="text-sm text-neutral-300">Estimated total</span>
                    <span className="text-3xl font-black text-[#ffec5a]">{pricing.currency} {round2(price.total).toFixed(2)}</span>
                </div>
            </div>

            {/* 收货信息 */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                <p className="mb-3 text-sm font-semibold text-neutral-900">Shipping details</p>
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
            </div>

            {state?.errors && state.errors.length > 0 && (
                <div className="rounded-xl border border-[#ff4d4f]/30 bg-red-50 p-4 text-sm text-[#ff4d4f]">
                    {state.errors.map((e, i) => (<p key={i}>• {e}</p>))}
                </div>
            )}

            {isLoggedIn ? (
                <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#ffec5a] py-4 text-base font-black text-neutral-900 hover:brightness-95 disabled:opacity-60">
                    {pending ? 'Placing order…' : `Place order · ${pricing.currency} ${round2(price.total).toFixed(2)}`}
                </button>
            ) : (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 text-center text-sm text-neutral-600">
                    <Link href={loginHref} className="font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2">Sign in</Link> to place this order.
                </div>
            )}
        </form>
    );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-800">{label}{required && <span className="ml-1 text-[#ff4d4f]">*</span>}</p>
                {hint && <span className="text-xs text-neutral-400">{hint}</span>}
            </div>
            {children}
        </div>
    );
}
