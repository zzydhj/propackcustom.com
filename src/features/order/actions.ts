'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { mapProductConfig, computeConfigState, validateConfig, computeConfigPrice, round2, type Selections } from '@/lib/config-engine';
import { buildSpecLines, genOrderNo, priceLockExpiry, type Shipping } from '@/lib/orders';
import { notifyAdminNewOrder, orderUrl, sendOrderReceived, siteUrl } from '@/lib/email';

// 配送信息：登录用户落 Address 表（可在地址簿复用），匿名用户只存订单快照
const shippingSchema = z.object({
    recipient: z.string().min(1),
    phone: z.string().min(3),
    country: z.string().min(2),
    province: z.string().optional(),
    city: z.string().optional(),
    line1: z.string().min(1),
    line2: z.string().optional(),
    postalCode: z.string().min(1),
    company: z.string().optional(),
});

const checkoutSchema = z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
    // 匿名提交时邮箱必填（确认函与付款链接的唯一触达渠道）
    email: z.string().email().optional().or(z.literal('')),
});

export type CheckoutState = {
    ok: boolean;
    orderNo?: string;
    viewToken?: string;
    errors?: string[];
};

// 客户在配置器算价后提交订单 —— 无需付款，进入人工对接：
// SUBMITTED（锁价 72h）→ 销售核对工艺/运费并确认总价 → AWAITING_PAYMENT（发付款链接）→ PAID
export async function createProductOrder(_prev: CheckoutState | null, formData: FormData): Promise<CheckoutState> {
    const session = await auth().catch(() => null);
    const userId = session?.user?.id ?? null;

    const parsed = checkoutSchema.safeParse({
        productId: formData.get('productId'),
        quantity: formData.get('quantity'),
        email: (formData.get('email') as string) || '',
    });
    if (!parsed.success) return { ok: false, errors: ['Please complete the order details.'] };

    const shipParsed = shippingSchema.safeParse({
        recipient: formData.get('recipient'),
        phone: formData.get('phone'),
        country: formData.get('country'),
        province: (formData.get('province') as string) || undefined,
        city: (formData.get('city') as string) || undefined,
        line1: formData.get('line1'),
        line2: (formData.get('line2') as string) || undefined,
        postalCode: formData.get('postalCode'),
        company: (formData.get('company') as string) || undefined,
    });
    if (!shipParsed.success) return { ok: false, errors: ['Please complete the shipping details.'] };

    // 未登录必须留邮箱，否则销售无法回联（这是免登录下单的唯一硬性要求）
    const email = parsed.data.email?.trim().toLowerCase() || session?.user?.email || '';
    if (!userId && !email) return { ok: false, errors: ['Please add an email so we can confirm your price.'] };

    let selections: Selections = {};
    try {
        selections = JSON.parse((formData.get('selections') as string) || '{}');
    } catch {
        return { ok: false, errors: ['Invalid configuration.'] };
    }

    const product = await prisma.product.findUnique({
        where: { id: parsed.data.productId },
        include: {
            attributeGroups: { orderBy: { sort: 'asc' }, include: { options: { orderBy: { sort: 'asc' } } } },
            dependencyRules: true,
            priceRules: true,
        },
    });
    if (!product || !product.active) return { ok: false, errors: ['Product unavailable.'] };

    const config = mapProductConfig({
        pricingMode: product.pricingMode,
        basePrice: product.basePrice,
        pricePerSqm: product.pricePerSqm,
        currency: product.currency,
        quantityTiers: product.quantityTiers,
        attributeGroups: product.attributeGroups,
        dependencyRules: product.dependencyRules,
        priceRules: product.priceRules,
    });

    // 服务端用规则引擎重算：裁剪非法/失效选项 + 应用强制勾选（绝不信任前端提交）
    const st = computeConfigState(config, selections, []);
    selections = st.selections;

    const fieldErrors = validateConfig(config, selections);
    if (fieldErrors.length) return { ok: false, errors: fieldErrors };

    const price = computeConfigPrice(config, selections, parsed.data.quantity, st);
    const total = round2(price.total);
    if (total <= 0) return { ok: false, errors: ['Price must be greater than zero.'] };

    // 素材与凭证：文件本身已由浏览器直传 R2，这里只登记引用（R2 未配置时退化为文件名）
    const artworkId = ((formData.get('artworkId') as string) || '').trim() || null;
    const artworkName = ((formData.get('artwork') as string) || '').trim();
    const orderNote = ((formData.get('note') as string) || '').trim();
    const productName = en(product.name) || product.slug;

    // 规格快照：存成人可读的行，后台与订单页直接渲染，产品配置后续改动不影响历史订单
    const specs = {
        ...(selections as Record<string, unknown>),
        _product: productName,
        _lines: buildSpecLines(config, st),
        _unit: round2(price.finalUnit),
        _discountPct: price.discountPct,
        _surcharges: price.surcharges,
        ...(artworkName ? { _artwork: artworkName } : {}),
        ...(orderNote ? { _note: orderNote } : {}),
    };

    const d = shipParsed.data;
    const expiresAt = priceLockExpiry();

    const order = await prisma.$transaction(async (tx) => {
        // 登录用户额外落一条地址，便于地址簿复用；匿名用户不建 Address
        let addressId: string | null = null;
        if (userId) {
            const address = await tx.address.create({
                data: {
                    userId,
                    recipient: d.recipient,
                    phone: d.phone,
                    country: d.country,
                    province: d.province,
                    city: d.city,
                    line1: d.line1,
                    line2: d.line2,
                    postalCode: d.postalCode,
                },
            });
            addressId = address.id;
        }
        return tx.order.create({
            data: {
                orderNo: genOrderNo(),
                userId,
                contactName: d.recipient,
                email: email || null,
                status: 'SUBMITTED',
                currency: config.currency,
                subtotal: round2(price.goodsTotal),
                total,
                quotedTotal: total, // 留痕基准：销售调价后与 total 对比即为差异
                addressId,
                shipping: d satisfies Shipping,
                artworkId,
                expiresAt,
                items: {
                    create: {
                        productId: product.id,
                        quantity: parsed.data.quantity,
                        unitPrice: round2(price.finalUnit),
                        specs: specs as never,
                    },
                },
            },
        });
    });

    // 邮件失败不阻断下单：客户拿得到订单号，销售在后台也能看到
    const mail = {
        orderNo: order.orderNo,
        viewToken: order.viewToken,
        productName,
        quantity: parsed.data.quantity,
        currency: config.currency,
        quotedTotal: total,
        total,
        shippingFee: 0, // 运费由销售确认时才计入
        email: order.email,
        contactName: order.contactName,
        expiresAt: order.expiresAt,
    };
    await Promise.allSettled([
        sendOrderReceived(mail),
        notifyAdminNewOrder({ ...mail, adminUrl: `${siteUrl()}/admin/orders` }),
    ]);

    revalidatePath('/account/orders');
    revalidatePath('/admin/orders');
    return { ok: true, orderNo: order.orderNo, viewToken: order.viewToken };
}

