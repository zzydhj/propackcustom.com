'use client';

import { useActionState, useState, useTransition } from 'react';
import { confirmOrder, markOrderPaid, resendOrderEmail, type ConfirmState } from '@/features/admin/actions';
import { adjustmentOf } from '@/lib/orders';

// 订单确认面板：人工对接流程的指挥中心。
// SUBMITTED → 核对工艺/运费、改价、选付款方式、发链接（AWAITING_PAYMENT）
// AWAITING_PAYMENT → 对账后标记已收款，或重发邮件
export type ReviewOrder = {
    id: string;
    orderNo: string;
    viewToken: string;
    status: string;
    currency: string;
    total: number;
    quotedTotal: number;
    shippingFee: number;
    adjustReason: string | null;
    paymentMethod: string | null;
    payUrl: string | null;
    proofFileName: string | null;
    artworkId: string | null;
    email: string | null;
    expiresAt: string | null;
    trackingNo: string;
    carrier: string;
};

const input = 'w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm outline-none transition focus:border-neutral-900';
const btnDark = 'rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60';
const btnGhost = 'rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-700 transition hover:border-neutral-900 disabled:opacity-60';

const ERR: Record<string, string> = {
    invalid: '表单填写有误。',
    'not-found': '订单不存在。',
    'no-email': '该订单没有联系邮箱，无法发送。',
    'send-failed': '邮件发送失败（检查 RESEND_API_KEY）。',
    'already-paid': '该订单已标记为已付款。',
};

