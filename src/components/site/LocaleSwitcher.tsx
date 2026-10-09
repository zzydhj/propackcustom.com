'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/navigation';
import { routing } from '@/i18n/routing';

// 选项直接由 routing.locales 推导（不再手写一份清单，避免与实际开放语言不一致）；名字用母语自称
const LABELS: Record<string, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  zh: '中文',
  pt: 'Português',
  ar: 'العربية',
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations('Common');
  const router = useRouter();
  const pathname = usePathname();

  // 单语言站点摆语言下拉是误导；将来往 routing.locales 里加回一种语言，它会自动出现
  if (routing.locales.length < 2) return null;

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
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LABELS[l] ?? l}
          </option>
        ))}
      </select>
    </label>
  );
}
