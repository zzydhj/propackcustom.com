import type { Session } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { auth } from './auth';
import { redirect } from '@/navigation';

// 要求登录：无会话则跳转 /login（next-intl 的 redirect 自动带 locale）
export async function requireUser(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    redirect({ href: '/login', locale: await getLocale() });
  }
  return session as Session;
}

// 要求管理员：非 ADMIN 跳回首页
export async function requireAdmin(): Promise<Session> {
  const session = await requireUser();
  if (session.user?.role !== 'ADMIN') {
    redirect({ href: '/', locale: await getLocale() });
  }
  return session;
}
