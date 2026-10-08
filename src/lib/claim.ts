import { prisma } from './prisma';

// 登录时把该邮箱名下的匿名订单 / 匿名询价归集到当前账号。
// 匿名提交时只记录了 email，客户之后用同一邮箱登录（Google/Apple/Magic Link/密码），
// 历史记录即自动出现在「我的订单 / 我的询价」里，无需提交时静默建号。
export async function claimAnonymousRecords(userId: string, email: string): Promise<void> {
    const e = email.trim().toLowerCase();
    if (!userId || !e) return;
    await prisma
        .$transaction([
            prisma.order.updateMany({
                where: { userId: { equals: null }, email: { equals: e, mode: 'insensitive' } },
                data: { userId },
            }),
            prisma.quote.updateMany({
                where: { userId: { equals: null }, email: { equals: e, mode: 'insensitive' } },
                data: { userId },
            }),
        ])
        .catch(() => {
            // 认领失败绝不阻断登录
        });
}
