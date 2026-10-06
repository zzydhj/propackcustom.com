import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { auth } from '@/lib/auth';
import { signOutAction } from '@/features/auth/actions';
import { LocaleSwitcher } from './LocaleSwitcher';

// 外层 async：读取会话（不能用 hook）
export async function Header() {
  const session = await auth();
  return <HeaderInner signedIn={!!session?.user} />;
}

// 内层 sync：使用 useTranslations hook
function HeaderInner({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('Nav');
  const brand = useTranslations('Brand');

  const links: { href: string; label: string }[] = [
    { href: '/', label: t('home') },
    { href: '/products', label: t('products') },
    { href: '/quote', label: t('quote') },
    { href: '/about', label: t('about') },
  ];

  return (
    <header className="sticky top-0 z-50 h-[70px] w-full border-b border-neutral-100 bg-white">
      <div className="mx-auto flex h-full max-w-[1266px] items-center gap-6 px-5 2xl:px-12">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-[#ffec5a] font-black text-neutral-900">
            P
          </span>
          <span className="text-lg font-extrabold tracking-tight text-neutral-900">
            {brand('name')}
          </span>
        </Link>

        {/* Primary nav */}
        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href as any}
              className="text-[15px] font-medium text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right tools */}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center rounded-full border border-neutral-200 px-3 md:flex">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-neutral-400" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              className="w-52 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-neutral-400"
              placeholder={t('searchPlaceholder')}
            />
          </div>

          <div className="hidden sm:block">
            <LocaleSwitcher />
          </div>

          {signedIn ? (
            <div className="flex items-center gap-2">
              <Link
                href="/account"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                {t('account')}
              </Link>
              <form action={signOutAction}>
                <button className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">
                  {t('signOut')}
                </button>
              </form>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                {t('login')}
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700"
              >
                {t('register')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
