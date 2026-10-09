import { defineRouting } from 'next-intl/routing';

// 站点当前只做英文（2026-10-09 定）：locales 只留 en，URL 一律不带语言前缀。
// 其余 6 个语言包仍留在 messages/ 里没删——将来要开某个语言，把代码加回 locales 即可
// （request.ts 已做「按 key 回退英文」的深合并，所以补翻译是纯增量工作）。
export const LEGACY_LOCALES = ['es', 'de', 'fr', 'zh', 'pt', 'ar'] as string[];

export const routing = defineRouting({
  locales: ['en'],
  defaultLocale: 'en',
  localePrefix: 'as-needed', // 默认语言不加前缀
  // 关键：next-intl 默认会按 Accept-Language / NEXT_LOCALE cookie 把 /design 跳到 /zh/design。
  // 关掉后，不带前缀的路径永远服务英文，中文浏览器也看到英文且 URL 不变。
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
