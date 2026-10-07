import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { QuoteRowForm } from '@/components/admin/QuoteRowForm';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdminQuotesPage({ params }: { params: Promise<{ locale: string }> }) {
  return <List params={params} />;
}

async function List({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const quotes = await prisma.quote.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  return <ListView count={quotes.length} rows={quotes.map((q) => ({ id: q.id, productName: q.productName, contactName: q.contactName, email: q.email, country: q.country, quantity: q.quantity, status: q.status as string, quotedPrice: q.quotedPrice ? String(q.quotedPrice) : '', currency: q.currency, orderId: q.orderId }))} />;
}

function ListView({ rows, count }: { count: number; rows: { id: string; productName: string | null; contactName: string | null; email: string | null; country: string | null; quantity: number; status: string; quotedPrice: string; currency: string; orderId: string | null }[] }) {
  const t = useTranslations('Admin');
  if (count === 0) return <EmptyState label={t('noQuotes')} />;
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-neutral-900">{t('quotes')}</h1>
      <p className="mb-6 text-sm text-neutral-500">填写报价并保存后，点「转为订单」即可进入人工确认与收款流程。</p>
      <div className="space-y-3">
        {rows.map((q) => (
          <div key={q.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900">{q.productName ?? '—'}</p>
                <p className="mt-1 text-sm text-neutral-500">
                  {q.contactName ? `${q.contactName} · ` : ''}{q.email ?? ''}{q.country ? ` · ${q.country}` : ''}
                </p>
                <p className="text-sm text-neutral-500">{t('qty')}: {q.quantity.toLocaleString()}</p>
              </div>
              <QuoteRowForm id={q.id} status={q.status} quotedPrice={q.quotedPrice} currency={q.currency} orderId={q.orderId} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
