import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import type { OrderStatus, Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { OrderRowForm } from '@/components/admin/OrderRowForm';
import { OrderReviewPanel, type ReviewOrder } from '@/components/admin/OrderReviewPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { ORDER_STATUS_ZH, shippingLines, type Shipping, type SpecLine } from '@/lib/orders';
import { stripeEnabled } from '@/lib/stripe';

// 后台订单：人工对接的主战场。顶部提供状态 tabs + 时间范围 + 搜索（URL 驱动的服务端筛选），
// 每单可展开看规格快照 + 素材 + 收货，销售在此核对工艺、改价、发付款链接、对账后标记已收款。
export const dynamic = 'force-dynamic';

// 状态 tabs 顺序按业务流程排列
const TAB_STATUSES = ['SUBMITTED', 'AWAITING_PAYMENT', 'PENDING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'EXPIRED'];
const RANGES = [
  { key: '30d', label: '近1个月', days: 30 },
  { key: '90d', label: '近3个月', days: 90 },
  { key: 'all', label: '全部时间', days: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];
const DEFAULT_RANGE: RangeKey = '90d';

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

type SearchParams = { status?: string; range?: RangeKey; q?: string };

export default function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <List params={params} searchParams={searchParams} />;
}

// 搜索词 → where 条件：日期(YYYY-MM-DD)精确到当天，否则按订单号/邮箱/联系人模糊匹配
function searchWhere(q: string): Prisma.OrderWhereInput | undefined {
  if (!q) return undefined;
  const m = q.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const end = new Date(start.getTime() + 86400000);
    return { createdAt: { gte: start, lt: end } };
  }
  return {
    OR: [
      { orderNo: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { contactName: { contains: q, mode: 'insensitive' } },
      // 列表邮箱显示为 order.email ?? user.email，搜索必须同样联查关联用户邮箱，
      // 否则登录用户下的订单（order.email 为 null）按邮箱搜会漏掉
      { user: { email: { contains: q, mode: 'insensitive' } } },
    ],
  };
}

function buildHref(cur: SearchParams, over: Partial<SearchParams>): string {
  const next = { ...cur, ...over };
  const p = new URLSearchParams();
  if (next.status) p.set('status', next.status);
  if (next.range && next.range !== DEFAULT_RANGE) p.set('range', next.range);
  if (next.q) p.set('q', next.q);
  const qs = p.toString();
  return `/admin/orders${qs ? `?${qs}` : ''}`;
}

async function List({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();

  const sp = await searchParams;
  const rawStatus = typeof sp.status === 'string' ? sp.status : '';
  const status = TAB_STATUSES.includes(rawStatus) ? rawStatus : undefined;
  const rawRange = typeof sp.range === 'string' ? sp.range : '';
  const range: RangeKey = (RANGES.some((r) => r.key === rawRange) ? rawRange : DEFAULT_RANGE) as RangeKey;
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const cur: SearchParams = { status, range, q };

  // 惰性过期：全局落库，不依赖当前筛选范围，保证任何视图下过期状态都正确
  await prisma.order
    .updateMany({
      where: { status: { in: ['SUBMITTED', 'AWAITING_PAYMENT', 'PENDING_PAYMENT'] }, expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    })
    .catch(() => { });

  // 全局待确认数（不受时间范围限制），避免销售因范围筛选漏掉老单
  const pendingGlobal = await prisma.order.count({ where: { status: 'SUBMITTED' } });

  const rangeDef = RANGES.find((r) => r.key === range)!;
  // 本页是 force-dynamic 的服务端组件，“现在”就是本次请求的时刻（lint 的 purity 规则不区分环境）
  // eslint-disable-next-line react-hooks/purity
  const rangeStart = rangeDef.days > 0 ? new Date(Date.now() - rangeDef.days * 86400000) : undefined;
  const sWhere = searchWhere(q);

  const baseParts: Prisma.OrderWhereInput[] = [];
  if (rangeStart) baseParts.push({ createdAt: { gte: rangeStart } });
  if (sWhere) baseParts.push(sWhere);
  const baseWhere: Prisma.OrderWhereInput = baseParts.length ? { AND: baseParts } : {};

  // tabs 计数：在当前时间范围 + 搜索下各状态的数量
  const groups = await prisma.order.groupBy({ by: ['status'], where: baseWhere, _count: true });
  const countMap: Record<string, number> = {};
  let totalInRange = 0;
  for (const g of groups) {
    countMap[g.status] = g._count;
    totalInRange += g._count;
  }

  const listWhere: Prisma.OrderWhereInput = status
    ? { AND: [...baseParts, { status: status as OrderStatus }] }
    : baseWhere;

  const orders = await prisma.order.findMany({
    where: listWhere,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: true, items: { include: { product: true } }, address: true },
  });

  // 设计链接批量查作品类型（后台「查看设计」链接需要 /design/[productType] 路径）
  const designIds = [...new Set(orders.map((o) => o.designId).filter((x): x is string => !!x))];
  const designRows = designIds.length
    ? await prisma.userDesign.findMany({ where: { id: { in: designIds } }, select: { id: true, productType: true } })
    : [];
  const designMap = new Map(designRows.map((d) => [d.id, d.productType ?? 'label']));

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
        status: o.status as string,
        currency: o.currency,
        total: Number(o.total),
        quotedTotal: o.quotedTotal != null ? Number(o.quotedTotal) : Number(o.total),
        shippingFee: Number(o.shippingFee),
        adjustReason: o.adjustReason,
        paymentMethod: o.paymentMethod,
        payUrl: o.payUrl,
        proofFileName: o.proofFileName,
        artworkId: o.artworkId,
        designId: o.designId,
        designType: o.designId ? designMap.get(o.designId) ?? null : null,
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

  return (
    <ListView
      rows={rows}
      pendingGlobal={pendingGlobal}
      stripeReady={stripeEnabled()}
      cur={cur}
      countMap={countMap}
      totalInRange={totalInRange}
    />
  );
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

function ListView({
  rows,
  pendingGlobal,
  stripeReady,
  cur,
  countMap,
  totalInRange,
}: {
  rows: Row[];
  pendingGlobal: number;
  stripeReady: boolean;
  cur: SearchParams;
  countMap: Record<string, number>;
  totalInRange: number;
}) {
  const t = useTranslations('Admin');
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">{t('orders')}</h1>
        {pendingGlobal > 0 && (
          <Link
            href={buildHref(cur, { status: 'SUBMITTED', range: 'all' })}
            className="rounded-lg bg-[#ffec5a] px-3 py-1.5 text-sm font-bold text-neutral-900 hover:brightness-95"
          >
            {pendingGlobal} 单待确认
          </Link>
        )}
      </div>

      {/* 状态 tabs：从左到右排开，带各自计数 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <TabLink href={buildHref(cur, { status: undefined })} active={!cur.status} label="全部" count={totalInRange} />
        {TAB_STATUSES.map((s) => (
          <TabLink key={s} href={buildHref(cur, { status: s })} active={cur.status === s} label={ORDER_STATUS_ZH[s] ?? s} count={countMap[s] ?? 0} />
        ))}
      </div>

      {/* 时间范围 + 搜索 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={buildHref(cur, { range: r.key })}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${cur.range === r.key ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900'}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="status" value={cur.status ?? ''} />
          <input type="hidden" name="range" value={cur.range} />
          <input
            name="q"
            defaultValue={cur.q}
            placeholder="搜索订单号 / 邮箱 / 日期 YYYY-MM-DD"
            className="w-64 rounded-md border border-neutral-300 px-2.5 py-1 text-sm outline-none focus:border-neutral-900"
          />
          <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1 text-sm font-semibold text-white hover:bg-neutral-700">
            搜索
          </button>
          {cur.q && (
            <Link href={buildHref(cur, { q: undefined })} className="text-xs text-neutral-500 underline hover:text-neutral-900">
              清除
            </Link>
          )}
        </form>
      </div>

      {!stripeReady && (
        <p className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          未配置 STRIPE_SECRET_KEY，付款链接将降级为「站内订单页 + 银行转账」。
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState label={cur.q || cur.status ? '没有符合筛选条件的订单' : t('noOrders')} />
      ) : (
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
                    {r.order.artworkId && (
                      <a
                        href={`/api/admin/file?order=${r.order.id}&kind=artwork`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-neutral-900 underline"
                      >
                        下载素材
                      </a>
                    )}
                    {r.order.designId && (
                      <a
                        href={`/design/${r.order.designType ?? 'label'}?design=${r.order.designId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-xs font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2"
                      >
                        查看设计稿
                      </a>
                    )}
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
      )}
    </div>
  );
}

function TabLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${active ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900'}`}
    >
      {label}
      <span className={`ml-1 ${active ? 'text-neutral-300' : 'text-neutral-400'}`}>{count}</span>
    </Link>
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
