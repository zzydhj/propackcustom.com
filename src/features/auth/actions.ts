'use server';

import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { signIn, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from '@/navigation';

export async function signInWithGoogle() {
  await signIn('google', { redirectTo: '/account' });
}

export async function signInWithApple() {
  await signIn('apple', { redirectTo: '/account' });
}

export type EmailState = { ok: boolean; error?: 'email' | 'send'; email?: string };

// 邮箱 Magic Link：需配置 RESEND_API_KEY 后生效
export async function signInWithEmail(_prev: EmailState | null, formData: FormData): Promise<EmailState> {
  const email = (formData.get('email') as string)?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'email' };
  }
  try {
    await signIn('resend', { email, redirectTo: '/account' });
  } catch {
    // signIn 成功时会抛 redirect，这里捕获其它发送错误
    return { ok: false, error: 'send', email };
  }
  return { ok: true, email };
}

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}

// 邮箱+密码登录（开发默认可用；生产需 ENABLE_DEV_LOGIN=true 才开启）。
// 直接创建数据库会话并写 cookie（与 OAuth 同机制），避开 Credentials 与 database 策略不兼容问题。
export type DevLoginState = { ok: boolean; error?: 'invalid' | 'notfound' | 'disabled' };
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 天，与 NextAuth 默认会话时长一致

export async function signInWithDev(_prev: DevLoginState | null, formData: FormData): Promise<DevLoginState> {
  const isProd = process.env.NODE_ENV === 'production';
  const enabled = !isProd || process.env.ENABLE_DEV_LOGIN === 'true';
  if (!enabled) return { ok: false, error: 'disabled' };

  // 生产必须显式设置强密码 DEV_PASSWORD；开发缺省 propack123
  const devPassword = process.env.DEV_PASSWORD ?? (isProd ? undefined : 'propack123');
  if (!devPassword) return { ok: false, error: 'disabled' };

  const email = ((formData.get('email') as string) || '').trim().toLowerCase();
  const password = (formData.get('password') as string) || '';
  const redirectTo = (formData.get('redirectTo') as string) || '/account';

  if (!email || password !== devPassword) return { ok: false, error: 'invalid' };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { ok: false, error: 'notfound' };

  // 创建一条数据库会话；cookie 名/secure 需与 Auth.js 在当前协议下读取的一致
  // HTTPS(生产) → __Secure-authjs.session-token + secure:true；HTTP(本地) → authjs.session-token
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  const store = await cookies();
  store.set(isProd ? '__Secure-authjs.session-token' : 'authjs.session-token', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: SESSION_MAX_AGE,
    expires,
  });

  redirect({ href: redirectTo, locale: await getLocale() });
  // redirect 会抛 NEXT_REDIRECT 中断；上行不可达，仅满足返回类型
  return { ok: true };
}
