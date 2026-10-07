import type { ConfigState, CfgGroup, Dimension, ProductConfig } from './config-engine';
import { round2 } from './config-engine';

// ── 订单领域工具（服务端 / 客户端共用）─────────────────────
// 人工对接流程的核心约定：客户提交时锁价 72h，销售在此期限内确认或订单自动过期。

export const PRICE_LOCK_HOURS = Number(process.env.PRICE_LOCK_HOURS) || 72;

export function priceLockExpiry(from: Date = new Date()): Date {
    return new Date(from.getTime() + PRICE_LOCK_HOURS * 3600 * 1000);
}

export type Shipping = {
    recipient: string;
    phone: string;
    country: string;
    province?: string;
    city?: string;
    line1: string;
    line2?: string;
    postalCode: string;
};

export type SpecLine = { label: string; value: string };

// 把配置结果渲染成人可读的规格行，随订单快照存库：
// 后台与客户订单页都直接读快照，不必再回查产品配置（配置改了也不会篡改历史订单）
export function buildSpecLines(cfg: ProductConfig, st: ConfigState): SpecLine[] {
    const sel = st.selections;
    const lines: SpecLine[] = [];
    for (const g of cfg.groups) {
        if (st.groupState[g.id]?.hidden) continue;
        const value = formatGroupValue(g, sel[g.id]);
        if (!value) continue;
        lines.push({ label: g.name, value });
    }
    return lines;
}

function formatGroupValue(g: CfgGroup, v: unknown): string {
    if (v === undefined || v === null || v === '') return '';
    if (g.selectType === 'dimension') {
        const d = v as Dimension;
        if (!d?.width && !d?.height) return '';
        return `${d.width || 0} × ${d.height || 0}${g.unit ? ` ${g.unit}` : ''}`;
    }
    if (g.selectType === 'number') return String(v);
    if (g.selectType === 'text' || g.selectType === 'file') return String(v);
    // single / multi → 选项名（保留组内顺序）
    const ids = Array.isArray(v) ? (v as string[]) : [String(v)];
    const names = ids
        .map((id) => g.options.find((o) => o.id === id)?.name)
        .filter((n): n is string => !!n);
    return names.join(', ');
}

// 命中的附加费明细（刀版费 / 制版费…），用于后台核对与客户展示
export function surchargeLines(st: { surcharges?: { name: string; amount: number }[] } | null): SpecLine[] {
    return (st?.surcharges ?? [])
        .filter((s) => s.amount !== 0)
        .map((s) => ({ label: s.name, value: `+${s.amount.toFixed(2)}` }));
}

export function shippingLines(s: Shipping | null | undefined): SpecLine[] {
    if (!s) return [];
    const out: SpecLine[] = [];
    if (s.recipient) out.push({ label: 'Recipient', value: s.recipient });
    if (s.phone) out.push({ label: 'Phone', value: s.phone });
    const place = [s.line1, s.line2, s.city, s.province, s.postalCode, s.country].filter(Boolean).join(', ');
    if (place) out.push({ label: 'Address', value: place });
    return out;
}

// 状态文案（站点主语言为英文；后台另有中文标签）
export const ORDER_STATUS_LABEL: Record<string, string> = {
    SUBMITTED: 'Pending confirmation',
    AWAITING_PAYMENT: 'Awaiting payment',
    PENDING_PAYMENT: 'Pending payment',
    PAID: 'Paid',
    IN_PRODUCTION: 'In production',
    SHIPPED: 'Shipped',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Quote expired',
};

export const ORDER_STATUS_ZH: Record<string, string> = {
    SUBMITTED: '待确认',
    AWAITING_PAYMENT: '待付款',
    PENDING_PAYMENT: '待付款(余额)',
    PAID: '已付款',
    IN_PRODUCTION: '生产中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    EXPIRED: '已过期',
};

// 客户提交后进入 SUBMITTED；销售确认后进入 AWAITING_PAYMENT
export const OPEN_STATUSES = ['SUBMITTED', 'AWAITING_PAYMENT', 'PENDING_PAYMENT'] as const;

// 惰性过期：不引 cron，读到时若已超期且仍待确认则落库为 EXPIRED
export function isExpired(status: string, expiresAt: Date | null | undefined, now: Date = new Date()): boolean {
    return status === 'SUBMITTED' && !!expiresAt && expiresAt.getTime() < now.getTime();
}

// 人工调价额 = 最终总价 − 配置器报价 − 运费。
// 运费在价格明细里已经单列一行，绝不能再算进「调价」，
// 否则客户看到 55(报价) + 20(运费) + 20(调价) ≠ 75(总额) 会怀疑算错账。
export function adjustmentOf(total: number, quotedTotal: number, shippingFee: number): number {
    return round2(Number(total || 0) - Number(quotedTotal || 0) - Number(shippingFee || 0));
}

export function genOrderNo(): string {
    return `PP${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4).toString().padStart(4, '0')}`;
}

export const money = (v: number | string | null | undefined, currency = 'USD'): string =>
    `${currency} ${Number(v ?? 0).toFixed(2)}`;
