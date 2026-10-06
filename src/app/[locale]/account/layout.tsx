import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { requireUser } from '@/lib/guards';

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();
  return (
    <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-10 2xl:px-12 md:grid-cols-[220px_minmax(0,1fr)]">
      <AccountSidebar email={session.user.email ?? ''} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function AccountSidebar({ email }: { email: string }) {
  const t = useTranslations('Account');
  const items = [
    { href: '/account', label: t('overview') },
    { href: '/account/quotes', label: t('quotes') },
    { href: '/account/orders', label: t('orders') },
    { href: '/account/wallet', label: t('wallet') },
    { href: '/account/addresses', label: t('addresses') },
  ];
  return (
    <aside className="h-fit rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="truncate px-2 pb-3 text-sm text-neutral-500">{email}</p>
      <nav className="flex flex-col gap-1">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href as any}
            className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            {i.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
