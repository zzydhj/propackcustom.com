// Label Sticker（不干胶标签）—— 归一化关系表建品脚本
// 覆盖规则引擎全部能力：allowed(白名单) / disabled(黑名单) / hidden(隐藏) / forced_checked(强制勾选) + 结构父子(parentOptionId)
// 运行： node --env-file=.env prisma/seed-sticker.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── 组 + 选项（显式稳定 id，供规则引用）──────────────────
const groups = [
  { id: 'material', name: 'Material', selectType: 'single', displayType: 'button', isRequired: true, sort: 0, options: [
    { id: 'mat-premium',  name: 'Premium Sticker',  priceAdjust: 0 },
    { id: 'mat-standard', name: 'Standard Sticker', priceAdjust: 0 },
    { id: 'mat-eli',      name: 'Eli Adhesive',     priceAdjust: 0.01 },
    { id: 'mat-strong',   name: 'Strong Adhesive',  priceAdjust: 0.02 },
    { id: 'mat-frozen',   name: 'Frozen-Grade',     priceAdjust: 0.05 },
  ] },
  { id: 'size', name: 'Finished Size', selectType: 'dimension', displayType: 'button', isRequired: true, sort: 1, unit: 'mm', min: 10, max: 500, options: [] },
  { id: 'printType', name: 'Print Type', selectType: 'single', displayType: 'radio', isRequired: true, sort: 2, options: [
    { id: 'pt-offset', name: 'Offset (Dedicated Plate)', priceAdjust: 0 },
    { id: 'pt-gang',   name: 'Offset (Gang Run)',        priceAdjust: 0 },
    { id: 'pt-laser',  name: 'Laser Toner',              priceAdjust: 0.01 },
    { id: 'pt-inkjet', name: 'UV Inkjet (Epson)',        priceAdjust: 0.02 },
  ] },
  { id: 'colors', name: 'Ink Colors', selectType: 'single', displayType: 'radio', isRequired: true, sort: 3, options: [
    { id: 'c-cmyk',    name: 'Full Color (CMYK)',   priceAdjust: 0, isDefaultChecked: true },
    { id: 'c-mono-bc', name: 'Mono · Barcode only', priceAdjust: 0 },
    { id: 'c-mono-tx', name: 'Mono · Text only',    priceAdjust: 0 },
    { id: 'c-cmyk1',   name: 'CMYK + 1 Spot',       priceAdjust: 0.02 },
    { id: 'c-cmyk2',   name: 'CMYK + 2 Spot',       priceAdjust: 0.04 },
  ] },
  { id: 'finishing', name: 'Surface Finishing', selectType: 'multi', displayType: 'checkbox', isRequired: false, sort: 4, options: [
    { id: 'f-varnish',   name: 'Gloss Varnish',    priceAdjust: 0.01 },
    { id: 'f-lam-gloss', name: 'Gloss Lamination', priceAdjust: 0.02 },
    { id: 'f-lam-matte', name: 'Matte Lamination', priceAdjust: 0.02 },
    { id: 'f-holo',      name: 'Holographic Film', priceAdjust: 0.05 },
    { id: 'f-uv',        name: 'UV-resistant Ink', priceAdjust: 0.02 },
  ] },
  { id: 'cutting', name: 'Cutting', selectType: 'multi', displayType: 'checkbox', isRequired: false, sort: 5, options: [
    { id: 'cut-die',   name: 'Die-cut',         priceAdjust: 0.03 },
    { id: 'cut-kiss',  name: 'Kiss-cut',        priceAdjust: 0.02 },
    { id: 'cut-angle', name: 'Right-angle Cut', priceAdjust: 0 },
  ] },
  // 结构层：Die Shape 仅在勾选 Die-cut 后出现（parentOptionId，不走规则）
  { id: 'dieShape', name: 'Die Shape', selectType: 'single', displayType: 'dropdown', isRequired: false, sort: 6, parentOptionId: 'cut-die', options: [
    { id: 'ds-square', name: 'Square / Rectangle', priceAdjust: 0 },
    { id: 'ds-round',  name: 'Round / Ellipse',    priceAdjust: 0 },
    { id: 'ds-custom', name: 'Custom Shape',       priceAdjust: 0.05 },
  ] },
  { id: 'foil', name: 'Foil Stamping', selectType: 'multi', displayType: 'checkbox', isRequired: false, sort: 7, options: [
    { id: 'foil-hot', name: 'Hot Foiling', priceAdjust: 0.04 },
  ] },
  { id: 'other', name: 'Other Processes', selectType: 'multi', displayType: 'checkbox', isRequired: false, sort: 8, options: [
    { id: 'o-waste',  name: 'Waste-stripping', priceAdjust: 0.01 },
    { id: 'o-spot',   name: 'Spot Color',      priceAdjust: 0.02 },
    { id: 'o-fullbg', name: 'Full Background', priceAdjust: 0.01 },
  ] },
  { id: 'proofing', name: 'Proofing', selectType: 'multi', displayType: 'checkbox', isRequired: false, sort: 9, options: [
    { id: 'pf-reorder',  name: 'Reorder Proof',            priceAdjust: 0 },
    { id: 'pf-customer', name: 'Customer Sample',          priceAdjust: 0 },
    { id: 'pf-workshop', name: 'Workshop Retained Sample', priceAdjust: 0 },
  ] },
  { id: 'delivery', name: 'Delivery Method', selectType: 'multi', displayType: 'checkbox', isRequired: false, sort: 10, options: [
    { id: 'dl-single', name: 'Single Design / Sheet',    priceAdjust: 0 },
    { id: 'dl-multi',  name: 'Multiple Designs / Sheet', priceAdjust: 0 },
  ] },
  { id: 'designs', name: 'Number of Designs', selectType: 'number', displayType: 'button', isRequired: false, sort: 11, min: 1, max: 50, options: [] },
];

