// 模板行的日常维护 CLI：批量导入出来的都是未上架草稿（名字还带中文），
// 需要改名/换分类/上下架。做成常驻工具，而不是每次写临时脚本。
//
// 用法：
//   node --experimental-strip-types scripts/manage-templates.mts --list-imported
//   node --experimental-strip-types scripts/manage-templates.mts --slug=imported-128x148mm-ai7fc5e5 --name="Eyewear Certificate Tag · 128×148mm" --type=tag --active=true
//
// 只按 slug 定位、只改显式传进来的字段，避免误伤其它列。

import { readFileSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma.ts';
import { slugify } from '../src/lib/template-slug.ts';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i <= 0 || line.startsWith('#')) continue;
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const argv = process.argv.slice(2);
const opt = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const flagOn = (name: string) => opt(name) === 'true' || opt(name) === '1';

const a = (v: unknown) => JSON.stringify(String(v ?? ''));

const slug = opt('slug');

if (flagOn('list-imported') || (!slug && !flagOn('list-imported'))) {
    const rows = await prisma.designTemplate.findMany({
        where: { tags: { has: 'imported:pdf' } },
        select: { slug: true, name: true, productType: true, active: true, widthMm: true, heightMm: true, slots: true, sourceKey: true },
        orderBy: { createdAt: 'asc' },
    });
    console.log(`IMPORTED ${rows.length}`);
    for (const r of rows) {
        const n = Array.isArray(r.slots) ? r.slots.length : 0;
        console.log(`  slug=${a(r.slug)} type=${r.productType} active=${r.active} slots=${n} size=${r.widthMm}x${r.heightMm}mm name=${a(r.name)}`);
        console.log(`        customize=/customize/${r.slug}  source=${a(r.sourceKey ?? '(not archived)')}`);
    }
    await prisma.$disconnect();
    process.exit(0);
}

const data: Prisma.DesignTemplateUncheckedUpdateInput = {};
if (opt('name')) data.name = opt('name')!;
if (opt('type')) data.productType = opt('type')!;
if (opt('category')) data.category = opt('category')!;
if (opt('active') !== undefined) data.active = flagOn('active');
if (opt('bleed')) data.bleedMm = Number(opt('bleed'));
if (opt('safe')) data.safeAreaMm = Number(opt('safe'));
if (opt('fullbleed') !== undefined) data.fullBleed = flagOn('fullbleed');

if (!Object.keys(data).length) {
    console.log('NOTHING_TO_DO  至少给一个 --name/--type/--category/--active/--bleed/--safe/--fullbleed');
    await prisma.$disconnect();
    process.exit(1);
}

// 改名后 slug 也要跟着走（slug 是公开 URL），但要保留原 slug 上已挂的作品引用关系：
// UserDesign.templateId 挂的是 id，不受 slug 影响，所以这里可以安全换 slug。
let newSlug: string;
if (data.name) {
    const name = String(data.name);
    const size = await prisma.designTemplate.findUnique({ where: { slug: slug! }, select: { widthMm: true, heightMm: true } });
    const sized = name.includes('mm') ? name : `${name} · ${Math.round(size?.widthMm ?? 0)}×${Math.round(size?.heightMm ?? 0)}mm`;
    data.name = sized;      // 展示名也带尺寸，与导入器的命名约定一致
    const base = slugify(sized);
    if (base) {
        let candidate = base;
        for (let n = 2; n <= 30; n++) {
            const hit = await prisma.designTemplate.findFirst({ where: { slug: candidate, NOT: { slug: slug! } }, select: { slug: true } });
            if (!hit) break;
            candidate = `${base}-${n}`;
        }
        newSlug = candidate;
        data.slug = candidate;
    } else {
        newSlug = slug!;
    }
} else {
    newSlug = slug!;
}

const before = await prisma.designTemplate.findUnique({ where: { slug: slug! }, select: { slug: true, name: true, productType: true, active: true } });
if (!before) {
    console.log(`NOT_FOUND slug=${a(slug)}`);
    await prisma.$disconnect();
    process.exit(1);
}
const row = await prisma.designTemplate.update({
    where: { slug: slug! },
    data,
    select: { slug: true, name: true, productType: true, active: true },
});
console.log(`BEFORE slug=${a(before.slug)} type=${before.productType} active=${before.active} name=${a(before.name)}`);
console.log(`AFTER  slug=${a(row.slug)} type=${row.productType} active=${row.active} name=${a(row.name)}`);
console.log(`URL    /customize/${newSlug}   and   /design/${row.productType}`);
await prisma.$disconnect();
