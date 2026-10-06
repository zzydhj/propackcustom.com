import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { OrderRowForm } from '@/components/admin/OrderRowForm';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  return <List params={params} />;
}

async function List({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { user: true } });
  return <ListView count={orders.length} rows={orders.map((o) => ({ id: o.id, orderNo: o.orderNo, email: o.user.email, status: o.status as string, total: Number(o.total), currency: o.currency, trackingNo: o.trackingNo ?? '', carrier: o.carrier ?? '' }))} />;
}

function ListView({ rows, count }: { count: number; rows: { id: string; orderNo: string; email: string | null; status: string; total: number; currency: string; trackingNo: string; carrier: string }[] }) {
  const t = useTranslations('Admin');
  if (count === 0) return <EmptyState label={t('noOrders')} />;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t('orders')}</h1>
      <div className="space-y-3">
        {rows.map((o) => (
          <div key={o.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-sm text-neutral-500">#{o.orderNo}</p>
                <p className="text-sm text-neutral-700">{o.email ?? '—'}</p>
                <p className="mt-1 font-bold text-neutral-900">{o.currency} {o.total.toFixed(2)}</p>
              </div>
              <OrderRowForm id={o.id} status={o.status} trackingNo={o.trackingNo} carrier={o.carrier} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
