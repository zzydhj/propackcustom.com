import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { SiteChrome } from '@/components/site/SiteChrome';
import '../globals.css';

export const metadata: Metadata = {
  title: 'ProPack Custom — Custom Packaging & Printing, Worldwide',
  description: 'Custom boxes, labels, brochures. Factory-direct pricing, global shipping.',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  // 站点只开放英文，永远 ltr；将来往 routing.locales 加回 ar 这类 RTL 语言时再按 locale 判方向
  const dir = 'ltr';

  return (
    <html lang={locale} data-scroll-behavior="smooth" dir={dir} suppressHydrationWarning>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <SiteChrome header={<Header />} footer={<Footer />}>{children}</SiteChrome>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
