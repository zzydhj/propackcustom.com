// 迁移：把旧 JSON `attributes` 转成归一化三表（AttributeGroup / AttributeOption / DependencyRule）
// 幂等：跳过「已有 attributeGroups」的产品；无 attributes 的产品跳过。
// 运行： node --env-file=.env prisma/migrate-attributes.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 旧 type → 新 selectType / displayType
const TYPE_MAP = {
  SELECT:    { selectType: 'single',    displayType: 'button' },
  DROPDOWN:  { selectType: 'single',    displayType: 'dropdown' },
  MULTI:     { selectType: 'multi',     displayType: 'checkbox' },
  DIMENSION: { selectType: 'dimension', displayType: 'button' },
  NUMBER:    { selectType: 'number',    displayType: 'button' },
  TEXT:      { selectType: 'text',      displayType: 'button' },
  FILE:      { selectType: 'file',      displayType: 'button' },
};
const hasOpts = (t) => t === 'SELECT' || t === 'DROPDOWN' || t === 'MULTI';

async function migrateProduct(p, attrs) {
  await prisma.$transaction(async (tx) => {
    const newGroupId = {};   // 旧 attrId → 新 groupId
    const newOptionId = {};  // 旧 optionId → 新 optionId

    // 1) 组 + 选项
    for (let gi = 0; gi < attrs.length; gi++) {
      const a = attrs[gi];
      const map = TYPE_MAP[a.type] || TYPE_MAP.TEXT;
      const g = await tx.attributeGroup.create({
        data: {
          productId: p.id,
          name: a.label || 'Option',
          selectType: map.selectType,
          displayType: map.displayType,
          unit: a.unit ?? null,
          isRequired: !!a.required,
          sort: gi,
          min: a.min ?? null,
          max: a.max ?? null,
        },
      });
      newGroupId[a.id] = g.id;
      if (hasOpts(a.type) && Array.isArray(a.options)) {
        for (let oi = 0; oi < a.options.length; oi++) {
          const o = a.options[oi];
          const oc = await tx.attributeOption.create({
            data: {
              groupId: g.id,
              name: o.label || '',
              sort: oi,
              defaultState: 'enabled',
              isDefaultChecked: false,
              priceAdjustType: o.adderType === 'PERCENT' ? 'PERCENT' : 'FIXED',
              priceAdjust: Number(o.adder) || 0,
            },
          });
          newOptionId[o.id] = oc.id;
        }
      }
    }

    // 2) 字段级 requires（单条件单值）→ 结构层 parentOptionId（如 旧 dieShape 依赖 cutting=die-cut）
    for (const a of attrs) {
      if (!Array.isArray(a.requires) || a.requires.length !== 1) continue;
      const cond = a.requires[0];
      if (!Array.isArray(cond.values) || cond.values.length !== 1) continue;
      const parentNewId = newOptionId[cond.values[0]];
      if (parentNewId && newGroupId[a.id]) {
        await tx.attributeGroup.update({ where: { id: newGroupId[a.id] }, data: { parentOptionId: parentNewId } });
      }
    }

    // 3) 选项级 requires[{attrId,values}] → 反转成 disabled 规则：
    //    对源组里「不在允许值集合」的每个选项 S，建/并规则 (source=S → target=本组, disabled += [本选项])。
    //    语义等价于「本选项仅当 A∈values 才可用」（disabled 取并集）。
    for (const a of attrs) {
      if (!hasOpts(a.type) || !Array.isArray(a.options)) continue;
      for (const o of a.options) {
        if (!Array.isArray(o.requires)) continue;
        for (const cond of o.requires) {
          const srcAttr = attrs.find((x) => x.id === cond.attrId);
          if (!srcAttr || !Array.isArray(srcAttr.options)) continue;
          const allowedVals = new Set(cond.values || []);
          for (const so of srcAttr.options) {
            if (allowedVals.has(so.id)) continue; // 该源值允许本选项 → 不禁用
            const srcNewId = newOptionId[so.id];
            const tgtGroupId = newGroupId[a.id];
            const tgtOptId = newOptionId[o.id];
            if (!srcNewId || !tgtGroupId || !tgtOptId) continue;
            const existing = await tx.dependencyRule.findFirst({
              where: { productId: p.id, sourceOptionId: srcNewId, targetGroupId: tgtGroupId },
            });
            if (existing) {
              const disabled = Array.isArray(existing.disabledOptionIds) ? [...existing.disabledOptionIds] : [];
              if (!disabled.includes(tgtOptId)) disabled.push(tgtOptId);
              await tx.dependencyRule.update({ where: { id: existing.id }, data: { disabledOptionIds: disabled } });
            } else {
              await tx.dependencyRule.create({
                data: {
                  productId: p.id,
                  sourceOptionId: srcNewId,
                  targetGroupId: tgtGroupId,
                  allowedOptionIds: [],
                  disabledOptionIds: [tgtOptId],
                  hiddenOptionIds: [],
                  forcedCheckedOptionId: null,
                  priority: 0,
                },
              });
            }
          }
        }
      }
    }
  });
}

async function main() {
  const products = await prisma.product.findMany({ include: { attributeGroups: { select: { id: true } } } });
  let migrated = 0;
  for (const p of products) {
    const attrs = Array.isArray(p.attributes) ? p.attributes : [];
    if (attrs.length === 0) continue;
    if (p.attributeGroups.length > 0) { console.log(`skip   ${p.slug} (已有关系表)`); continue; }
    await migrateProduct(p, attrs);
    migrated++;
    console.log(`migrate ${p.slug} (${attrs.length} attrs)`);
  }
  console.log(`Done. migrated=${migrated}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
