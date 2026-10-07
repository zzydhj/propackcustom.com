import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { OrderRowForm } from '@/components/admin/OrderRowForm';
import { OrderReviewPanel, type ReviewOrder } from '@/components/admin/OrderReviewPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { ORDER_STATUS_ZH, isExpired, shippingLines, type Shipping, type SpecLine } from '@/lib/orders';
import { stripeEnabled } from '@/lib/stripe';

// 后台订单：人工对接的主战场。每单可展开看规格快照 + 素材 + 收货，
// 销售在此核对工艺、改价、发付款链接、对账后标记已收款。
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

type Row = {
  order: ReviewOrder;
  productName: string;
  quantity: number;
  unitPrice: number;
  lines: SpecLine[];
  surcharges: { name: string; amount: number }[];
  artwork: string;
  note: string;
  fromQuote: boolean;
  address: SpecLine[];
  createdAt: string;
  anonymous: boolean;
};

export default function AdminOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  return <List params={params} />;
}

async function List({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: true, items: { include: { product: true } }, address: true },
  });

  // 惰性过期：超过锁价期仍未确认的订单在这里落库，无需 cron
  const stale = orders.filter((o) => isExpired(o.status, o.expiresAt));
  if (stale.length > 0) {
    await prisma.order
      .updateMany({ where: { id: { in: stale.map((o) => o.id) } }, data: { status: 'EXPIRED' } })
      .catch(() => { });
  }
  const staleIds = new Set(stale.map((o) => o.id));

  const rows: Row[] = orders.map((o) => {
    const item = o.items[0];
    const specs = (item?.specs ?? {}) as ItemSpecs;
    const address = o.address
      ? shippingLines({
        recipient: o.address.recipient,
        phone: o.address.phone,
        country: o.address.country,
        province: o.address.province ?? undefined,
        city: o.address.city ?? undefined,
        line1: o.address.line1,
        line2: o.address.line2 ?? undefined,
        postalCode: o.address.postalCode,
      })
      : shippingLines((o.shipping as Shipping | null) ?? null);

    return {
      order: {
        id: o.id,
        orderNo: o.orderNo,
        viewToken: o.viewToken,
        status: staleIds.has(o.id) ? 'EXPIRED' : (o.status as string),
        currency: o.currency,
        total: Number(o.total),
        quotedTotal: o.quotedTotal != null ? Number(o.quotedTotal) : Number(o.total),
        shippingFee: Number(o.shippingFee),
        adjustReason: o.adjustReason,
        paymentMethod: o.paymentMethod,
        payUrl: o.payUrl,
        proofFileName: o.proofFileName,
        email: o.email ?? o.user?.email ?? null,
        expiresAt: o.expiresAt?.toISOString() ?? null,
        trackingNo: o.trackingNo ?? '',
        carrier: o.carrier ?? '',
      },
      productName: specs._product ?? (item?.product ? zh(item.product.name) : '—'),
      quantity: item?.quantity ?? 0,
      unitPrice: specs._unit ?? Number(item?.unitPrice ?? 0),
      lines: specs._lines ?? [],
      surcharges: (specs._surcharges ?? []).filter((s) => s.amount !== 0),
      artwork: specs._artwork ?? '',
      note: specs._note ?? '',
      fromQuote: Boolean(specs._fromQuote),
      address,
      createdAt: o.createdAt.toISOString(),
      anonymous: !o.userId,
    };
  });

  // 待确认的排最前，其余按时间倒序
  rows.sort((a, b) => rank(a.order.status) - rank(b.order.status) || b.createdAt.localeCompare(a.createdAt));

  return <ListView rows={rows} pending={rows.filter((r) => r.order.status === 'SUBMITTED').length} stripeReady={stripeEnabled()} />;
}

function rank(status: string): number {
  if (status === 'SUBMITTED') return 0;
  if (status === 'AWAITING_PAYMENT' || status === 'PENDING_PAYMENT') return 1;
  if (status === 'PAID' || status === 'IN_PRODUCTION') return 2;
  if (status === 'SHIPPED') return 3;
  if (status === 'COMPLETED') return 4;
  return 5; // CANCELLED / EXPIRED
}

