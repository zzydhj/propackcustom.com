'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/guards';

const quoteSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['PENDING', 'QUOTED', 'ACCEPTED', 'EXPIRED']),
  quotedPrice: z.union([z.coerce.number().nonnegative(), z.literal('')]).optional(),
  currency: z.string().length(3).optional(),
});

export async function updateQuote(_prev: { ok: boolean; error?: string } | null, formData: FormData) {
  await requireAdmin();
  const parsed = quoteSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
    quotedPrice: formData.get('quotedPrice') || undefined,
    currency: formData.get('currency') || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;
  await prisma.quote.update({
    where: { id: d.id },
    data: {
      status: d.status,
      quotedPrice: d.quotedPrice === '' || d.quotedPrice === undefined ? null : d.quotedPrice,
      currency: d.currency ?? d.currency ?? 'USD',
    },
  });
  revalidatePath('/admin/quotes');
  return { ok: true };
}

const orderSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['PENDING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'COMPLETED', 'CANCELLED']),
  trackingNo: z.string().optional(),
  carrier: z.string().optional(),
});

export async function updateOrder(_prev: { ok: boolean; error?: string } | null, formData: FormData) {
  await requireAdmin();
  const parsed = orderSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
    trackingNo: (formData.get('trackingNo') as string) || undefined,
    carrier: (formData.get('carrier') as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;
  await prisma.order.update({
    where: { id: d.id },
    data: { status: d.status, trackingNo: d.trackingNo, carrier: d.carrier },
  });
  revalidatePath('/admin/orders');
  return { ok: true };
}

const productSchema = z.object({
  slug: z.string().min(2),
  name: z.string().min(1),
  basePrice: z.coerce.number().nonnegative(),
  currency: z.string().length(3),
});

export async function createProduct(_prev: { ok: boolean; error?: string } | null, formData: FormData) {
  await requireAdmin();
  const parsed = productSchema.safeParse({
    slug: formData.get('slug'),
    name: formData.get('name'),
    basePrice: formData.get('basePrice'),
    currency: formData.get('currency') || 'USD',
  });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;
  // 商品必须归属一个分类；无分类时提示先建分类
  const cat = await prisma.category.findFirst();
  if (!cat) return { ok: false, error: 'no-category' };
  await prisma.product.create({
    data: {
      slug: d.slug,
      name: { en: d.name },
      description: { en: '' },
      basePrice: d.basePrice,
      currency: d.currency,
      categoryId: cat.id,
    },
  });
  revalidatePath('/admin/products');
  return { ok: true };
}

export async function deleteProduct(formData: FormData) {
  await requireAdmin();
  const id = formData.get('id');
  if (typeof id === 'string') {
    await prisma.product.delete({ where: { id } }).catch(() => { });
  }
  revalidatePath('/admin/products');
}

// ── 分类（商品归属）管理 ────────────────────
const categorySchema = z.object({
  slug: z.string().min(2),
  name: z.string().min(1),
});

export async function createCategory(_prev: { ok: boolean; error?: string } | null, formData: FormData) {
  await requireAdmin();
  const parsed = categorySchema.safeParse({
    slug: formData.get('slug'),
    name: formData.get('name'),
  });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;
  const exists = await prisma.category.findUnique({ where: { slug: d.slug } });
  if (exists) return { ok: false, error: 'exists' };
  await prisma.category.create({ data: { slug: d.slug, name: { en: d.name } } });
  revalidatePath('/admin/categories');
  return { ok: true };
}

export async function deleteCategory(formData: FormData) {
  await requireAdmin();
  const id = formData.get('id');
  if (typeof id === 'string') {
    // 分类下若有商品则禁止删除，避免外键报错
    const count = await prisma.product.count({ where: { categoryId: id } });
    if (count === 0) await prisma.category.delete({ where: { id } }).catch(() => { });
  }
  revalidatePath('/admin/categories');
}

// ── 商品编辑（含多语言名称/描述/分类/图片/上架状态）──
const productUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  basePrice: z.coerce.number().nonnegative(),
  currency: z.string().length(3),
  categoryId: z.string().min(1),
  active: z.coerce.boolean(),
});

export async function updateProduct(_prev: { ok: boolean; error?: string } | null, formData: FormData) {
  await requireAdmin();
  const parsed = productUpdateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    description: (formData.get('description') as string) || '',
    basePrice: formData.get('basePrice'),
    currency: formData.get('currency') || 'USD',
    categoryId: formData.get('categoryId'),
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
  });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;
  const images = ((formData.get('images') as string) || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const current = await prisma.product.findUnique({ where: { id: d.id } });
  await prisma.product.update({
    where: { id: d.id },
    data: {
      name: { ...(current?.name as object | undefined), en: d.name },
      description: { ...(current?.description as object | undefined), en: d.description ?? '' },
      basePrice: d.basePrice,
      currency: d.currency,
      categoryId: d.categoryId,
      active: d.active,
      images,
    },
  });
  revalidatePath('/admin/products');
  return { ok: true };
}