// 客户在订单页上传 T/T 付款凭证（文件直传 R2，这里只登记引用）
export type ProofState = { ok: boolean; error?: string };

export async function attachPaymentProof(formData: FormData): Promise<ProofState> {
    const token = String(formData.get('viewToken') || '');
    const proofUrl = String(formData.get('proofUrl') || '').trim();
    const proofFileName = String(formData.get('proofFileName') || '').trim();
    const proofKey = String(formData.get('proofKey') || '').trim();
    if (!token || !proofFileName) return { ok: false, error: 'invalid' };

    const order = await prisma.order.findUnique({ where: { viewToken: token } });
    // 仅待付款状态可上传凭证
    if (!order || (order.status !== 'AWAITING_PAYMENT' && order.status !== 'PENDING_PAYMENT')) {
        return { ok: false, error: 'invalid-status' };
    }
    await prisma.order.update({
        where: { id: order.id },
        // proofKey 必存：私有桶下后台靠它按需预签名读取水单，否则销售无法对账
        data: { proofFileName, proofUrl: proofUrl || null, proofKey: proofKey || null },
    });
    revalidatePath(`/order/${token}`);
    return { ok: true };
}

// 用预充值余额支付订单（老客户走钱包，仍然保留）
export async function payOrderFromBalance(formData: FormData) {
    const session = await auth().catch(() => null);
    const userId = session?.user?.id;
    const orderId = formData.get('id');
    if (!userId || typeof orderId !== 'string') return;

    const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) return;
    // 余额可支付「已确认待付款」与旧的待扣款订单；未确认的 SUBMITTED 不允许直接扣款
    if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'PENDING_PAYMENT') return;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const amount = Number(order.total);
    if (Number(user.balance) < amount) return; // 余额不足，忽略

    const balanceAfter = round2(Number(user.balance) - amount);
    await prisma.$transaction(async (tx) => {
        await tx.walletTransaction.create({
            data: { userId, type: 'CHARGE', amount: -amount, balanceAfter, currency: order.currency, reference: order.id, note: `Order ${order.orderNo}` },
        });
        await tx.user.update({ where: { id: userId }, data: { balance: balanceAfter } });
        await tx.order.update({
            where: { id: order.id },
            data: { status: 'PAID', paidAt: new Date(), paymentMethod: 'wallet', payUrl: null },
        });
        await tx.payment.upsert({
            where: { orderId: order.id },
            create: { orderId: order.id, provider: 'wallet', intentId: `WALLET-${order.id}`, amount, currency: order.currency, status: 'succeeded' },
            update: { provider: 'wallet', amount, currency: order.currency, status: 'succeeded' },
        });
    });

    revalidatePath('/account/orders');
    revalidatePath('/account/wallet');
    revalidatePath(`/order/${order.viewToken}`);
}

function en(v: unknown): string {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return String(o.en ?? Object.values(o)[0] ?? '');
    }
    return '';
}

// 供订单页展示：viewToken → 可分享的链接
export { orderUrl };
