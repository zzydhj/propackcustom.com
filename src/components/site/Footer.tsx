import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';

export function Footer() {
  const t = useTranslations('Footer');
  const brand = useTranslations('Brand');
  const guarantees = t.raw('guarantees') as { title: string; desc: string }[];
  const columns = t.raw('columns') as { title: string; links: string[] }[];

  return (
    <footer className="bg-[#222] text-neutral-300">
      {/* Guarantee bar */}
      <div className="border-b border-white/10">
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-px px-5 py-2 2xl:px-12 md:grid-cols-4">
          {guarantees.map((g) => (
            <div key={g.title} className="flex items-center gap-3 px-4 py-6">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#ffec5a]/15 text-[#ffec5a]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{g.title}</p>
                <p className="text-xs text-neutral-400">{g.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Link columns + brand */}
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 2xl:px-12 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-[#ffec5a] font-black text-neutral-900">P</span>
            <span className="text-lg font-extrabold text-white">{brand('name')}</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-neutral-400">{brand('tagline')}</p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <p className="mb-4 text-sm font-semibold text-white">{col.title}</p>
            <ul className="space-y-2.5">
              {col.links.map((link) => (
                <li key={link}>
                  <Link href="/" className="text-sm text-neutral-400 transition-colors hover:text-[#ffec5a]">
                    {link}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-neutral-500 2xl:px-12 sm:flex-row">
          <p>© {new Date().getFullYear()} {brand('name')}. {t('rights')}</p>
          <div className="flex items-center gap-4">
            <span>{t('hotline')}: <span className="font-semibold text-neutral-300">+1 (800) 000-0000</span></span>
            <span className="hidden sm:inline">·</span>
            <span>{t('hours')}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
