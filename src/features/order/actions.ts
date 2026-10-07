'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/guards';
import { mapProductConfig, computeConfigState, validateConfig, computeConfigPrice, round2, type Selections } from '@/lib/config-engine';

function genOrderNo(): string {
    return `PP${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4).toString().padStart(4, '0')}`;
}

const checkoutSchema = z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
    recipient: z.string().min(1),
    phone: z.string().min(3),
    country: z.string().min(2),
    province: z.string().optional(),
    city: z.string().optional(),
    line1: z.string().min(1),
    line2: z.string().optional(),
    postalCode: z.string().min(1),
});

export type CheckoutState = { ok: boolean; orderNo?: string; errors?: string[] };

// 客户在配置器算价后下单（生成 PENDING_PAYMENT 订单，后续用余额支付）
export async function createProductOrder(_prev: CheckoutState | null, formData: FormData): Promise<CheckoutState> {
    const session = await requireUser();
    const userId = session.user.id;

    const parsed = checkoutSchema.safeParse({
        productId: formData.get('productId'),
        quantity: formData.get('quantity'),
        recipient: formData.get('recipient'),
        phone: formData.get('phone'),
        country: formData.get('country'),
        province: (formData.get('province') as string) || undefined,
        city: (formData.get('city') as string) || undefined,
        line1: formData.get('line1'),
        line2: (formData.get('line2') as string) || undefined,
        postalCode: formData.get('postalCode'),
    });
    if (!parsed.success) return { ok: false, errors: ['Please complete the shipping details.'] };

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

    // 只记录文件名/备注（真实文件走 R2/S3 预签名上传，另议）
    const artwork = ((formData.get('artwork') as string) || '').trim();
    const orderNote = ((formData.get('note') as string) || '').trim();
    const specs = {
        ...(selections as Record<string, unknown>),
        ...(artwork ? { _artwork: artwork } : {}),
        ...(orderNote ? { _note: orderNote } : {}),
        ...(price.surcharges.length ? { _surcharges: price.surcharges } : {}),
    };

    const d = parsed.data;
    const order = await prisma.$transaction(async (tx) => {
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
        return tx.order.create({
            data: {
                orderNo: genOrderNo(),
                userId,
                status: 'PENDING_PAYMENT',
                currency: config.currency,
                subtotal: round2(price.goodsTotal),
                total,
                addressId: address.id,
                items: {
                    create: {
                        productId: product.id,
                        quantity: d.quantity,
                        unitPrice: round2(price.finalUnit),
                        specs: specs as never,
                    },
                },
            },
        });
    });

    revalidatePath('/account/orders');
    return { ok: true, orderNo: order.orderNo };
}

// 用预充值余额支付订单
export async function payOrderFromBalance(formData: FormData) {
    const session = await requireUser();
    const userId = session.user.id;
    const orderId = formData.get('id');
    if (typeof orderId !== 'string') return;

    const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order || order.status !== 'PENDING_PAYMENT') return;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const amount = Number(order.total);
    if (Number(user.balance) < amount) return; // 余额不足，忽略

    const balanceAfter = round2(Number(user.balance) - amount);
    await prisma.$transaction(async (tx) => {
        await tx.walletTransaction.create({
            data: { userId, type: 'CHARGE', amount: -amount, balanceAfter, currency: order.currency, reference: order.id, note: `Order ${order.orderNo}` },
        });
        await tx.user.update({ where: { id: userId }, data: { balance: balanceAfter } });
        await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
        await tx.payment.create({
            data: { orderId: order.id, provider: 'wallet', intentId: `WALLET-${order.id}`, amount, currency: order.currency, status: 'succeeded' },
        });
    });

    revalidatePath('/account/orders');
    revalidatePath('/account/wallet');
}
