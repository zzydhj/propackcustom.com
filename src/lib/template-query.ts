import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';
import { slugify, slugWithSuffix } from './template-slug';

// 模板库查询层（服务端专用）。10 万级规模的三条硬约束都收在这里：
// 1) 永远分页，绝不 findMany 全表；2) 查询走 (active, productType, sort) 复合索引；
// 3) 深翻页有上限——offset 到几万行会退化成全表扫，宁可让用户收窄条件。

export const TEMPLATE_PAGE_SIZE = 24; // 前台每页
export const ADMIN_PAGE_SIZE = 25;    // 后台每页
export const MAX_OFFSET = 20_000;     // 超过就要收窄筛选条件，而不是继续翻

export type TemplateFilter = {
    q?: string;
    productType?: string;
    category?: string;
    activeOnly?: boolean;
    page?: number;
    take?: number;
};

export type TemplatePage<T> = {
    rows: T[];
    total: number;
    page: number;
    pages: number;
    /** 请求页超出深翻页上限：UI 要提示“请收窄条件”，而不是假装没有数据 */
    capped: boolean;
};

/**
 * 列表页只取展示字段：不拉 slots（导入器写的，列表用不到）。
 * sceneTemplate 必须拉：卡片的设计预览靠它在服务端编译成 SVG（无 R2 时的唯一预览来源）。
 * 单页只 24–25 行，且 sceneToSvg 对过大的场景（内嵌 dataURL 图）会主动放弃并回退刀版框。
 */
export const TEMPLATE_LIST_SELECT = {
    id: true,
    slug: true,
    name: true,
    productType: true,
    category: true,
    widthMm: true,
    heightMm: true,
    bleedMm: true,
    safeAreaMm: true,
    active: true,
    sort: true,
    previewImage: true,
    dielineSvg: true,
    sceneTemplate: true,
    tags: true,
    updatedAt: true,
} as const;

export type TemplateListItem = Prisma.DesignTemplateGetPayload<{ select: typeof TEMPLATE_LIST_SELECT }>;

export function templateWhere(f: TemplateFilter): Prisma.DesignTemplateWhereInput {
    const where: Prisma.DesignTemplateWhereInput = {};
    if (f.activeOnly) where.active = true;
    if (f.productType) where.productType = f.productType;
    if (f.category) where.category = f.category;
    const q = f.q?.trim();
    if (q) {
        // 名字/标识/分类三列模糊：10 万行里 btree 用不上，但一次顺序扫是几十毫秒级，
        // 且被 active+type 的索引条件先收窄，够用；真要再快就上 pg_trgm GIN。
        where.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
        ];
    }
    return where;
}

/**
 * 分页列表：count 与取数放一个事务里，避免翻页时总数与内容不一致。
 * 默认 T = 列表字段（TemplateListItem）；不传 select 时实际返回整行，是它的超集，调用方按需要的字段传 select 即可。
 */
export async function listTemplates<T = TemplateListItem>(
    f: TemplateFilter,
    select?: Prisma.DesignTemplateSelect,
): Promise<TemplatePage<T>> {
    const take = f.take ?? TEMPLATE_PAGE_SIZE;
    const wantPage = Math.max(1, f.page ?? 1);
    const where = templateWhere(f);

    if ((wantPage - 1) * take > MAX_OFFSET) {
        const total = await prisma.designTemplate.count({ where });
        return { rows: [], total, page: wantPage, pages: Math.max(1, Math.ceil(total / take)), capped: true };
    }

    const [rows, total] = await prisma.$transaction([
        prisma.designTemplate.findMany({
            where,
            orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
            skip: (wantPage - 1) * take,
            take,
            ...(select ? { select } : {}),
        }),
        prisma.designTemplate.count({ where }),
    ]);

    // 数据变少后旧链接会指向不存在的页（比如删掉模板后的收藏页）：回退到最后一页，而不是报“无结果”
    if (rows.length === 0 && total > 0 && wantPage > 1) {
        const last = Math.max(1, Math.ceil(total / take));
        if (wantPage > last) {
            const clamped = await prisma.designTemplate.findMany({
                where,
                orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
                skip: (last - 1) * take,
                take,
                ...(select ? { select } : {}),
            });
            return { rows: clamped as T[], total, page: last, pages: last, capped: false };
        }
    }

    return {
        rows: rows as T[],
        total,
        page: wantPage,
        pages: Math.max(1, Math.ceil(total / take)),
        capped: false,
    };
}

/**
 * 类型筛选条用的分组计数（groupBy 走索引，一次搞定）。
 * 传 q 时计数跟着搜索条件走 —— 否则 chip 上的数字与结果不一致（看着有 1 个、点进去 0 个）。
 */
export async function templateTypeFacets(
    f: { q?: string; activeOnly?: boolean } = {},
): Promise<{ productType: string; count: number }[]> {
    const groups = await prisma.designTemplate.groupBy({
        by: ['productType'],
        where: templateWhere({ q: f.q, activeOnly: f.activeOnly }),
        _count: { productType: true },
    });
    return groups
        .map((g) => ({ productType: g.productType, count: g._count.productType }))
        .sort((a, b) => a.productType.localeCompare(b.productType));
}

/** 源文件内容指纹：批量导入去重（同一个 PSD 传两次不会生成两个模板） */
export function sourceHashOf(buf: ArrayBuffer | Uint8Array | string): string {
    const data = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : Buffer.from(buf as ArrayBuffer);
    return createHash('sha256').update(data).digest('hex');
}

/**
 * 生成不冲突的 slug：先规范化，再按需加 -2/-3 后缀。
 * 后台手工建模板与将来的批量导入器共用，避免两处各写一份规则。
 */
export async function ensureUniqueSlug(raw: string, excludeId?: string): Promise<string> {
    const base = slugify(raw) || 'template';
    for (let n = 1; n <= 50; n++) {
        const candidate = slugWithSuffix(base, n);
        const hit = await prisma.designTemplate.findFirst({
            where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
            select: { id: true },
        });
        if (!hit) return candidate;
    }
    // 50 次都撞：加时间戳兜底，绝不让创建失败
    return `${base}-${Date.now().toString(36)}`;
}