// ── 联动规则（源选项 → 目标组）：四动作全覆盖 ──────────────
const ALL_OTHER = ['o-waste', 'o-spot', 'o-fullbg'];
const ALL_PROOF = ['pf-reorder', 'pf-customer', 'pf-workshop'];
const ALL_DELIV = ['dl-single', 'dl-multi'];

const rules = [
  // 印刷类型 = 胶印专版 / 合版 / 激光 → 印色仅"正常四色"；其它工艺/参样/交货 全部禁用
  { source: 'pt-offset', target: 'colors',   allowed: ['c-cmyk'] },
  { source: 'pt-offset', target: 'other',    disabled: ALL_OTHER },
  { source: 'pt-offset', target: 'proofing', disabled: ALL_PROOF },
  { source: 'pt-offset', target: 'delivery', disabled: ALL_DELIV },
  { source: 'pt-gang',   target: 'colors',   allowed: ['c-cmyk'] },
  { source: 'pt-gang',   target: 'other',    disabled: ALL_OTHER },
  { source: 'pt-gang',   target: 'proofing', disabled: ALL_PROOF },
  { source: 'pt-gang',   target: 'delivery', disabled: ALL_DELIV },
  { source: 'pt-laser',  target: 'colors',   allowed: ['c-cmyk'] },
  { source: 'pt-laser',  target: 'other',    disabled: ALL_OTHER },
  { source: 'pt-laser',  target: 'proofing', disabled: ALL_PROOF },
  { source: 'pt-laser',  target: 'delivery', disabled: ALL_DELIV },

  // 印刷类型 = 得世喷墨 → 印色仅四色；其它工艺仅"排废"并强制勾选；交货仅"单张单款"并强制勾选；参样全禁用
  { source: 'pt-inkjet', target: 'colors',   allowed: ['c-cmyk'] },
  { source: 'pt-inkjet', target: 'other',    allowed: ['o-waste'],   forced: 'o-waste' },
  { source: 'pt-inkjet', target: 'delivery', allowed: ['dl-single'], forced: 'dl-single' },
  { source: 'pt-inkjet', target: 'proofing', disabled: ALL_PROOF },

  // 材料 = 标准款 → 全息"隐藏"、模切禁用、烫金禁用（演示 hidden 动作）
  { source: 'mat-standard', target: 'finishing', hidden: ['f-holo'] },
  { source: 'mat-standard', target: 'cutting',   disabled: ['cut-die'] },
  { source: 'mat-standard', target: 'foil',      disabled: ['foil-hot'] },

  // 材料 = 艾利 / 强粘 / 冷冻 → 全息/模切/烫金禁用（仅品质款解锁）
  { source: 'mat-eli',    target: 'finishing', disabled: ['f-holo'] },
  { source: 'mat-eli',    target: 'cutting',   disabled: ['cut-die'] },
  { source: 'mat-eli',    target: 'foil',      disabled: ['foil-hot'] },
  { source: 'mat-strong', target: 'finishing', disabled: ['f-holo'] },
  { source: 'mat-strong', target: 'cutting',   disabled: ['cut-die'] },
  { source: 'mat-strong', target: 'foil',      disabled: ['foil-hot'] },
  { source: 'mat-frozen', target: 'finishing', disabled: ['f-holo'] },
  { source: 'mat-frozen', target: 'cutting',   disabled: ['cut-die'] },
  { source: 'mat-frozen', target: 'foil',      disabled: ['foil-hot'] },
];

