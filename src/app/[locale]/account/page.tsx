import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/guards';
import { prisma } from '@/lib/prisma';

export default function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  return <Overview params={params} />;
}

async function Overview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser();
  const userId = session.user.id;

  const [quotes, orders, user] = await Promise.all([
    prisma.quote.count({ where: { userId } }),
    prisma.order.count({ where: { userId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true, currency: true } }),
  ]);

  return <OverviewView quotes={quotes} orders={orders} balance={Number(user.balance)} currency={user.currency} name={session.user.name ?? ''} />;
}

function OverviewView({ quotes, orders, balance, currency, name }: { quotes: number; orders: number; balance: number; currency: string; name: string }) {
  const t = useTranslations('Account');
  const cards = [
    { label: t('quotes'), value: quotes },
    { label: t('orders'), value: orders },
    { label: t('balance'), value: `${currency} ${balance.toFixed(2)}` },
  ];
  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">
        {t('welcome')}
        {name ? `, ${name}` : ''}
      </h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-neutral-200 bg-white p-6">
            <p className="text-sm text-neutral-500">{c.label}</p>
            <p className="mt-2 text-3xl font-black text-neutral-900">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
