import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { adjustmentOf, isExpired, money, shippingLines, type Shipping, type SpecLine } from '@/lib/orders';
import { bankDetails, salesEmail } from '@/lib/payment-info';
import { OrderStatusBadge, OrderTimeline } from '@/components/ui/StatusBadges';
import { ProofUpload } from '@/components/order/ProofUpload';
import { OrderPayButton } from '@/components/account/OrderPayButton';

// 免登录订单页：viewToken 即访问凭证，邮件里的链接直达此处。
// 它同时承担「付款入口」职责 —— Stripe Payment Link 之外的银行转账（T/T）在这里完成。
export const dynamic = 'force-dynamic';

type ItemSpecs = {
    _product?: string;
    _lines?: SpecLine[];
    _unit?: number;
    _discountPct?: number;
    _surcharges?: { name: string; amount: number }[];
    _artwork?: string;
    _note?: string;
    _fromQuote?: string;
};

export default function OrderPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
    return <View params={params} />;
}

async function View({ params }: { params: Promise<{ locale: string; token: string }> }) {
    const { locale, token } = await params;
    setRequestLocale(locale);

    const order = await prisma.order.findUnique({
        where: { viewToken: token },
        include: { items: { include: { product: true } }, address: true },
    });
    if (!order) notFound();

    // 惰性过期：不引 cron，客户/后台打开时若已超期未确认则落库为 EXPIRED
    let status = order.status as string;
    if (isExpired(status, order.expiresAt)) {
        await prisma.order.update({ where: { id: order.id }, data: { status: 'EXPIRED' } }).catch(() => { });
        status = 'EXPIRED';
    }

    const session = await auth().catch(() => null);
    const isOwner = Boolean(session?.user?.id && order.userId === session.user.id);
    const balance = isOwner
        ? Number((await prisma.user.findUnique({ where: { id: order.userId! }, select: { balance: true } }))?.balance ?? 0)
        : 0;

    const item = order.items[0];
    const specs = (item?.specs ?? {}) as ItemSpecs;
    const lines = specs._lines ?? [];
    const surcharges = specs._surcharges ?? [];
    const shipping = (order.shipping as Shipping | null) ?? null;
    const addressLines = order.address
        ? shippingLines({
            recipient: order.address.recipient,
            phone: order.address.phone,
            country: order.address.country,
            province: order.address.province ?? undefined,
            city: order.address.city ?? undefined,
            line1: order.address.line1,
            line2: order.address.line2 ?? undefined,
            postalCode: order.address.postalCode,
        })
        : shippingLines(shipping);

    const currency = order.currency;
    const quotedTotal = order.quotedTotal != null ? Number(order.quotedTotal) : Number(order.total);
    const total = Number(order.total);
    const shippingFee = Number(order.shippingFee);
    // 明细必须自洽：Configurator total + Shipping + Adjustment = Total
    const adjustment = adjustmentOf(total, quotedTotal, shippingFee);
    const adjusted = Math.abs(adjustment) > 0.005;
    const bank = bankDetails();
    const awaiting = status === 'AWAITING_PAYMENT' || status === 'PENDING_PAYMENT';

    return (
        <main className="mx-auto max-w-3xl px-5 py-12 2xl:px-12">
            {/* 头部 */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="font-mono text-sm text-neutral-500">#{order.orderNo}</p>
                    <h1 className="mt-1 text-3xl font-black tracking-tight text-neutral-900">
                        {specs._product ?? 'Your order'}
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Placed {order.createdAt.toISOString().slice(0, 10)}
                        {item ? ` · ${item.quantity.toLocaleString()} units` : ''}
                    </p>
                </div>
                <OrderStatusBadge status={status} />
            </div>

            <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
                <OrderTimeline status={status} />
            </div>

            {/* 状态说明 + 付款入口 */}
            <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
                {status === 'SUBMITTED' && (
                    <div>
                        <h2 className="text-lg font-bold text-neutral-900">We&rsquo;re reviewing your order</h2>
                        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                            A packaging specialist is checking feasibility, artwork and shipping to your country.
                            <strong className="text-neutral-900"> No payment is needed right now.</strong> We&rsquo;ll email your
                            confirmed price and a payment link — usually within one business day.
                        </p>
                        {order.expiresAt && (
                            <p className="mt-3 inline-flex rounded-lg bg-[#ffec5a]/40 px-3 py-1.5 text-xs font-semibold text-neutral-900">
                                This price is held until {order.expiresAt.toISOString().slice(0, 10)}
                            </p>
                        )}
                    </div>
                )}

                {awaiting && (
                    <div>
                        <h2 className="text-lg font-bold text-neutral-900">Ready for payment</h2>
                        <p className="mt-2 text-sm text-neutral-600">
                            Your price is confirmed. Production starts as soon as payment is received.
                        </p>

                        {order.paymentMethod === 'stripe_link' && order.payUrl ? (
                            <a
                                href={order.payUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-4 block rounded-xl bg-[#ffec5a] py-4 text-center text-base font-black text-neutral-900 transition hover:brightness-95"
                            >
                                Pay {money(total, currency)} securely
                            </a>
                        ) : (
                            <div className="mt-4 space-y-4">
                                {bank ? (
                                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                                        <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Bank transfer (T/T)</p>
                                        <dl className="mt-3 grid gap-1.5 text-sm">
                                            <Row k="Beneficiary" v={bank.accountName} />
                                            <Row k="Bank" v={bank.bankName} />
                                            {bank.bankAddress && <Row k="Bank address" v={bank.bankAddress} />}
                                            <Row k="Account / IBAN" v={bank.accountNumber} />
                                            <Row k="SWIFT / BIC" v={bank.swift} />
                                            <Row k="Amount" v={money(total, currency)} strong />
                                            <Row k="Reference" v={order.orderNo} strong />
                                        </dl>
                                        {bank.notes && <p className="mt-3 text-xs text-neutral-500">{bank.notes}</p>}
                                    </div>
                                ) : (
                                    <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                                        We&rsquo;ll email the bank details for this order. If you&rsquo;d rather pay by card, reply to the
                                        confirmation email and we&rsquo;ll send a secure card link.
                                    </p>
                                )}
                                <div>
                                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Already paid?</p>
                                    <ProofUpload
                                        viewToken={order.viewToken}
                                        salesEmail={salesEmail()}
                                        existing={order.proofFileName ? { fileName: order.proofFileName, url: order.proofUrl } : null}
                                    />
                                </div>
                            </div>
                        )}

                        {isOwner && balance >= total && (
                            <div className="mt-4 flex items-center justify-between rounded-xl border border-neutral-200 p-4">
                                <div>
                                    <p className="text-sm font-semibold text-neutral-900">Pay from wallet balance</p>
                                    <p className="text-xs text-neutral-500">Available: {money(balance, currency)}</p>
                                </div>
                                <OrderPayButton orderId={order.id} />
                            </div>
                        )}
                    </div>
                )}

                {status === 'PAID' && (
                    <div>
                        <h2 className="text-lg font-bold text-neutral-900">Payment received 🎉</h2>
                        <p className="mt-2 text-sm text-neutral-600">
                            We&rsquo;re preparing your print-ready proof. You&rsquo;ll get it by email for approval before production starts.
                        </p>
                    </div>
                )}

                {(status === 'IN_PRODUCTION' || status === 'SHIPPED' || status === 'COMPLETED') && (
                    <div>
                        <h2 className="text-lg font-bold text-neutral-900">
                            {status === 'IN_PRODUCTION' ? 'In production' : status === 'SHIPPED' ? 'Shipped' : 'Completed'}
                        </h2>
                        {order.trackingNo && (
                            <p className="mt-2 text-sm text-neutral-600">
                                {order.carrier ? `${order.carrier} · ` : ''}Tracking <span className="font-mono font-semibold text-neutral-900">{order.trackingNo}</span>
                            </p>
                        )}
                        <p className="mt-2 text-sm text-neutral-600">
                            Standard lead time is 5–9 business days after artwork approval.
                        </p>
                    </div>
                )}

                {status === 'EXPIRED' && (
                    <div>
                        <h2 className="text-lg font-bold text-neutral-900">This quote has expired</h2>
                        <p className="mt-2 text-sm text-neutral-600">
                            Material and freight prices move, so we held this price for a limited window. Configure it again and
                            we&rsquo;ll re-quote within one business day.
                        </p>
                        <Link href="/products" className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
                            Start a new order
                        </Link>
                    </div>
                )}

                {status === 'CANCELLED' && (
                    <div>
                        <h2 className="text-lg font-bold text-neutral-900">Order cancelled</h2>
                        <p className="mt-2 text-sm text-neutral-600">
                            Contact us at {salesEmail()} if you&rsquo;d like to reopen this order.
                        </p>
                    </div>
                )}
            </section>

            {/* 价格明细：调价必须留痕并说明原因 */}
            <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
                <h2 className="mb-4 text-base font-bold text-neutral-900">Price summary</h2>
                <dl className="space-y-2 text-sm">
                    {item && <Row k={`Unit price${specs._discountPct ? ` (−${specs._discountPct}% volume)` : ''}`} v={money(specs._unit ?? Number(item.unitPrice), currency)} />}
                    {item && <Row k={`Quantity`} v={item.quantity.toLocaleString()} />}
                    {surcharges.filter((s) => s.amount !== 0).map((s) => (
                        <Row key={s.name} k={s.name} v={`+${money(s.amount, currency)}`} />
                    ))}
                    <Row k="Configurator total" v={money(quotedTotal, currency)} />
                    {shippingFee > 0 && <Row k="Shipping" v={money(shippingFee, currency)} />}
                    {adjusted && <Row k="Adjustment" v={`${adjustment >= 0 ? '+' : '−'}${money(Math.abs(adjustment), currency)}`} />}
                </dl>
                {/* 只要销售写了原因就展示：即使只加了运费，客户也需要知道总价为何变了 */}
                {order.adjustReason && (
                    <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
                        <strong className="text-neutral-900">Why the total changed:</strong> {order.adjustReason}
                    </p>
                )}
                <div className="mt-4 flex items-end justify-between border-t border-neutral-100 pt-4">
                    <span className="text-sm text-neutral-500">Total</span>
                    <span className="text-3xl font-black text-neutral-900">{money(total, currency)}</span>
                </div>
            </section>

            {/* 规格快照 */}
            {lines.length > 0 && (
                <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
                    <h2 className="mb-4 text-base font-bold text-neutral-900">Specifications</h2>
                    <dl className="divide-y divide-neutral-100 text-sm">
                        {lines.map((l) => (
                            <div key={l.label} className="grid grid-cols-[140px_minmax(0,1fr)] gap-4 py-2.5">
                                <dt className="text-neutral-500">{l.label}</dt>
                                <dd className="font-medium text-neutral-800">{l.value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}

            {/* 收货 + 素材 + 备注 */}
            <section className="mt-6 grid gap-6 sm:grid-cols-2">
                {addressLines.length > 0 && (
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                        <h2 className="mb-3 text-base font-bold text-neutral-900">Delivery</h2>
                        <dl className="space-y-1.5 text-sm">
                            {addressLines.map((l) => (
                                <div key={l.label} className="grid grid-cols-[86px_minmax(0,1fr)] gap-3">
                                    <dt className="text-neutral-500">{l.label}</dt>
                                    <dd className="font-medium text-neutral-800">{l.value}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                )}
                <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <h2 className="mb-3 text-base font-bold text-neutral-900">Artwork &amp; notes</h2>
                    {specs._artwork ? (
                        <p className="text-sm text-neutral-700">
                            <span className="text-neutral-500">File:</span> {specs._artwork}
                        </p>
                    ) : (
                        <p className="text-sm text-neutral-500">No artwork attached yet — you can email it to {salesEmail()}.</p>
                    )}
                    {specs._note && <p className="mt-2 text-sm text-neutral-700"><span className="text-neutral-500">Note:</span> {specs._note}</p>}
                </div>
            </section>

            <p className="mt-8 text-center text-sm text-neutral-500">
                Questions about this order? Email{' '}
                <a className="font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2" href={`mailto:${salesEmail()}`}>
                    {salesEmail()}
                </a>{' '}
                and quote #{order.orderNo}.
            </p>
        </main>
    );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <dt className="text-neutral-500">{k}</dt>
            <dd className={strong ? 'font-bold text-neutral-900' : 'font-medium text-neutral-800'}>{v}</dd>
        </div>
    );
}
