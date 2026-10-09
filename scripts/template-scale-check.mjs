// 模板库规模压测：灌 N 条临时模板 → 量各条查询路径耗时 + 看执行计划是否走复合索引 → 全部删掉。
// 用法：node scripts/template-scale-check.mjs [--rows=20000]
// 临时数据 slug 统一以 zz-scale- 开头；脚本开头也会先清一次，中途挂掉可直接重跑清理。
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const env = Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
if (!env.DATABASE_URL) {
    console.log('NO_DATABASE_URL');
    process.exit(1);
}
process.env.DATABASE_URL = env.DATABASE_URL;

const PREFIX = 'zz-scale-';
const rows = Number((process.argv.find((a) => a.startsWith('--rows=')) ?? '').split('=')[1] || 20000);
const TYPES = ['label', 'card', 'tag', 'sticker', 'box'];

const prisma = new PrismaClient();
const time = async (label, fn) => {
    const t0 = performance.now();
    const out = await fn();
    const ms = (performance.now() - t0).toFixed(1);
    const n = typeof out === 'number' ? out : Array.isArray(out) ? out.length : '-';
    console.log(`${label.padEnd(38)} ${ms.padStart(8)} ms   rows=${n}`);
    return out;
};

try {
    await time('cleanup (previous leftovers)', () => prisma.designTemplate.deleteMany({ where: { slug: { startsWith: PREFIX } } }));

    const mk = (i) => ({
        slug: `${PREFIX}${i}`,
        name: `Scale Test Label ${i}`,
        productType: TYPES[i % TYPES.length],
        category: i % 7 === 0 ? 'minimal' : null,
        widthMm: 80,
        heightMm: 80,
        dielineSvg: '<svg viewBox="0 0 80 80"><rect width="80" height="80" fill="none" stroke="#e11"/></svg>',
        active: i % 10 !== 0, // 90% 上架
        sort: i % 100,
        tags: ['scale', TYPES[i % TYPES.length]],
    });

    const t0 = performance.now();
    for (let i = 0; i < rows; i += 2000) {
        const batch = Array.from({ length: Math.min(2000, rows - i) }, (_, k) => mk(i + k));
        await prisma.designTemplate.createMany({ data: batch });
    }
    console.log(`insert ${rows} rows`.padEnd(38), `${(performance.now() - t0).toFixed(0).padStart(8)} ms`);

    // 前台首页第 1 页（active + 排序，走复合索引）
    await time('page1 active+order limit24', () =>
        prisma.designTemplate.findMany({ where: { active: true }, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }], take: 24, select: { id: true } }),
    );
    // 类型筛选 + 分页
    await time('type=label page3', () =>
        prisma.designTemplate.findMany({ where: { active: true, productType: 'label' }, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }], skip: 48, take: 24, select: { id: true } }),
    );
    // count（分页器要用）
    await time('count active', () => prisma.designTemplate.count({ where: { active: true } }));
    // 模糊搜索（name/slug/category 三列 OR）
    await time('search q=Scale Test Labe', () =>
        prisma.designTemplate.findMany({
            where: { active: true, OR: [{ name: { contains: 'Scale Test Labe', mode: 'insensitive' } }, { slug: { contains: 'Scale Test Labe', mode: 'insensitive' } }, { category: { contains: 'Scale Test Labe', mode: 'insensitive' } }] },
            take: 24,
            select: { id: true },
        }),
    );
    // 深翻页（上限附近）
    await time('deep page offset=19976', () =>
        prisma.designTemplate.findMany({ where: { active: true }, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }], skip: 19976, take: 24, select: { id: true } }),
    );
    // 分组计数（筛选条）
    await time('groupBy productType', () => prisma.designTemplate.groupBy({ by: ['productType'], where: { active: true }, _count: { productType: true } }));

    // 批量灌数据后统计信息是旧的，planner 会估错行数选错计划 —— 真实导入流程末尾也要跑一次 ANALYZE
    await prisma.$executeRaw`ANALYZE "DesignTemplate"`;

    const plans = {
        'all-types page1 (public default)': 'EXPLAIN SELECT id FROM "DesignTemplate" WHERE active = true ORDER BY sort ASC, "createdAt" ASC LIMIT 24',
        'type filter page1': `EXPLAIN SELECT id FROM "DesignTemplate" WHERE active = true AND "productType" = 'label' ORDER BY sort ASC, "createdAt" ASC LIMIT 24`,
        'all-types deep offset 19976': 'EXPLAIN SELECT id FROM "DesignTemplate" WHERE active = true ORDER BY sort ASC, "createdAt" ASC LIMIT 24 OFFSET 19976',
        'search contains': `EXPLAIN SELECT id FROM "DesignTemplate" WHERE active = true AND name ILIKE '%Scale Test Labe%' LIMIT 24`,
    };
    for (const [label, sql] of Object.entries(plans)) {
        console.log(`--- plan: ${label} ---`);
        const rows = await prisma.$queryRawUnsafe(sql);
        for (const r of rows) console.log('   ' + String(r['QUERY PLAN']));
    }
} finally {
    const del = await prisma.designTemplate.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    const left = await prisma.designTemplate.count({ where: { slug: { startsWith: PREFIX } } });
    console.log(`cleanup deleted=${del.count} remaining_scale_rows=${left}`);
    console.log(`templates_total_now=${await prisma.designTemplate.count()}`);
    await prisma.$disconnect();
}
