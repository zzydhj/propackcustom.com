import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createProxy from 'next-intl/middleware';
import { LEGACY_LOCALES, routing } from './i18n/routing';

// Next.js 16 起 proxy.ts 取代 middleware.ts；next-intl 逻辑不变
const intl = createProxy(routing);

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 旧前缀链接（/zh/design 等）301 到无前缀地址：站点现在只有英文，
  // 让历史分享出去的链接继续能用，同时把 SEO 权重并回唯一一套 URL。
  const first = pathname.split('/')[1];
  if (LEGACY_LOCALES.includes(first)) {
    // 去掉前缀后剩下的已以 / 开头（/zh/design → /design，/zh → /）。不能再拼一个 /，
    // 否则得到 //design，会被当成协议相对 URL 而跳到 host=design（实测踩过）。
    const rest = pathname.slice(first.length + 1);
    return NextResponse.redirect(withQuery(new URL(rest === '' ? '/' : rest, req.url), search), 301);
  }

  // 分类走路径：/design?type=label 与 /design/label 是同一份内容的两个地址（重复内容）。
  // 只保留路径版，旧的查询版 301 过去。
  if (pathname === '/design') {
    const sp = new URLSearchParams(search);
    const type = sp.get('type');
    if (type && /^[a-z0-9-]+$/i.test(type)) {
      sp.delete('type');
      const q = sp.toString();
      return NextResponse.redirect(new URL(`/design/${type}${q ? `?${q}` : ''}`, req.url), 301);
    }
  }

  return intl(req);
}

function withQuery(url: URL, search: string) {
  if (search) url.search = search;
  return url;
}

export const config = {
  // 排除 API、Next 内部资源与静态文件，其余路径走 locale 协商
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
