'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/navigation';

const LOCALES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'zh', label: '中文' },
  { code: 'pt', label: 'Português' },
  { code: 'ar', label: 'العربية' },
];

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations('Common');
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-1 text-sm text-neutral-600">
      <span className="sr-only">{t('language')}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <select
        aria-label={t('language')}
        value={locale}
        onChange={(e) => router.replace(pathname, { locale: e.target.value })}
        className="cursor-pointer rounded-md border border-neutral-200 bg-white py-1 pl-1 pr-6 text-sm font-medium text-neutral-800 outline-none hover:border-neutral-400"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
