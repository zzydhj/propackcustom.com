import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/guards';
import { prisma } from '@/lib/prisma';

export default function AdminDashboard({ params }: { params: Promise<{ locale: string }> }) {
  return <Dash params={params} />;
}

async function Dash({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const [quotes, pendingQuotes, orders, products] = await Promise.all([
    prisma.quote.count(),
    prisma.quote.count({ where: { status: 'PENDING' } }),
    prisma.order.count(),
    prisma.product.count(),
  ]);
  return <DashView stats={[
    { key: 'quotes', value: quotes },
    { key: 'pendingQuotes', value: pendingQuotes },
    { key: 'orders', value: orders },
    { key: 'products', value: products },
  ]} />;
}

function DashView({ stats }: { stats: { key: string; value: number }[] }) {
  const t = useTranslations('Admin');
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t('dashboard')}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="rounded-2xl border border-neutral-200 bg-white p-6">
            <p className="text-sm text-neutral-500">{t(s.key)}</p>
            <p className="mt-2 text-3xl font-black text-neutral-900">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
