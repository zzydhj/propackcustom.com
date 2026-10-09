import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createProxy from 'next-intl/middleware';
import { LEGACY_LOCALES, routing } from './i18n/routing';

// Next.js 16 起 proxy.ts 取代 middleware.ts；next-intl 逻辑不变
const intl = createProxy(routing);

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 旧的多语言链接（/zh/design 等）301 到无前缀地址：站点现在只有英文，
  // 让历史分享出去的链接继续能用，同时把 SEO 权重并回唯一一套 URL。
  const first = pathname.split('/')[1];
  if (LEGACY_LOCALES.includes(first)) {
    // 去掉前缀后剩下的已以 / 开头（/zh/design → /design，/zh → /）。不能再拼一个 /，
    // 否则得到 //design，会被当成协议相对 URL 而跳到 host=design（实测踩过）。
    const rest = pathname.slice(first.length + 1);
    const target = new URL(rest === '' ? '/' : rest, req.url);
    target.search = search;
    return NextResponse.redirect(target, 301);
  }

  return intl(req);
}

export const config = {
  // 排除 API、Next 内部资源与静态文件，其余路径走 locale 协商
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
