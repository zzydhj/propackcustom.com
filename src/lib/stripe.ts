import Stripe from 'stripe';

// ── Stripe Payment Link ────────────────────────────────────
// 人工对接流程不做站内收银台：销售核对完价格后生成一条 Payment Link，
// 邮件发给客户，客户在 Stripe 托管页付款。零前端集成，支持卡 / PayPal / Apple Pay。
// 未配置 STRIPE_SECRET_KEY 时自动降级为「站内订单页 + 银行转账（T/T）」。

const key = process.env.STRIPE_SECRET_KEY;

export function stripeEnabled(): boolean {
    return Boolean(key && key.startsWith('sk_') && !key.includes('xxx'));
}

let client: Stripe | null = null;
function stripe(): Stripe {
    if (!client) client = new Stripe(key!);
    return client;
}

export type PaymentLinkInput = {
    orderNo: string;
    productName: string;
    quantity: number;
    currency: string; // ISO 4217，Stripe 要求小写
    amount: number; // 主单位金额（如 1234.56 美元）
    returnUrl?: string; // 付完回跳的订单页
};

export type PaymentLinkResult = { url: string; id: string } | null;

// 单价 = 总额 / 数量，避免 Stripe 单价与数量对不上；无法整除时按 1 件收全款
export async function createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult> {
    if (!stripeEnabled()) return null;
    const minor = Math.round(input.amount * 100);
    if (minor <= 0) return null;

    const qty = input.quantity > 0 ? input.quantity : 1;
    const unitAmount = minor % qty === 0 ? minor / qty : minor;
    const quantity = minor % qty === 0 ? qty : 1;
    const label = `${input.orderNo} · ${input.productName}${quantity > 1 ? ` × ${quantity}` : ''}`;

    try {
        const link = await stripe().paymentLinks.create({
            line_items: [
                {
                    quantity,
                    price_data: {
                        currency: input.currency.toLowerCase(),
                        unit_amount: unitAmount,
                        product_data: { name: label },
                    },
                },
            ],
            ...(input.returnUrl
                ? { after_completion: { type: 'redirect' as const, redirect: { url: input.returnUrl } } }
                : {}),
        });
        return { url: link.url, id: link.id };
    } catch (e) {
        console.error('[stripe] paymentLinks.create failed:', e instanceof Error ? e.message : e);
        return null;
    }
}