const quantityTiers = [
  { min: 100, discountPct: 0 },
  { min: 500, discountPct: 8 },
  { min: 1000, discountPct: 15 },
  { min: 5000, discountPct: 25 },
];

async function main() {
  let cat = await prisma.category.findFirst({ where: { slug: 'labels-stickers' } });
  if (!cat) {
    cat = await prisma.category.create({ data: { slug: 'labels-stickers', name: { en: 'Labels & Stickers', zh: '标签 / 不干胶' } } });
  }

  const base = {
    categoryId: cat.id,
    name: { en: 'Label Sticker', zh: '不干胶标签' },
    description: {
      en: 'Custom printed labels. Material, print type and finishing options adapt to each other — unavailable combinations are greyed out, and some choices auto-select for you.',
      zh: '定制印刷不干胶标签。材料 / 印刷类型 / 工艺选项相互联动，不可选组合自动置灰，部分选项按工艺自动勾选。',
    },
    basePrice: 0.05,
    currency: 'USD',
    pricingMode: 'FIXED',
    pricePerSqm: null,
    quantityTiers,
    attributes: [], // 清空旧 JSON（已迁到关系表）
    active: true,
  };

  const product = await prisma.product.upsert({
    where: { slug: 'label-sticker' },
    update: base,
    create: { slug: 'label-sticker', images: [], ...base },
  });

  await prisma.$transaction(async (tx) => {
    // 全量替换：先清规则，再清组（组级联删选项；规则 FK 亦级联）
    await tx.dependencyRule.deleteMany({ where: { productId: product.id } });
    await tx.attributeGroup.deleteMany({ where: { productId: product.id } });

    // 组（createMany 减少往返，避免 Neon 远程事务超时）
    await tx.attributeGroup.createMany({
      data: groups.map((g) => ({
        id: g.id,
        productId: product.id,
        name: g.name,
        selectType: g.selectType,
        displayType: g.displayType,
        unit: g.unit ?? null,
        isRequired: !!g.isRequired,
        sort: g.sort,
        min: g.min ?? null,
        max: g.max ?? null,
        parentOptionId: g.parentOptionId ?? null,
      })),
    });

    // 选项（扁平化，带 groupId）
    const optionRows = [];
    for (const g of groups) {
      (g.options ?? []).forEach((o, oi) => {
        optionRows.push({
          id: o.id,
          groupId: g.id,
          name: o.name,
          sort: oi,
          defaultState: o.defaultState ?? 'enabled',
          isDefaultChecked: !!o.isDefaultChecked,
          priceAdjustType: o.priceAdjustType ?? 'FIXED',
          priceAdjust: o.priceAdjust ?? 0,
        });
      });
    }
    await tx.attributeOption.createMany({ data: optionRows });

    // 规则
    await tx.dependencyRule.createMany({
      data: rules.map((r) => ({
        productId: product.id,
        sourceOptionId: r.source,
        targetGroupId: r.target,
        allowedOptionIds: r.allowed ?? [],
        disabledOptionIds: r.disabled ?? [],
        hiddenOptionIds: r.hidden ?? [],
        forcedCheckedOptionId: r.forced ?? null,
        priority: r.priority ?? 0,
      })),
    });
  }, { timeout: 30000 });

  console.log(`Label Sticker ready → /products/label-sticker  (groups=${groups.length}, rules=${rules.length})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
