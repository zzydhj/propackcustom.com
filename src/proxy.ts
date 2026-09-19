import createProxy from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16 起 proxy.ts 取代 middleware.ts；next-intl 逻辑不变
export default createProxy(routing);

export const config = {
  // 排除 API、Next 内部资源与静态文件，其余路径走 locale 协商
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
