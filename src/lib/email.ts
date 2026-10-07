import { Resend } from 'resend';
import { adjustmentOf } from './orders';

// ── 邮件层 ────────────────────────────────────────────────
// 人工对接流程全靠邮件驱动：客户提交 → 确认函；销售改价 → 付款链接函；新单 → 内部提醒。
// 原则：邮件失败绝不阻断主流程（下单/改价照常成功），只记日志，由后台重发。

const FROM = process.env.EMAIL_FROM ?? 'ProPack Custom <no-reply@propackcustom.com>';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// 站点绝对地址：邮件里的链接必须是完整 URL。
// 兜底顺序很重要 —— 生产环境一旦误用 localhost，客户收到的链接会全部失效，
// 所以除了显式的 SITE_URL，还接受 Vercel 自动注入的域名，并在生产环境跳过 localhost。
export function siteUrl(): string {
    const prod = process.env.NODE_ENV === 'production';
    const candidates = [
        process.env.SITE_URL,
        process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '',
        process.env.NEXTAUTH_URL,
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
    ];
    for (const c of candidates) {
        if (!c) continue;
        if (prod && /^https?:\/\/(localhost|127\.0\.0\.1)/.test(c)) continue;
        return c.replace(/\/+$/, '');
    }
    return 'http://localhost:3000';
}

