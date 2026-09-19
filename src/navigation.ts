import { createNavigation } from 'next-intl/navigation';
import { routing } from './i18n/routing';

// 全站统一用这里导出的 Link / redirect，自动带 locale 前缀
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
