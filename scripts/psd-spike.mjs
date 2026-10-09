// P0 Spike：验证「PSD 批量转模板」这条路的元数据解析 + 映射契约能不能站住。
// 跑法：
//   node scripts/psd-spike.mjs                 → 自检（PSD 写出/读回 + 映射断言）
//   node scripts/psd-spike.mjs a.psd b.psd     → 拿真实 PSD 看能提取出什么（只读元数据）
//
// 两条已被实测证实的硬约束（ spike 的产出，别当成 bug）：
//   1) ag-psd 在 Node 里读写像素要先 initializeCanvas；本机没装 node-canvas，
//      所以这里用一个全透明的假 canvas 顶替 —— 只证明“元数据链路”，
//      真正的背景合成图切片必须放到带 canvas 的 worker / headless Chrome / Python psd-tools 里做。
//   2) PSD 图层的包围盒依附像素：没像素的空图层读回来 right===left、bottom===top，
//      因此规范里的标记层（刀版/出血/安全区/槽位）必须带实体像素（哪怕 1px 占位矩形）。
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readPsd, writePsd, initializeCanvas } from 'ag-psd';
import { mapPsdToTemplate, templatePublishable } from '../src/lib/psd-template.ts';

const DPI = 300;
const mm = (v) => Math.round((v / 25.4) * DPI); // mm → PSD 像素

/** 全透明假画布：只为满足 ag-psd 的写入门禁，不代表真实像素 */
function shimCanvas(w, h) {
    const blank = (ww, hh) => ({ width: ww, height: hh, data: new Uint8ClampedArray(Math.max(1, ww * hh * 4)) });
    return {
        width: w, height: h,
        getContext: () => ({
            getImageData: (_x, _y, ww, hh) => blank(ww, hh),
            createImageData: (ww, hh) => blank(ww, hh),
            putImageData: () => {}, drawImage: () => {}, fillRect: () => {}, clearRect: () => {},
        }),
        toDataURL: () => 'data:,',
    };
}
initializeCanvas(shimCanvas);

/**
 * 图层工厂。withPixels=true 时按包围盒尺寸挂上假画布，模拟“有实体像素的图层”。
 * 规范里所有标记层都必须属于这一类。
 */
function layer(name, xMm, yMm, wMm, hMm, extra = {}, withPixels = false) {
    const box = { name, left: mm(xMm), top: mm(yMm), right: mm(xMm + wMm), bottom: mm(yMm + hMm), ...extra };
    return withPixels ? { ...box, canvas: shimCanvas(mm(wMm), mm(hMm)) } : box;
}

/** 名片 90×54mm：3mm 出血、5mm 安全区、2 个文字槽位 + 1 个图片槽位 */
function specLayers(withPixels = false) {
    const L = (name, x, y, w, h, extra) => layer(name, x, y, w, h, extra ?? {}, withPixels);
    return [
        {
            name: 'ARTWORK',
            children: [
                L('__bg_pattern__', 0, 0, 90, 54),
                L('Logo mark', 60, 8, 22, 14),
                L('__slot:logo__', 8, 8, 24, 16),
                L('__text:companyName__', 8, 30, 45, 8, {
                    text: {
                        text: 'Acme Packaging Co.',
                        style: { fontSize: 12, font: { name: 'Arial' }, fillColor: { r: 18, g: 18, b: 18 } },
                        paragraphStyle: { justification: 'left' },
                    },
                }),
                L('__text:phone__', 8, 40, 45, 6, {
                    text: {
                        // 故意用未托管字体，验证识别与回退
                        text: '+1 555 0100',
                        style: { fontSize: 9, font: { name: 'Montserrat-SemiBold' }, fillColor: { r: 225, g: 29, b: 72 } },
                        paragraphStyle: { justification: 'center' },
                    },
                }),
                L('hidden draft note', 20, 20, 30, 6, { hidden: true }),
            ],
        },
        L('__dieline__', 0, 0, 90, 54),
        L('__bleed__', -3, -3, 96, 60),
        L('__safe__', 5, 5, 80, 44),
    ];
}

