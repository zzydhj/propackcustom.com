import { auth } from '@/lib/auth';

// 匿名可访问接口的 IP 级限流（Upstash Redis）。
// 原来这段住在 /api/upload 里，现在设计器也要一个匿名写桶入口（/api/design-asset），
// 两个接口各抄一份必然对不上（键名/上限/失败语义），所以收在这里。
//
// 语义要保持清楚两件事：
//  · 未配置 Redis → 返回 false（不限流）。开发环境不该被自己的守卫挡住。
//  · Redis 调用报错 → 也返回 false。限流组件故障不能阻断业务（宁可放行，不可误杀客户下单）。

function client(): Promise<{ incr(key: string): Promise<number | null>; expire(key: string, s: number): Promise<unknown> } | null> {
    const url = process.env.UPSTASH_REDIS_URL;
    const token = process.env.UPSTASH_REDIS_TOKEN;
    if (!url || !token) return Promise.resolve(null);
    return import('@upstash/redis').then(({ Redis }) => new Redis({ url, token }));
}

/** @param bucket 计数桶名（不同接口分开计，免得设计器上传把报价单上传的额度吃掉） */
export async function rateLimited(ip: string, limitPerHour: number, bucket: string): Promise<boolean> {
    try {
        const redis = await client();
        if (!redis) return false;
        const key = `${bucket}:rl:${ip}`;
        const n = await redis.incr(key);
        if (n === 1) await redis.expire(key, 3600);
        return typeof n === 'number' && n > limitPerHour;
    } catch {
        return false;
    }
}

/**
 * 登录用户不限流：他们 accountable，而且设计器里换图是**编辑动作**（客户换 30 次 logo 是正常干活，
 * 不是刷接口）。匿名才按 IP 卡。
 * 返回 true 表示「这次放行」。
 */
export async function allowedFor(ip: string, limitPerHour: number, bucket: string): Promise<boolean> {
    const session = await auth().catch(() => null);
    if (session?.user?.id) return true;
    return !(await rateLimited(ip, limitPerHour, bucket));
}

export function clientIp(req: { headers: { get(name: string): string | null } }): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