export function OrderReviewPanel({ order, stripeReady }: { order: ReviewOrder; stripeReady: boolean }) {
    const [confirmState, confirmAction, confirming] = useActionState<ConfirmState | null, FormData>(confirmOrder, null);
    const [paidState, paidAction, paying] = useActionState<{ ok: boolean; error?: string } | null, FormData>(markOrderPaid, null);
    const [pendingMail, startMail] = useTransition();
    const [mailMsg, setMailMsg] = useState('');
    const [method, setMethod] = useState<'stripe_link' | 'manual_tt'>(stripeReady ? 'stripe_link' : 'manual_tt');

    const awaiting = order.status === 'AWAITING_PAYMENT' || order.status === 'PENDING_PAYMENT';
    const submitted = order.status === 'SUBMITTED';
    // 与客户订单页同口径：运费单列，不计入「调价」
    const delta = adjustmentOf(order.total, order.quotedTotal, order.shippingFee);
    const errText = (e?: string) => (e ? ERR[e] ?? e : '');

    const resend = (kind: 'received' | 'confirmed') => {
        setMailMsg('');
        startMail(async () => {
            const fd = new FormData();
            fd.set('id', order.id);
            fd.set('kind', kind);
            const res = await resendOrderEmail(null, fd);
            if (res?.ok) setMailMsg('已重新发送邮件。');
            else setMailMsg(errText(res?.error) || '发送失败。');
        });
    };

    return (
        <div className="space-y-4">
            {/* ── 待确认：核对并改价 ───────────────────── */}
            {submitted && (
                <form action={confirmAction} className="rounded-xl border border-[#ffec5a] bg-[#ffec5a]/10 p-4">
                    <p className="mb-3 text-sm font-bold text-neutral-900">确认订单并发送付款链接</p>
                    <input type="hidden" name="id" value={order.id} />

                    <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-neutral-600">
                                最终总价（{order.currency}）
                            </span>
                            <input name="total" type="number" step="0.01" min="0.01" required defaultValue={order.total.toFixed(2)} className={input} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-neutral-600">运费（{order.currency}）</span>
                            <input name="shippingFee" type="number" step="0.01" min="0" defaultValue={order.shippingFee.toFixed(2)} className={input} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-neutral-600">调价原因（客户可见）</span>
                            <input
                                name="adjustReason"
                                maxLength={500}
                                defaultValue={order.adjustReason ?? ''}
                                placeholder={Math.abs(delta) > 0.005 ? '必填：说明总价为何变化' : '未改价可留空'}
                                className={input}
                            />
                        </label>
                    </div>

                    <p className="mt-2 text-xs text-neutral-500">
                        配置器报价 {order.currency} {order.quotedTotal.toFixed(2)}
                        {order.shippingFee > 0 && <> · 已计运费 {order.currency} {order.shippingFee.toFixed(2)}</>}
                        {Math.abs(delta) > 0.005 && (
                            <span className={delta > 0 ? ' text-[#ff4d4f]' : ' text-green-700'}>
                                {' '}· 人工调价 {delta > 0 ? '+' : '−'}{order.currency} {Math.abs(delta).toFixed(2)}
                            </span>
                        )}
                    </p>

                    <fieldset className="mt-3">
                        <legend className="mb-1.5 text-xs font-semibold text-neutral-600">付款方式</legend>
                        <div className="flex flex-wrap gap-2">
                            <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${method === 'stripe_link' ? 'border-neutral-900 bg-white font-semibold' : 'border-neutral-300 bg-white'}`}>
                                <input type="radio" name="paymentMethod" value="stripe_link" checked={method === 'stripe_link'} onChange={() => setMethod('stripe_link')} disabled={!stripeReady} />
                                Stripe 付款链接{!stripeReady && <span className="text-xs text-neutral-400">（未配置密钥）</span>}
                            </label>
                            <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${method === 'manual_tt' ? 'border-neutral-900 bg-white font-semibold' : 'border-neutral-300 bg-white'}`}>
                                <input type="radio" name="paymentMethod" value="manual_tt" checked={method === 'manual_tt'} onChange={() => setMethod('manual_tt')} />
                                银行转账 / 站内订单页
                            </label>
                        </div>
                    </fieldset>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button type="submit" disabled={confirming} className={btnDark}>
                            {confirming ? '处理中…' : '确认并发送邮件'}
                        </button>
                        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
                            <input type="checkbox" name="sendEmail" defaultChecked />
                            发送确认函到 {order.email ?? '（无邮箱）'}
                        </label>
                    </div>

                    {!order.email && <p className="mt-2 text-xs text-[#ff4d4f]">该订单没有邮箱，确认后不会自动发邮件，请手动联系客户。</p>}
                    {confirmState && !confirmState.ok && <p className="mt-2 text-xs text-[#ff4d4f]">{errText(confirmState.error)}</p>}
                    {confirmState?.ok && (
                        <p className="mt-2 text-xs text-green-700">
                            已确认{confirmState.emailed ? '并发送邮件' : '（未发送邮件）'}
                            {confirmState.payUrl && (
                                <>
                                    {' · '}
                                    <a className="underline decoration-[#ffec5a] decoration-2" href={confirmState.payUrl} target="_blank" rel="noopener noreferrer">
                                        打开付款链接
                                    </a>
                                </>
                            )}
                        </p>
                    )}
                </form>
            )}

            {/* ── 待付款：对账 + 重发 ─────────────────── */}
            {awaiting && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                    <p className="text-sm font-bold text-neutral-900">等待客户付款</p>
                    <dl className="mt-2 space-y-1 text-xs text-neutral-600">
                        <div className="flex gap-2">
                            <dt className="w-20 shrink-0 text-neutral-500">付款方式</dt>
                            <dd>{order.paymentMethod === 'stripe_link' ? 'Stripe 付款链接' : order.paymentMethod === 'wallet' ? '账户余额' : '银行转账 / 站内订单页'}</dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="w-20 shrink-0 text-neutral-500">付款链接</dt>
                            <dd className="min-w-0 break-all">
                                {order.payUrl ? (
                                    <a className="underline decoration-[#ffec5a] decoration-2" href={order.payUrl} target="_blank" rel="noopener noreferrer">{order.payUrl}</a>
                                ) : '—'}
                            </dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="w-20 shrink-0 text-neutral-500">客户凭证</dt>
                            <dd>
                                {order.proofFileName ? (
                                    <>
                                        已上传：{order.proofFileName}{' '}
                                        <a
                                            href={`/api/admin/file?order=${order.id}&kind=proof`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-semibold text-neutral-900 underline"
                                        >
                                            查看
                                        </a>
                                    </>
                                ) : (
                                    '未上传'
                                )}
                            </dd>
                        </div>
                    </dl>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <form action={paidAction} className="flex items-center gap-2">
                            <input type="hidden" name="id" value={order.id} />
                            <input type="hidden" name="provider" value={order.paymentMethod === 'stripe_link' ? 'stripe' : 'manual_tt'} />
                            <button type="submit" disabled={paying} className={btnDark}>
                                {paying ? '处理中…' : '标记已收款'}
                            </button>
                        </form>
                        <button type="button" disabled={pendingMail || !order.email} onClick={() => resend('confirmed')} className={btnGhost}>
                            重发确认函
                        </button>
                        <button type="button" disabled={pendingMail || !order.email} onClick={() => resend('received')} className={btnGhost}>
                            重发收件函
                        </button>
                    </div>
                    {paidState && !paidState.ok && <p className="mt-2 text-xs text-[#ff4d4f]">{errText(paidState.error)}</p>}
                    {paidState?.ok && <p className="mt-2 text-xs text-green-700">已标记为已付款，并向客户发送到账回执。</p>}
                    {mailMsg && <p className="mt-2 text-xs text-neutral-600">{mailMsg}</p>}
                </div>
            )}

            {/* ── 其他状态：仍可补发邮件 ───────────────── */}
            {!submitted && !awaiting && (
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={pendingMail || !order.email} onClick={() => resend('received')} className={btnGhost}>
                        重发收件函
                    </button>
                    {mailMsg && <span className="text-xs text-neutral-600">{mailMsg}</span>}
                </div>
            )}

            <p className="text-xs text-neutral-400">
                客户订单页：<code className="font-mono">/order/{order.viewToken}</code>
                {order.expiresAt && submitted && <> · 锁价至 {order.expiresAt.slice(0, 10)}</>}
            </p>
        </div>
    );
}