const PSD_META = {
    imageResources: {
        resolutionInfo: {
            horizontalResolution: DPI, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches',
            verticalResolution: DPI, verticalResolutionUnit: 'PPI', heightUnit: 'Inches',
        },
    },
};

const toDoc = (psd) => ({
    width: psd.width,
    height: psd.height,
    dpi: psd.imageResources?.resolutionInfo?.horizontalResolution,
    layers: psd.children ?? [],
});

/** 走一遍真实文件字节流：写出 PSD → 读回 PSD（writePsd 返 ArrayBuffer） */
function roundTrip(children) {
    const buf = writePsd({ width: mm(90), height: mm(54), children, ...PSD_META }, { generateThumbnail: false, trimImageData: false });
    return { bytes: buf.byteLength, doc: toDoc(readPsd(buf, { useImageData: false })) };
}

// —— 路径 A：标记层带像素（规范做法）
let good = null;
try {
    good = roundTrip(specLayers(true));
    console.log(`[A] 带像素标记层：写出 ${good.bytes} 字节 → 读回 ${good.doc.width}×${good.doc.height}px，DPI=${good.doc.dpi}`);
} catch (err) {
    console.log(`[A] PSD 往返失败：${err.message}`);
}

// —— 路径 D：标记层是空图层（不规范做法，必须被拦住）
let empty = null;
if (good) {
    empty = roundTrip(specLayers(false));
    console.log(`[D] 空标记层：写出 ${empty.bytes} 字节 → 读回后标记层已退化为 0×0（PSD 语义）`);
}

const doc = good?.doc ?? empty?.doc ?? { width: mm(90), height: mm(54), dpi: DPI, layers: specLayers(true) };
const mapped = mapPsdToTemplate(doc);
console.log(`[B] 映射输入：${good ? 'PSD 往返（带像素）' : '降级：直接喂规范化图层树（往返不可用）'}\n`);

// —— 路径 C：命令行传入的真实 PSD
for (const file of process.argv.slice(2)) {
    try {
        const psd = readPsd(readFileSync(file), { useImageData: false });
        const result = mapPsdToTemplate(toDoc(psd));
        console.log(`[C] ${basename(file)}：${result.widthMm}×${result.heightMm}mm（DPI ${psd.imageResources?.resolutionInfo?.horizontalResolution ?? '未知'}）`
            + `｜槽位 ${result.slots.length}（文字 ${result.slots.filter((s) => s.kind === 'text').length}）`
            + `｜刀版 ${result.dielineSvg ? '有' : '无'}｜问题 ${result.issues.length} 条 → ${result.issues.map((i) => i.code).join(', ') || '无'}`);
        if (result.slots.length === 0) console.log('    ⚠ 没识别出槽位：该文件未按命名规范制作，或真实字段形状与映射器假设不符，需要贴出图层树校准');
    } catch (err) {
        console.log(`[C] ${basename(file)} 解析失败：${err.message}`);
    }
}

const textSlots = mapped.slots.filter((s) => s.kind === 'text');
const imageSlots = mapped.slots.filter((s) => s.kind === 'image');
const company = mapped.sceneTemplate.objects.find((o) => o.text === 'Acme Packaging Co.');
const phone = mapped.sceneTemplate.objects.find((o) => o.text === '+1 555 0100');

