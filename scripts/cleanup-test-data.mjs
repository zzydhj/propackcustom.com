// 一次性清理测试数据：默认 dry-run 只列不改，加 --apply 才真删。
// 跑法：node scripts/cleanup-test-data.mjs           → 看清单
//       node scripts/cleanup-test-data.mjs --apply   → 执行删除
//
// 删除范围（只碰明显是自动化测试留下的作品）：
//   名称前缀 QA- / E2E- 、等于 "Untitled design" 、以 " custom" 结尾（快速定制页测试保存的）
// 订单/报价**只列不删**（属于业务数据，要删由人确认）。
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const apply = process.argv.includes('--apply');

const designs = await prisma.userDesign.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, productType: true, status: true, userId: true, email: true, createdAt: true },
});
const isTest = (name) => /^(QA-|E2E-)/i.test(name) || name === 'Untitled design' || name.toLowerCase().endsWith(' custom');
const doomed = designs.filter((d) => isTest(d.name));

console.log(`UserDesign 总数 ${designs.length}，命中测试数据 ${doomed.length} 条${apply ? '' : '（dry-run，未删除）'}：`);
for (const d of doomed) {
    const orders = await prisma.order.count({ where: { designId: d.id } });
    const quotes = await prisma.quote.count({ where: { designId: d.id } });
    console.log(`  ${d.id}  ${d.createdAt.toISOString().slice(0, 10)}  ${d.status}  「${d.name}」  ${d.userId ? '登录用户' : (d.email || '匿名')}`
        + (orders || quotes ? `  ← 被 ${orders} 订单/${quotes} 报价引用` : ''));
}
const kept = designs.filter((d) => !isTest(d.name));
console.log(`保留 ${kept.length} 条：`);
for (const d of kept) console.log(`  ${d.id}  ${d.createdAt.toISOString().slice(0, 10)}  「${d.name}」`);

const orders = await prisma.order.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, orderNo: true, status: true, total: true, createdAt: true } });
console.log(`\n订单 ${orders.length} 条（只列不删，要清请人工确认）：`);
for (const o of orders) console.log(`  ${o.orderNo}  ${o.createdAt.toISOString().slice(0, 10)}  ${o.status}  ${o.total}`);
const quotes = await prisma.quote.count();
console.log(`报价 ${quotes} 条（只列不删）`);

if (!apply) {
    console.log('\ndry-run 结束。确认无误后加 --apply 执行删除。');
} else {
    // 软引用先置空，避免删作品后订单/报价里留着指向不存在的 id
    const ids = doomed.map((d) => d.id);
    await prisma.order.updateMany({ where: { designId: { in: ids } }, data: { designId: null } });
    await prisma.quote.updateMany({ where: { designId: { in: ids } }, data: { designId: null } });
    const res = await prisma.userDesign.deleteMany({ where: { id: { in: ids } } });
    console.log(`\n已删除 ${res.count} 条测试作品（订单/报价的设计引用已置空，订单与报价本身未动）。`);
}

await prisma.$disconnect();
