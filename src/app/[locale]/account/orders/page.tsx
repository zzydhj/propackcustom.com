import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
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
      orders={orders.map((o) => ({ id: o.id, orderNo: o.orderNo, status: o.status as string, total: Number(o.total), currency: o.currency, items: o.items.length, createdAt: o.createdAt.toISOString() }))}
    />
  );
}

function OrdersView({ orders, count, balance }: { count: number; balance: number; orders: { id: string; orderNo: string; status: string; total: number; currency: string; items: number; createdAt: string }[] }) {
  const t = useTranslations('Account');
  if (count === 0) return <EmptyState label={t('noOrders')} />;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t('orders')}</h1>
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.orderNo} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-5">
            <div>
              <p className="font-mono text-sm text-neutral-500">#{o.orderNo}</p>
              <p className="mt-1 text-sm text-neutral-600">{t('itemsCount', { count: o.items })} · {new Date(o.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-4">
              <OrderStatusBadge status={o.status} />
              <span className="font-bold text-neutral-900">{o.currency} {o.total.toFixed(2)}</span>
              {o.status === 'PENDING_PAYMENT' && (
                balance >= o.total ? (
                  <OrderPayButton orderId={o.id} />
                ) : (
                  <span className="text-xs text-neutral-400">Insufficient balance</span>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
