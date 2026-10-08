import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { QuoteForm } from '@/components/quote/QuoteForm';

export default function QuotePage({ params }: { params: Promise<{ locale: string }> }) {
  return <Quote params={params} />;
}

async function Quote({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <QuoteContent />;
}

function QuoteContent() {
  const t = useTranslations('QuoteForm');
  return (
    <main className="mx-auto max-w-5xl px-5 py-16 2xl:px-12">
      <div className="mb-10 text-center">
        <span className="inline-flex items-center rounded-full bg-[#ffec5a] px-3 py-1 text-xs font-bold uppercase tracking-wide text-neutral-900">
          {t('eyebrow')}
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">{t('title')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-neutral-600">{t('subtitle')}</p>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <QuoteForm />
      </div>
    </main>
  );
}
