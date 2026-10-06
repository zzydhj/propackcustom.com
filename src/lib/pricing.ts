// 产品配置器 / 算价引擎 —— 前后端共用的纯逻辑
// 定价模型：
//   FIXED  → 单价 = 基础价 + 选项加价
//   AREA   → 单价 = 面积(长×宽, m²) × 每平方米单价 + 选项加价
//   选项加价支持 固定金额(FIXED) 或 百分比(PERCENT)
//   数量阶梯：命中 quantity >= tier.min 的最大档，按 discountPct 打折

export type AdderType = 'FIXED' | 'PERCENT';
export type AttrType = 'SELECT' | 'DROPDOWN' | 'MULTI' | 'DIMENSION' | 'NUMBER' | 'TEXT';

// 依赖条件：引用的字段(attrId)当前所选值命中 values 任一即满足（OR）；多条之间为 AND
export type AttrCondition = { attrId: string; values: string[] };

export type AttrOption = { id: string; label: string; adder: number; adderType: AdderType; requires?: AttrCondition[] };

export type ProductAttribute = {
    id: string;
    label: string;
    type: AttrType;
    required: boolean;
    unit?: string;
    options?: AttrOption[];
    min?: number;
    max?: number;
    requires?: AttrCondition[];
};

export type QuantityTier = { min: number; discountPct: number };
export type Dimension = { width: number; height: number };
export type Selections = Record<string, string | string[] | number | Dimension | undefined>;

export type PricingProduct = {
    pricingMode: 'FIXED' | 'AREA';
    basePrice: number;
    pricePerSqm: number | null;
    attributes: ProductAttribute[];
    quantityTiers: QuantityTier[];
    currency: string;
};

export type PriceBreakdown = {
    currency: string;
    unitBase: number;
    fixedAdd: number;
    percentAdd: number;
    unitBeforeTier: number;
    discountPct: number;
    finalUnit: number;
    quantity: number;
    total: number;
    areaSqm: number;
};

export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

// 把数据库里 Json 字段安全解析成 PricingProduct
export function parsePricingProduct(p: {
    pricingMode: string;
    basePrice: number;
    pricePerSqm: number | null;
    attributes: unknown;
    quantityTiers: unknown;
    currency: string;
}): PricingProduct {
    return {
        pricingMode: p.pricingMode === 'AREA' ? 'AREA' : 'FIXED',
        basePrice: Number(p.basePrice) || 0,
        pricePerSqm: p.pricePerSqm == null ? null : Number(p.pricePerSqm),
        attributes: Array.isArray(p.attributes) ? (p.attributes as ProductAttribute[]) : [],
        quantityTiers: Array.isArray(p.quantityTiers) ? (p.quantityTiers as QuantityTier[]) : [],
        currency: p.currency || 'USD',
    };
}

export function getDimension(attrs: ProductAttribute[], selections: Selections): Dimension | null {
    const dim = attrs.find((a) => a.type === 'DIMENSION');
    if (!dim) return null;
    const v = selections[dim.id];
    if (v && typeof v === 'object' && !Array.isArray(v) && 'width' in v) {
        const d = v as Dimension;
        return { width: Number(d.width) || 0, height: Number(d.height) || 0 };
    }
    return null;
}

// ── 依赖条件求值 ──
export function condMet(cond: AttrCondition, attrs: ProductAttribute[], selections: Selections): boolean {
    const target = attrs.find((a) => a.id === cond.attrId);
    if (!target) return true; // 引用悬空 → 不拦截
    const v = selections[cond.attrId];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (target.type === 'SELECT' || target.type === 'DROPDOWN' || target.type === 'MULTI') {
        if (empty) return false;
        if (Array.isArray(v)) return v.some((x) => cond.values.includes(String(x)));
        return cond.values.includes(String(v));
    }
    // 数字/文本/尺寸作为条件时按「是否已填写」判断
    return !empty;
}

export function isAttrEnabled(attr: ProductAttribute, attrs: ProductAttribute[], selections: Selections): boolean {
    return (attr.requires ?? []).every((c) => condMet(c, attrs, selections));
}

export function isOptionEnabled(option: AttrOption, attrs: ProductAttribute[], selections: Selections): boolean {
    return (option.requires ?? []).every((c) => condMet(c, attrs, selections));
}