// ── 规格 / 字段（产品有哪些字段 + 选项加价）──
const specSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  options: z.array(z.object({ value: z.string().min(1), adder: z.coerce.number() })).default([]),
});

export async function upsertSpec(_prev: { ok: boolean; error?: string } | null, formData: FormData) {
  await requireAdmin();
  const id = (formData.get('specId') as string) || undefined;
  const name = (formData.get('name') as string) || '';
  // options 文本：每行 "选项名 | 加价"，加价缺省为 0
  const options = ((formData.get('options') as string) || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, adder] = line.split('|');
      return { value: (value || '').trim(), adder: Number((adder || '0').trim()) || 0 };
    });
  const parsed = specSchema.safeParse({ productId: formData.get('productId'), name, options });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;
  const data = { productId: d.productId, name: { en: d.name }, options: d.options };
  if (id) await prisma.spec.update({ where: { id }, data });
  else await prisma.spec.create({ data });
  revalidatePath('/admin/products');
  return { ok: true };
}

export async function deleteSpec(formData: FormData) {
  await requireAdmin();
  const id = formData.get('id');
  if (typeof id === 'string') await prisma.spec.delete({ where: { id } }).catch(() => { });
  revalidatePath('/admin/products');
}

// ── 钱包 / 预充值信用调整 ───────────────────
const balanceSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['TOPUP', 'CHARGE', 'REFUND', 'ADJUSTMENT']),
  amount: z.coerce.number(),
  currency: z.string().length(3).default('USD'),
  note: z.string().max(200).optional(),
});

export async function adjustBalance(_prev: { ok: boolean; error?: string } | null, formData: FormData) {
  await requireAdmin();
  const parsed = balanceSchema.safeParse({
    userId: formData.get('userId'),
    type: formData.get('type'),
    amount: formData.get('amount'),
    currency: (formData.get('currency') as string) || 'USD',
    note: (formData.get('note') as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;
  if (d.amount === 0) return { ok: false, error: 'invalid' };

  // 按类型换算有符号金额：充值/退款为正，扣款为负，调整取输入原符号
  const delta =
    d.type === 'TOPUP' || d.type === 'REFUND'
      ? Math.abs(d.amount)
      : d.type === 'CHARGE'
        ? -Math.abs(d.amount)
        : d.amount;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: d.userId } });
    const balanceAfter = Number(user.balance) + delta;
    await tx.walletTransaction.create({
      data: {
        userId: d.userId,
        type: d.type,
        amount: delta,
        balanceAfter,
        currency: d.currency,
        note: d.note,
      },
    });
    await tx.user.update({ where: { id: d.userId }, data: { balance: balanceAfter } });
  });

  revalidatePath('/admin/wallet');
  revalidatePath('/account/wallet');
  return { ok: true };
}

// ── 产品配置器：定价模式 / 尺寸单价 / 字段 / 数量阶梯 ──
const productConfigSchema = z.object({
  id: z.string().min(1),
  pricingMode: z.enum(['FIXED', 'AREA']),
  basePrice: z.coerce.number().nonnegative(),
  pricePerSqm: z.union([z.coerce.number().nonnegative(), z.literal('')]).optional(),
  attributesJson: z.string(),
  tiersJson: z.string(),
});

export async function saveProductConfig(_prev: { ok: boolean; error?: string } | null, formData: FormData) {
  await requireAdmin();
  const parsed = productConfigSchema.safeParse({
    id: formData.get('id'),
    pricingMode: formData.get('pricingMode'),
    basePrice: formData.get('basePrice'),
    pricePerSqm: (formData.get('pricePerSqm') as string) || '',
    attributesJson: (formData.get('attributes') as string) || '[]',
    tiersJson: (formData.get('quantityTiers') as string) || '[]',
  });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;
  let attributes: unknown;
  let quantityTiers: unknown;
  try {
    attributes = JSON.parse(d.attributesJson);
    quantityTiers = JSON.parse(d.tiersJson);
  } catch {
    return { ok: false, error: 'invalid' };
  }
  if (!Array.isArray(attributes) || !Array.isArray(quantityTiers)) return { ok: false, error: 'invalid' };

  await prisma.product.update({
    where: { id: d.id },
    data: {
      pricingMode: d.pricingMode,
      basePrice: d.basePrice,
      pricePerSqm: d.pricePerSqm === '' ? null : (d.pricePerSqm as number),
      attributes: attributes as never,
      quantityTiers: quantityTiers as never,
    },
  });
  revalidatePath('/admin/products');
  revalidatePath('/products');
  return { ok: true };
}
