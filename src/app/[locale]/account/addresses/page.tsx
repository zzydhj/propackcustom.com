import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/guards';
import { prisma } from '@/lib/prisma';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AccountAddressesPage({ params }: { params: Promise<{ locale: string }> }) {
  return <Addresses params={params} />;
}

async function Addresses({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser();
  const list = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: { isDefault: 'desc' },
  });
  return <AddressesView count={list.length} items={list.map((a) => ({ id: a.id, recipient: a.recipient, country: a.country, province: a.province, city: a.city, line1: a.line1, postalCode: a.postalCode, phone: a.phone, isDefault: a.isDefault }))} />;
}

function AddressesView({ items, count }: { count: number; items: { id: string; recipient: string; country: string; province: string | null; city: string | null; line1: string; postalCode: string; phone: string; isDefault: boolean }[] }) {
  const t = useTranslations('Account');
  if (count === 0) return <EmptyState label={t('noAddresses')} />;
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t('addresses')}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((a) => (
          <div key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-neutral-900">{a.recipient}</p>
              {a.isDefault && <span className="rounded-full bg-[#ffec5a] px-2 py-0.5 text-xs font-semibold text-neutral-900">{t('default')}</span>}
            </div>
            <p className="mt-2 text-sm text-neutral-600">{a.line1}{a.line1 ? '' : ''}{a.city ? `, ${a.city}` : ''}{a.province ? `, ${a.province}` : ''}</p>
            <p className="text-sm text-neutral-600">{a.postalCode}, {a.country}</p>
            <p className="mt-2 text-sm text-neutral-500">{a.phone}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
