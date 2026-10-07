import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { requireUser } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { EmptyState } from '@/components/ui/EmptyState';
import { OrderStatusBadge } from '@/components/ui/StatusBadges';
import { OrderPayButton } from '@/components/account/OrderPayButton';

export default function AccountOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  return <Orders params={params} />;
}

async function Orders({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser();
  const [orders, user] = await Promise.all([
    prisma.order.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { balance: true } }),
  ]);
  const balance = Number(user.balance);
  return (
    <OrdersView
      count={orders.length}
      balance={balance}
      orders={orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        viewToken: o.viewToken,
        status: o.status as string,
        total: Number(o.total),
        currency: o.currency,
        items: o.items.length,
        createdAt: o.createdAt.toISOString(),
      }))}
    />
  );
}

// 可由余额直接支付的状态：已确认待付款，以及兼容旧数据的待扣款
const PAYABLE = ['AWAITING_PAYMENT', 'PENDING_PAYMENT'];

type Row = { id: string; orderNo: string; viewToken: string; status: string; total: number; currency: string; items: number; createdAt: string };

function OrdersView({ orders, count, balance }: { count: number; balance: number; orders: Row[] }) {
  const t = useTranslations('Account');
  if (count === 0) return <EmptyState label={t('noOrders')} />;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t('orders')}</h1>
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.orderNo} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="min-w-0">
              <p className="font-mono text-sm text-neutral-500">#{o.orderNo}</p>
              <p className="mt-1 text-sm text-neutral-600">{t('itemsCount', { count: o.items })} · {new Date(o.createdAt).toLocaleDateString()}</p>
              {/* 待确认阶段说明「现在不用付款」，避免客户误以为下单失败 */}
              {o.status === 'SUBMITTED' && (
                <p className="mt-1 text-xs text-neutral-500">
                  {t('orderSubmittedHint')}
                </p>
              )}
              <Link href={`/order/${o.viewToken}`} className="mt-1.5 inline-block text-xs font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2">
                {t('viewOrder')}
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <OrderStatusBadge status={o.status} />
              <span className="font-bold text-neutral-900">{o.currency} {o.total.toFixed(2)}</span>
              {PAYABLE.includes(o.status) && (
                balance >= o.total ? (
                  <OrderPayButton orderId={o.id} />
                ) : (
                  <span className="text-xs text-neutral-400">{t('insufficientBalance')}</span>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
