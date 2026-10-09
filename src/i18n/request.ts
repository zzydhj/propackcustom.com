import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

// 递归深合并：以英文为底，当前语言覆盖已有键，缺失键自动回退英文
type JsonMap = Record<string, unknown>;

function deepMerge<T extends JsonMap>(base: T, override: JsonMap): T {
  const out: JsonMap = { ...base };
  for (const key of Object.keys(override ?? {})) {
    const b = out[key];
    const o = override[key];
    out[key] =
      b && o && typeof b === 'object' && typeof o === 'object' && !Array.isArray(b)
        ? deepMerge(b as JsonMap, o as JsonMap)
        : o;
  }
  return out as T;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const localeMessages = (await import(`../../messages/${locale}.json`)).default;
  const messages =
    locale === 'en' ? localeMessages : deepMerge((await import('../../messages/en.json')).default, localeMessages);

  return { locale, messages };
});
