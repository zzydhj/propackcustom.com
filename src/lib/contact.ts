// 客户可见的联系方式。与 payment-info.ts 里的 salesEmail() 刻意分开：
// 那个是「服务端往哪发/客户往哪汇款的地址」（可以是 no-reply），这个是要**挂在转化卡片上给客户点**的，
// 必须是公开且真人在收的信箱 —— 所以只能读 NEXT_PUBLIC_*（否则进不了客户端 bundle），且要过滤掉退信地址。

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BOUNCE_RE = /^(no-?reply|noreply|do-?not-?reply|donotreply|postmaster|abuse)@/i;

/**
 * 真人可回复的业务邮箱；没配、格式不对、或配的是 no-reply 这类地址 → 返回 undefined。
 * 调用方（转化卡片）拿到 undefined 应当**整个隐藏入口**，而不是挂一个发出去没人收的邮箱。
 */
export function customerContactEmail(): string | undefined {
    const raw = (process.env.NEXT_PUBLIC_SALES_EMAIL ?? '').trim();
    if (!EMAIL_RE.test(raw) || BOUNCE_RE.test(raw)) return undefined;
    return raw;
}
