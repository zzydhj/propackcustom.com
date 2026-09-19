import { defineRouting } from 'next-intl/routing';

// 全球市场：首发 en/es/de，其余增量开启
// ar 为 RTL 语言，布局层需配合 dir="rtl"
export const routing = defineRouting({
  locales: ['en', 'es', 'de', 'fr', 'zh', 'pt', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'as-needed', // 默认语言不加前缀，利于 SEO
});

export type Locale = (typeof routing.locales)[number];