// 客户免登录可访问的订单页（viewToken 即凭证）
export function orderUrl(viewToken: string): string {
    return `${siteUrl()}/order/${viewToken}`;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
    if (!to) return false;
    if (!resend) {
        console.warn(`[email] RESEND_API_KEY not set — skipped "${subject}" to ${to}`);
        return false;
    }
    try {
        const { error } = await resend.emails.send({ from: FROM, to, subject, html });
        if (error) {
            console.error('[email] send failed:', error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.error('[email] send threw:', e instanceof Error ? e.message : e);
        return false;
    }
}

// ── 排版：与站点一致的极简卡片（#ffec5a 主色）──────────────
function shell(title: string, body: string, cta?: { label: string; href: string }): string {
    return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#171717">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden">
      <div style="background:#ffec5a;padding:16px 24px;font-weight:800;letter-spacing:-0.01em">ProPack Custom</div>
      <div style="padding:24px">
        <h1 style="margin:0 0 12px;font-size:20px;font-weight:800">${title}</h1>
        <div style="font-size:14px;line-height:1.7;color:#404040">${body}</div>
        ${cta ? `<a href="${cta.href}" style="display:inline-block;margin-top:20px;background:#171717;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:700">${cta.label}</a>` : ''}
      </div>
    </div>
    <p style="font-size:12px;color:#a3a3a3;margin:16px 4px 0">ProPack Custom — custom packaging &amp; printing, shipped worldwide.</p>
  </div></body></html>`;
}

function rows(items: [string, string][]): string {
    return `<table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px">
    ${items
            .map(
                ([k, v]) =>
                    `<tr><td style="padding:7px 0;color:#737373;border-bottom:1px solid #f5f5f4;width:42%">${k}</td><td style="padding:7px 0;border-bottom:1px solid #f5f5f4;text-align:right;font-weight:600">${v}</td></tr>`,
            )
            .join('')}
  </table>`;
}

const money = (v: number, c: string) => `${c} ${v.toFixed(2)}`;

export type OrderMailData = {
    orderNo: string;
    viewToken: string;
    productName: string;
    quantity: number;
    currency: string;
    quotedTotal: number;
    total: number;
    shippingFee?: number;
    email?: string | null;
    contactName?: string | null;
    expiresAt?: Date | null;
    adjustReason?: string | null;
    payUrl?: string | null;
    paymentMethod?: string | null;
};

// 1) 客户提交后：确认收到 + 明确「现在不用付款」+ 时效承诺
export async function sendOrderReceived(d: OrderMailData): Promise<boolean> {
    if (!d.viewToken) return false;
    const url = orderUrl(d.viewToken);
    const expires = d.expiresAt ? d.expiresAt.toISOString().slice(0, 10) : null;
    const body = `
    <p>Thanks${d.contactName ? `, ${escapeHtml(d.contactName)}` : ''} — we've received your order request. <strong>No payment is needed right now.</strong></p>
    ${rows([
        ['Order number', escapeHtml(d.orderNo)],
        ['Product', escapeHtml(d.productName)],
        ['Quantity', d.quantity.toLocaleString()],
        ['Indicative total', money(d.quotedTotal, d.currency)],
        ...(expires ? ([['Price valid until', escapeHtml(expires)]] as [string, string][]) : []),
    ])}
    <p style="margin-top:16px">A packaging specialist reviews feasibility, shipping and finishing costs, then confirms your final price — usually within one business day. You'll get the payment link by email once the price is confirmed.</p>
    <p>You can track this order any time (no sign-in required):<br><a href="${url}" style="color:#171717">${url}</a></p>`;
    return send(d.email ?? '', `Order ${d.orderNo} received — we'll confirm your price`, shell('Order received', body, { label: 'View my order', href: url }));
}

// 2) 销售确认价格后：发出付款链接 + 调价原因（透明化，降低砍价）
export async function sendOrderConfirmed(d: OrderMailData): Promise<boolean> {
    const to = d.payUrl || orderUrl(d.viewToken);
    const shippingFee = Number(d.shippingFee ?? 0);
    // 运费已单列一行，不能再算进「调价」，否则客户会算不平
    const adjustment = adjustmentOf(d.total, d.quotedTotal, shippingFee);
    const adjusted = Math.abs(adjustment) > 0.005;
    const body = `
    <p>Good news — your order <strong>${escapeHtml(d.orderNo)}</strong> is confirmed and ready for payment.</p>
    ${rows([
        ['Product', escapeHtml(d.productName)],
        ['Quantity', d.quantity.toLocaleString()],
        ['Configurator price', money(d.quotedTotal, d.currency)],
        ...(shippingFee > 0 ? ([['Shipping', money(shippingFee, d.currency)]] as [string, string][]) : []),
        ...(adjusted ? ([['Adjustment', `${adjustment >= 0 ? '+' : '\u2212'}${money(Math.abs(adjustment), d.currency)}`]] as [string, string][]) : []),
        ['Final total', `<strong>${money(d.total, d.currency)}</strong>`],
        ...(d.adjustReason ? ([['Price note', escapeHtml(d.adjustReason)]] as [string, string][]) : []),
        ...(d.paymentMethod === 'manual_tt' ? ([['Payment method', 'Bank transfer (T/T) — details on the order page']] as [string, string][]) : []),
    ])}
    ${(adjusted || shippingFee > 0) && d.adjustReason ? `<p style="margin-top:16px">We adjusted the total to cover the items listed above. Everything else matches the configuration you submitted.</p>` : ''}
    <p style="margin-top:16px">Production starts as soon as payment is confirmed. Standard lead time is 5–9 business days after artwork approval.</p>`;
    return send(d.email ?? '', `Order ${d.orderNo} confirmed — payment link inside`, shell('Price confirmed', body, { label: d.paymentMethod === 'manual_tt' ? 'View order & pay' : 'Pay now', href: to }));
}

// 3) 到账回执：客户付完（或销售人工对账确认）后告知可以开工
export async function sendPaymentReceived(d: OrderMailData): Promise<boolean> {
    const url = orderUrl(d.viewToken);
    const body = `
    <p>Payment received for order <strong>${escapeHtml(d.orderNo)}</strong> — thank you.</p>
    ${rows([
        ['Product', escapeHtml(d.productName)],
        ['Quantity', d.quantity.toLocaleString()],
        ['Amount paid', `<strong>${money(d.total, d.currency)}</strong>`],
        ['Next step', 'Artwork proofing, then production'],
    ])}
    <p style="margin-top:16px">Our team prepares a print-ready proof for your approval. Standard lead time is 5–9 business days after approval, and you'll get a tracking number as soon as it ships.</p>`;
    return send(d.email ?? '', `Payment received — order ${d.orderNo} is in production queue`, shell('Payment received', body, { label: 'View my order', href: url }));
}

// 4) 内部提醒：新订单待确认（24h 响应是这条流程的转化率开关）
export async function notifyAdminNewOrder(d: OrderMailData & { adminUrl?: string }): Promise<boolean> {
    const to = process.env.ADMIN_NOTIFY_EMAIL;
    if (!to) return false;
    const body = `
    <p>A new order needs review.</p>
    ${rows([
        ['Order number', escapeHtml(d.orderNo)],
        ['Product', escapeHtml(d.productName)],
        ['Quantity', d.quantity.toLocaleString()],
        ['Indicative total', money(d.quotedTotal, d.currency)],
        ['Contact', escapeHtml(d.contactName || '—')],
        ['Email', escapeHtml(d.email || '—')],
    ])}
    <p style="margin-top:16px">Check specs, artwork and shipping, then confirm the price and send the payment link.</p>`;
    return send(to, `[New order] ${d.orderNo} · ${d.productName} · ${d.quantity.toLocaleString()}`, shell('New order to review', body, d.adminUrl ? { label: 'Open in admin', href: d.adminUrl } : undefined));
}

function escapeHtml(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
