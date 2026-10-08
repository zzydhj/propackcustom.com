import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import Resend from 'next-auth/providers/resend';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';
import { claimAnonymousRecords } from './claim';

// 全球优先：Google / Apple / 邮箱 Magic Link
// 微信 / QQ 为二期，需境内备案应用，见文末注释占位
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
  providers: [
    Google,
    Apple,
    Resend({
      from: process.env.EMAIL_FROM ?? 'no-reply@propackcustom.com',
    }),
    // ── 二期占位：国内登录 ──────────────────────────────
    // 微信 / QQ 需自定义 OAuth provider，且海外服务器直连受限，
    // 建议通过境内轻量鉴权中转服务或第三方聚合登录桥接。
    // WeChat, QQ,
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
        session.user.locale = user.locale;
      }
      return session;
    },
  },
  events: {
    // 登录成功后把该邮箱名下的匿名订单/询价归集到账号（Google/Apple/Magic Link 走这里）
    async signIn({ user }) {
      if (user?.id && user?.email) await claimAnonymousRecords(user.id, user.email);
    },
  },
});
