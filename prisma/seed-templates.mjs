// 示例设计模板 seed：prisma/seed-templates.mjs  →  node prisma/seed-templates.mjs
// 幂等（按 slug upsert）。sceneTemplate 为 Fabric 序列化 JSON，dielineSvg 为刀版参考层。
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 与 src/components/design/useFabricCanvas.ts 的 PX_PER_MM 保持一致（1mm = 8px）
const PX_PER_MM = 8;

// 生成一个含占位文字框的 Fabric 场景 JSON（载入后画布即有可编辑内容）
// 预置内容必须按模板自己的安全区内缩，否则编辑器一打开就被印前自检判为“文字贴裁切线”
function scene(label, safeAreaMm) {
    const inset = safeAreaMm * PX_PER_MM + 8;
    return {
        version: '7.4.0',
        objects: [
            {
                type: 'textbox',
                originX: 'left', originY: 'top',
                left: inset, top: inset, width: 220,
                text: label,
                fontFamily: 'Arial', fontSize: 26, fontWeight: 'normal',
                fill: '#111111', textAlign: 'left',
            },
        ],
    };
}

const templates = [
    {
        slug: 'round-sticker-80', name: 'Round Sticker · 80mm', productType: 'label', category: 'Stickers',
        widthMm: 80, heightMm: 80, bleedMm: 3, safeAreaMm: 4,
        dielineSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="40" r="37" fill="none" stroke="#e11d48" stroke-width="0.6" stroke-dasharray="2 1.5"/></svg>',
        sceneTemplate: scene('Your logo', 4), sort: 1,
    },
    {
        slug: 'rect-label-100x50', name: 'Rectangular Label · 100×50mm', productType: 'label', category: 'Labels',
        widthMm: 100, heightMm: 50, bleedMm: 3, safeAreaMm: 3,
        dielineSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect x="1" y="1" width="98" height="48" fill="none" stroke="#e11d48" stroke-width="0.6" stroke-dasharray="2 1.5" rx="2"/></svg>',
        sceneTemplate: scene('Product label', 3), sort: 2,
    },
    {
        slug: 'business-card-90x54', name: 'Business Card · 90×54mm', productType: 'card', category: 'Business Cards',
        widthMm: 90, heightMm: 54, bleedMm: 3, safeAreaMm: 4,
        dielineSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 54"><rect x="1" y="1" width="88" height="52" fill="none" stroke="#e11d48" stroke-width="0.6" stroke-dasharray="2 1.5" rx="3"/></svg>',
        sceneTemplate: scene('Jane Doe', 4), sort: 1,
    },
    {
        slug: 'hang-tag-40x80', name: 'Hang Tag · 40×80mm', productType: 'tag', category: 'Cards & Tags',
        widthMm: 40, heightMm: 80, bleedMm: 3, safeAreaMm: 4,
        dielineSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 80"><rect x="1" y="1" width="38" height="78" fill="none" stroke="#e11d48" stroke-width="0.6" stroke-dasharray="2 1.5" rx="3"/><circle cx="20" cy="10" r="3" fill="none" stroke="#e11d48" stroke-width="0.6"/></svg>',
        sceneTemplate: scene('$12.99', 4), sort: 1,
    },
    {
        slug: 'mailer-panel-200x150', name: 'Mailer Box Panel · 200×150mm', productType: 'box', category: 'Boxes & Packaging',
        widthMm: 200, heightMm: 150, bleedMm: 3, safeAreaMm: 6,
        dielineSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect x="2" y="2" width="196" height="146" fill="none" stroke="#e11d48" stroke-width="0.8" stroke-dasharray="3 2"/></svg>',
        sceneTemplate: scene('Brand name', 6), sort: 1,
    },
];

async function main() {
    let n = 0;
    for (const t of templates) {
        await prisma.designTemplate.upsert({
            where: { slug: t.slug },
            update: { ...t, active: true },
            create: { ...t, active: true },
        });
        n++;
    }
    console.log(`Seeded ${n} design templates.`);
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
