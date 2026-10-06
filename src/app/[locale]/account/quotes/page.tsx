import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuoteStatusBadge } from '@/components/ui/StatusBadges';

export default function AccountQuotesPage({ params }: { params: Promise<{ locale: string }> }) {
  return <Quotes params={params} />;
}

async function Quotes({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser();
  const quotes = await prisma.quote.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });
  return <QuotesView count={quotes.length} quotes={quotes.map((q) => ({ id: q.id, productName: q.productName, quantity: q.quantity, status: q.status, quotedPrice: q.quotedPrice ? Number(q.quotedPrice) : null, currency: q.currency, createdAt: q.createdAt.toISOString() }))} />;
}

function QuotesView({ quotes, count }: { count: number; quotes: { id: string; productName: string | null; quantity: number; status: string; quotedPrice: number | null; currency: string; createdAt: string }[] }) {
  const t = useTranslations('Account');
  if (count === 0) return <EmptyState label={t('noQuotes')} />;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t('quotes')}</h1>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t('colProduct')}</th>
              <th className="px-4 py-3 font-medium">{t('colQty')}</th>
              <th className="px-4 py-3 font-medium">{t('colStatus')}</th>
              <th className="px-4 py-3 font-medium">{t('colPrice')}</th>
              <th className="px-4 py-3 font-medium">{t('colDate')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {quotes.map((q) => (
              <tr key={q.id}>
                <td className="px-4 py-3 font-medium text-neutral-900">{q.productName ?? '—'}</td>
                <td className="px-4 py-3 text-neutral-600">{q.quantity.toLocaleString()}</td>
                <td className="px-4 py-3"><QuoteStatusBadge status={q.status} /></td>
                <td className="px-4 py-3 text-neutral-600">{q.quotedPrice != null ? `${q.currency} ${q.quotedPrice}` : '—'}</td>
                <td className="px-4 py-3 text-neutral-500">{new Date(q.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
