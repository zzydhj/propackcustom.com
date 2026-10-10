// 印前色域体检：把库里所有上架模板的场景 fill 颜色，过一遍**真实的** outOfCmykGamut 规则。
// 用 .mts + node --experimental-strip-types 直接 import 应用里的 TS 模块，
// 避免在脚本里另写一份色域表（两份规则迟早对不上，那样测了等于没测）。
//
// 用法：node --experimental-strip-types scripts/check-template-colors.mts
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { outOfCmykGamut } from '../src/lib/color-gamut.ts';

const env = Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;

const prisma = new PrismaClient();

const rows = await prisma.designTemplate.findMany({
    where: { active: true },
    select: { slug: true, name: true, sceneTemplate: true },
});

const offenders = new Map<string, string[]>(); // color -> slugs
let scenes = 0;
let checked = 0;

for (const row of rows) {
    const raw = row.sceneTemplate as { objects?: { fill?: unknown }[] } | null;
    const objects = Array.isArray(raw) ? raw : raw?.objects;
    if (!Array.isArray(objects)) continue;
    scenes++;
    for (const o of objects) {
        const fill = o?.fill;
        if (typeof fill !== 'string' || !fill.startsWith('#')) continue;
        checked++;
        if (outOfCmykGamut(fill)) {
            offenders.set(fill, [...(offenders.get(fill) ?? []), row.slug]);
        }
    }
}

console.log(`templates=${rows.length} scenes=${scenes} fillsChecked=${checked}`);
if (offenders.size === 0) {
    console.log('OUT-OF-GAMUT: 0  (Pre-flight 的色域规则对全部上架模板静默)');
} else {
    console.log(`OUT-OF-GAMUT: ${offenders.size} distinct colors`);
    for (const [color, slugs] of offenders) {
        console.log(`  ${color}  ×${slugs.length}  e.g. ${slugs.slice(0, 3).join(', ')}`);
    }
}

await prisma.$disconnect();