const checks = [
    ['mm 尺寸（90×54mm @300dpi）', `${mapped.widthMm}×${mapped.heightMm}`, mapped.widthMm === 90 && mapped.heightMm === 54],
    ['出血识别（__bleed__ 外扩 3mm）', `${mapped.bleedMm}mm`, mapped.bleedMm === 3],
    ['安全区识别（__safe__ 内缩 5mm）', `${mapped.safeAreaMm}mm`, mapped.safeAreaMm === 5],
    ['刀版提取且不进印刷层', mapped.dielineSvg ? '有 SVG' : '缺', !!mapped.dielineSvg && !mapped.backgroundLayers.includes('__dieline__')],
    ['文字槽位数量', `${textSlots.length}`, textSlots.length === 2],
    ['图片槽位数量', `${imageSlots.length}`, imageSlots.length === 1],
    ['pt→场景px（12pt 应约 33.87）', `${company?.fontSize}`, !!company && Math.abs(company.fontSize - 33.87) < 0.05],
    ['颜色映射（{r,g,b}→hex）', `${company?.fill} / ${phone?.fill}`, company?.fill === '#121212' && phone?.fill === '#e11d48'],
    ['槽位 mm 位置（左边 8mm）', `${textSlots[0]?.labelMm.left}`, Math.abs((textSlots[0]?.labelMm.left ?? -1) - 8) < 0.05],
    ['未托管字体识别并回退', `${phone?.fontFamily}`, phone?.fontFamily === 'Arial'],
    ['段落对齐保留', `${phone?.textAlign}`, phone?.textAlign === 'center'],
    ['隐藏层跳过并报话', `${mapped.issues.filter((i) => i.code === 'hidden-skipped').length}`, mapped.issues.some((i) => i.code === 'hidden-skipped')],
    ['背景层清单', mapped.backgroundLayers.join(' / '), mapped.backgroundLayers.length >= 3],
];

// —— 回归：空标记层必须明确报错，绝不能静默给出 bleed=0 / safe=27 这类看似合理的错值
if (empty) {
    const badGeo = mapPsdToTemplate(empty.doc);
    const geoErrors = badGeo.issues.filter((i) => i.code === 'layer-no-geometry');
    checks.push(['回归：空图层标记被拦住', `${geoErrors.length} 条 error`, geoErrors.length >= 3]);
    checks.push(['回归：不规范文件不可发布', `${templatePublishable(badGeo)}`, templatePublishable(badGeo) === false]);
}

// —— 反例：文字带图层样式（Fabric 表达不了）
const badEffects = mapPsdToTemplate({
    width: mm(90), height: mm(54), dpi: DPI,
    layers: [
        layer('front', 0, 0, 90, 54, {}, true),
        layer('__text:oops__', 8, 8, 40, 10, {
            text: { text: 'Hi', style: { fontSize: 12, font: { name: 'Arial' } } },
            effects: { dropShadow: { enabled: true } },
        }, true),
    ],
});
checks.push(['反例：文字带图层样式报 error', badEffects.issues.filter((i) => i.level === 'error').map((i) => i.code).join(','), badEffects.issues.some((i) => i.code === 'text-effects')]);
checks.push(['反例：该文件不可发布', `${templatePublishable(badEffects)}`, templatePublishable(badEffects) === false]);

// —— 反例：完全没有槽位 = 死图
const noSlot = mapPsdToTemplate({ width: mm(90), height: mm(54), dpi: DPI, layers: [layer('art', 0, 0, 90, 54, {}, true)] });
checks.push(['反例：零槽位被判不可发布', noSlot.issues.map((i) => i.code).join(','), !templatePublishable(noSlot)]);
checks.push(['正例：规范文件可发布', `${templatePublishable(mapped)}`, templatePublishable(mapped) === true]);

let failed = 0;
for (const [name, got, ok] of checks) {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(28)} → ${got}`);
}

console.log('\nslots：', JSON.stringify(mapped.slots));
console.log('提示：', mapped.issues.map((i) => `${i.level}:${i.code}`).join(', ') || '（无）');
console.log(`\n结果：${checks.length - failed}/${checks.length} 通过${good ? '（含 PSD 字节往返）' : '（无往返）'}`);
if (failed) process.exitCode = 1;