function zh(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.zh ?? o.en ?? Object.values(o)[0] ?? '');
  }
  return '';
}

function ListView({ rows, pending, stripeReady }: { rows: Row[]; pending: number; stripeReady: boolean }) {
  const t = useTranslations('Admin');
  if (rows.length === 0) return <EmptyState label={t('noOrders')} />;
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">{t('orders')}</h1>
        {pending > 0 && (
          <span className="rounded-lg bg-[#ffec5a] px-3 py-1.5 text-sm font-bold text-neutral-900">
            {pending} 单待确认
          </span>
        )}
      </div>
      {!stripeReady && (
        <p className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          未配置 STRIPE_SECRET_KEY，付款链接将降级为「站内订单页 + 银行转账」。
        </p>
      )}
      <div className="space-y-3">
        {rows.map((r) => (
          <details key={r.order.id} open={r.order.status === 'SUBMITTED'} className="group rounded-2xl border border-neutral-200 bg-white">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <p className="font-mono text-sm text-neutral-500">
                  #{r.order.orderNo}
                  {r.anonymous && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-600">匿名</span>}
                  {r.fromQuote && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-600">来自询价</span>}
                </p>
                <p className="mt-0.5 truncate font-semibold text-neutral-900">
                  {r.productName}
                  {r.quantity > 0 && <span className="ml-2 text-sm font-normal text-neutral-500">× {r.quantity.toLocaleString()}</span>}
                </p>
                <p className="mt-0.5 truncate text-sm text-neutral-600">{r.order.email ?? '—'}</p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {r.createdAt.slice(0, 10)}
                  <span className="ml-2">{ORDER_STATUS_ZH[r.order.status] ?? r.order.status}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-bold text-neutral-900">
                    {r.order.currency} {r.order.total.toFixed(2)}
                  </p>
                  {Math.abs(r.order.total - r.order.quotedTotal) > 0.005 && (
                    <p className="text-xs text-neutral-400 line-through">
                      {r.order.currency} {r.order.quotedTotal.toFixed(2)}
                    </p>
                  )}
                </div>
                <span className="text-neutral-300 transition group-open:rotate-90">›</span>
              </div>
            </summary>

            <div className="space-y-5 border-t border-neutral-100 p-5">
              {/* 规格快照 */}
              {r.lines.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">规格</p>
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <KV k="单价" v={`${r.order.currency} ${r.unitPrice.toFixed(2)}`} />
                    <KV k="数量" v={r.quantity.toLocaleString()} />
                    {r.lines.map((l) => (
                      <KV key={l.label} k={l.label} v={l.value} />
                    ))}
                    {r.surcharges.map((s) => (
                      <KV key={s.name} k={s.name} v={`+${r.order.currency} ${s.amount.toFixed(2)}`} />
                    ))}
                  </dl>
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                {r.address.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">收货信息</p>
                    <dl className="space-y-1 text-sm">
                      {r.address.map((l) => (
                        <KV key={l.label} k={l.label} v={l.value} />
                      ))}
                    </dl>
                  </div>
                )}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">素材与备注</p>
                  <p className="text-sm text-neutral-700">{r.artwork || '未上传素材'}</p>
                  {r.note && <p className="mt-1 text-sm text-neutral-600">{r.note}</p>}
                </div>
              </div>

              {r.order.adjustReason && (
                <p className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
                  <strong className="text-neutral-900">调价原因：</strong>
                  {r.order.adjustReason}
                </p>
              )}

              <OrderReviewPanel order={r.order} stripeReady={stripeReady} />

              <div className="border-t border-neutral-100 pt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">状态与物流</p>
                <OrderRowForm
                  id={r.order.id}
                  status={r.order.status}
                  trackingNo={r.order.trackingNo}
                  carrier={r.order.carrier}
                />
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-neutral-500">{k}</dt>
      <dd className="min-w-0 break-words font-medium text-neutral-800">{v}</dd>
    </div>
  );
}