// 级联清理：移除所有因依赖不满足而失效的选项/字段，反复迭代直到稳定
export function pruneSelections(attrs: ProductAttribute[], selections: Selections): Selections {
    const sel: Selections = { ...selections };
    let changed = true;
    while (changed) {
        changed = false;
        for (const attr of attrs) {
            const attrOn = isAttrEnabled(attr, attrs, sel);
            if (attr.type === 'SELECT' || attr.type === 'DROPDOWN') {
                const v = sel[attr.id];
                if (typeof v === 'string' && v) {
                    const ok = attrOn && (attr.options ?? []).some((o) => o.id === v && isOptionEnabled(o, attrs, sel));
                    if (!ok) { delete sel[attr.id]; changed = true; }
                }
            } else if (attr.type === 'MULTI') {
                const arr = sel[attr.id];
                if (Array.isArray(arr) && arr.length) {
                    const kept = attrOn ? arr.filter((id) => (attr.options ?? []).some((o) => o.id === id && isOptionEnabled(o, attrs, sel))) : [];
                    if (kept.length !== arr.length) { sel[attr.id] = kept; changed = true; }
                }
            } else if (!attrOn && sel[attr.id] !== undefined) {
                delete sel[attr.id]; changed = true;
            }
        }
    }
    return sel;
}

export function computePrice(product: PricingProduct, selections: Selections, quantity: number): PriceBreakdown {
    const { pricingMode, basePrice, pricePerSqm, attributes, quantityTiers, currency } = product;

    let unitBase = 0;
    let areaSqm = 0;
    if (pricingMode === 'AREA') {
        const dim = getDimension(attributes, selections);
        if (dim) areaSqm = (dim.width / 100) * (dim.height / 100);
        unitBase = areaSqm * (pricePerSqm ?? 0);
    } else {
        unitBase = basePrice;
    }

    let fixedAdd = 0;
    let percentAdd = 0;
    for (const attr of attributes) {
        if (!isAttrEnabled(attr, attributes, selections)) continue;
        if (attr.type === 'SELECT' || attr.type === 'DROPDOWN') {
            const opt = attr.options?.find((o) => o.id === selections[attr.id]);
            if (opt && isOptionEnabled(opt, attributes, selections)) {
                if (opt.adderType === 'PERCENT') percentAdd += opt.adder;
                else fixedAdd += opt.adder;
            }
        } else if (attr.type === 'MULTI') {
            const sels = (selections[attr.id] as string[]) ?? [];
            for (const id of sels) {
                const opt = attr.options?.find((o) => o.id === id);
                if (opt && isOptionEnabled(opt, attributes, selections)) {
                    if (opt.adderType === 'PERCENT') percentAdd += opt.adder;
                    else fixedAdd += opt.adder;
                }
            }
        }
    }

    const unitBeforeTier = (unitBase + fixedAdd) * (1 + percentAdd / 100);

    let discountPct = 0;
    const sorted = [...quantityTiers].sort((a, b) => a.min - b.min);
    for (const t of sorted) {
        if (quantity >= t.min) discountPct = t.discountPct;
    }

    const finalUnit = unitBeforeTier * (1 - discountPct / 100);
    const total = finalUnit * (quantity || 0);

    return {
        currency,
        unitBase,
        fixedAdd,
        percentAdd,
        unitBeforeTier,
        discountPct,
        finalUnit,
        quantity: quantity || 0,
        total,
        areaSqm,
    };
}

// 校验必填 + 尺寸范围，返回错误信息（空数组=通过）
export function validateSelections(attrs: ProductAttribute[], selections: Selections): string[] {
    const errors: string[] = [];
    for (const attr of attrs) {
        if (!isAttrEnabled(attr, attrs, selections)) continue;
        const v = selections[attr.id];
        if (attr.required) {
            if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
                errors.push(`${attr.label} is required`);
                continue;
            }
            if (attr.type === 'DIMENSION') {
                const d = v as Dimension;
                if (!d?.width || !d?.height) errors.push(`${attr.label} needs width and height`);
            }
        }
        if (attr.type === 'DIMENSION' && v && typeof v === 'object') {
            const d = v as Dimension;
            if (attr.min != null && (d.width < attr.min || d.height < attr.min)) errors.push(`${attr.label} below minimum ${attr.min}${attr.unit ?? ''}`);
            if (attr.max != null && (d.width > attr.max || d.height > attr.max)) errors.push(`${attr.label} above maximum ${attr.max}${attr.unit ?? ''}`);
        }
    }
    return errors;
}
