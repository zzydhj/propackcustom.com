import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';

export default function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return <HomeContent params={params} />;
}

async function HomeContent({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Hero />;
}

function Hero() {
  const t = useTranslations('Home');
  const tNav = useTranslations('Nav');
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">{t('heroTitle')}</h1>
      <p className="max-w-2xl text-lg text-neutral-600">{t('heroSubtitle')}</p>
      <div className="flex gap-4">
        <Link
          href="/quote"
          className="rounded-md bg-neutral-900 px-6 py-3 font-medium text-white hover:bg-neutral-700"
        >
          {t('cta')}
        </Link>
        <Link
          href="/products"
          className="rounded-md border border-neutral-300 px-6 py-3 font-medium hover:bg-neutral-50"
        >
          {tNav('products')}
        </Link>
      </div>
    </main>
  );
}
