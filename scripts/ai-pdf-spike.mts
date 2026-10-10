// AI/PDF 批量导入 Spike：拿真实的 .ai（内嵌 PDF 兼容流）验证「能不能自动读出图层 + 刀版 + 文字」。
//
// 两家库各管一段（都是 MIT/Apache，避开 AGPL 的 mupdf）：
//   · pdf-lib     → 结构层：页框（Trim/Bleed/Crop/Media）、/OCProperties 图层名、字体资源表
//   · pdfjs-dist  → 内容层：解压 Flate 内容流，拿到带坐标的矢量文字与路径，以及它们所属的 OCG
//
// 用法：node --experimental-strip-types scripts/ai-pdf-spike.mjs ["Test file/包装盒.ai"]
// 输出：控制台只打 ASCII（PowerShell 中文会乱码，见 HANDOFF §5），完整报告写 scripts/out/<sha12>-ai-report.json
//
// 这是 spike 不是产品代码：目的是把「AI 路线能自动化到什么程度、卡在哪」变成可核对的数字。

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const PT_TO_MM = 25.4 / 72;
const target = process.argv[2] ?? 'Test file/包装盒.ai';

/** 控制台安全输出：非 ASCII 一律转义。
 * 注意不能用 JSON.stringify 了事 —— 它只转义控制字符，中文会原样输出，
 * 经 PowerShell 管道就变乱码（实测踩过：包装盒.ai 打印成 镀呰鐩?ai）。 */
const ascii = (s: unknown) =>
    '"' +
    String(s).replace(/[^\x20-\x7e]/g, (c) => `\\u${(c.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`) +
    '"';
const mm = (pt: number) => +(pt * PT_TO_MM).toFixed(2);

/** 与 pdf-lib 的 PDFArray.asRectangle() 返回结构一致，省掉手工归一 min/max */
type Box = { x: number; y: number; width: number; height: number };

// ── ① 结构层：pdf-lib ────────────────────────────────────────
const bytes = readFileSync(target);
const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const header = Buffer.from(bytes.subarray(0, 9)).toString('latin1').match(/%PDF-([\d.]+)/)?.[1] ?? '?';
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const catalog = doc.catalog;

const readBox = (dict: PDFDict | undefined, key: string): Box | null => {
    if (!dict) return null;
    const v = dict.lookup(PDFName.of(key));
    return v instanceof PDFArray ? v.asRectangle() : null;
};

/** 页框：TrimBox 是成品线（设计器画布就该等于它），BleedBox 给出血量 */
function pageBoxes(pageIndex: number) {
    const d = doc.getPage(pageIndex).node;
    return {
        media: readBox(d, 'MediaBox'),
        crop: readBox(d, 'CropBox'),
        trim: readBox(d, 'TrimBox'),
        bleed: readBox(d, 'BleedBox'),
        art: readBox(d, 'ArtBox'),
    };
}

const textOf = (v: unknown): string | undefined => {
    if (v instanceof PDFRef) return textOf(doc.context.lookup(v));
    if (v instanceof PDFDict) return undefined;
    const s = v as { decodeText?: () => string; asString?: () => string };
    const raw = s?.decodeText?.() ?? s?.asString?.();
    // PDFName 的字符串带前导斜杠（/Image），直接比较会全部 miss（实测踩过）
    return typeof raw === 'string' ? raw.replace(/^\//, '') : undefined;
};

/** /OCProperties/OCGs → Illustrator 图层（名字可能是 UTF-16，decodeText 处理） */
function optionalGroups() {
    const out: { name: string; intent: string }[] = [];
    const oc = catalog.lookup(PDFName.of('OCProperties'));
    if (!(oc instanceof PDFDict)) return out;
    const ocgs = oc.lookup(PDFName.of('OCGs'));
    if (!(ocgs instanceof PDFArray)) return out;
    for (let i = 0; i < ocgs.size(); i++) {
        const g = ocgs.lookup(i);
        if (!(g instanceof PDFDict)) continue;
        out.push({
            name: textOf(g.lookup(PDFName.of('Name'))) ?? '(unnamed)',
            intent: textOf(g.lookup(PDFName.of('Intent'))) ?? 'View',
        });
    }
    return out;
}

/** 页面字体资源表：BaseFont 名字是「商业字体风险」的直接依据 */
function pageFonts(pageIndex: number) {
    const out: string[] = [];
    const res = doc.getPage(pageIndex).node.lookup(PDFName.of('Resources'));
    if (!(res instanceof PDFDict)) return out;
    const fonts = res.lookup(PDFName.of('Font'));
    if (!(fonts instanceof PDFDict)) return out;
    for (const [, val] of fonts.entries()) {
        const f = val instanceof PDFRef ? doc.context.lookup(val) : val;
        if (!(f instanceof PDFDict)) continue;
        let name = textOf(f.lookup(PDFName.of('BaseFont')));
        if (!name) {
            const desc = f.lookup(PDFName.of('DescendantFonts'));
            if (desc instanceof PDFArray && desc.size() > 0) {
                const d0 = desc.lookup(0);
                if (d0 instanceof PDFDict) name = textOf(d0.lookup(PDFName.of('BaseFont')));
            }
        }
        if (name) out.push(name);
    }
    return out;
}

/** 全局图片统计：不依赖页面 Resources（Form XObject 自带资源，只看页级会漏掉全部）。
 * 背景能不能“归并成一张图”、导入后会不会把场景 JSON 撑爆，都取决于这些数字。 */
function allImages() {
    const out: { w: number; h: number; bpc: number; cs: string }[] = [];
    try {
        for (const [, obj] of doc.context.enumerateIndirectObjects()) {
            if (!(obj instanceof PDFDict)) continue;
            const subtype = textOf(obj.lookup(PDFName.of('Subtype')));
            if (subtype !== 'Image') continue;
            const n = (k: string) => (obj.lookup(PDFName.of(k)) as { asNumber?: () => number } | undefined)?.asNumber?.();
            out.push({ w: n('Width') ?? 0, h: n('Height') ?? 0, bpc: n('BitsPerComponent') ?? 0, cs: textOf(obj.lookup(PDFName.of('ColorSpace'))) ?? '?' });
        }
    } catch (e) {
        console.log('WARN enumerateIndirectObjects failed:', ascii((e as Error).message));
    }
    return out;
}
const images = allImages();
const imageMPix = images.reduce((n, im) => n + im.w * im.h, 0);

const boxes = pageBoxes(0);
const groups = optionalGroups();
const fontRes = pageFonts(0);

/** XObject 资源表：区分「真矢量」与「置入的位图」——决定背景能不能自动归并成一张图 */
function pageXObjects(pageIndex: number) {
    const out: { name: string; subtype: string; w?: number; h?: number; filter?: string; bbox?: number[] }[] = [];
    const res = doc.getPage(pageIndex).node.lookup(PDFName.of('Resources'));
    if (!(res instanceof PDFDict)) return out;
    const xo = res.lookup(PDFName.of('XObject'));
    if (!(xo instanceof PDFDict)) return out;
    for (const [key, val] of xo.entries()) {
        const d = val instanceof PDFRef ? doc.context.lookup(val) : val;
        if (!(d instanceof PDFDict)) continue;
        const subtype = textOf(d.lookup(PDFName.of('Subtype')));
        const w = d.lookup(PDFName.of('Width'));
        const h = d.lookup(PDFName.of('Height'));
        const num = (v: unknown) => (v as { asNumber?: () => number } | undefined)?.asNumber?.();
        const bbox = d.lookup(PDFName.of('BBox'));
        out.push({
            name: textOf(key) ?? '?',
            subtype: subtype ?? '?',
            w: num(w),
            h: num(h),
            filter: textOf(d.lookup(PDFName.of('Filter'))),
            bbox: bbox instanceof PDFArray
                ? Array.from({ length: bbox.size() }, (_, i) => mm(bbox.lookup(i, PDFNumber).asNumber()))
                : undefined,
        });
    }
    return out;
}
const xobjects = pageXObjects(0);
const trim = boxes.trim ?? boxes.crop ?? boxes.media;
if (!trim) {
    console.log('FATAL no page box resolvable (Media/Crop/Trim all missing)');
    process.exit(1);
}

// ── ② 内容层：pdfjs-dist ─────────────────────────────────────
/** pdf.js 类型暴光不全的图层条目，自己定形状（不用 any） */
type OcGroup = { id?: number; name?: string; visible?: boolean };
// 不写 any 注解：pdfjs-dist v6 自带类型，让它自己推
// cMapUrl / standardFontDataUrl 重注：不给它们，CJK 子集字体解不出来
// （实测：牙签旗.ai 报 “Ensure that the `cMapUrl` API parameter is provided.” 然后 TEXT runs=0）
const PDF_ASSETS = new URL('../node_modules/pdfjs-dist/', import.meta.url);
const pdf = await pdfjs
    .getDocument({
        data: new Uint8Array(bytes),
        cMapUrl: new URL('cmaps/', PDF_ASSETS).pathname.replace(/^\/(\w:)/i, '$1'),
        cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', PDF_ASSETS).pathname.replace(/^\/(\w:)/i, '$1'),
    })
    .promise;
const page = await pdf.getPage(1);
const OPS: Record<string, number> = pdfjs.OPS;

/** OCG id → 图层名（pdf.js 的 markedContent id 用它自己的编号，必须按 name 表映射） */
const layerNameById = new Map<number, string>();
let ocGroups: { id: number; name: string; visible: boolean }[] = [];
try {
    const cfg = await pdf.getOptionalContentConfig({ intent: 'display' });
    // 类型定义没暴光 groups（实测 getGroups() 与 .groups 两种形态都可能存在），窄转后兼容
    const loose = cfg as unknown as { getGroups?: () => OcGroup[]; groups?: OcGroup[] };
    const list: OcGroup[] = typeof loose?.getGroups === 'function' ? loose.getGroups() : (loose?.groups ?? []);
    ocGroups = list.map((g) => ({ id: Number(g?.id), name: String(g?.name ?? '(unnamed)'), visible: g?.visible !== false }));
    for (const g of ocGroups) layerNameById.set(g.id, g.name);
} catch (e) {
    console.log('WARN optionalContentConfig failed:', ascii((e as Error).message));
}

type TextRun = { text: string; layer: string; xMm: number; topMm: number; sizeMm: number; font: string };
const runs: TextRun[] = [];
const tc = await page.getTextContent({ includeMarkedContent: true });

const walkText = (items: unknown[], layer: string) => {
    for (const raw of items ?? []) {
        const it = raw as {
            type?: string; id?: number; items?: unknown[]; str?: string;
            transform?: number[]; fontName?: string; height?: number;
        };
        if (it?.type === 'markedContent') {
            walkText(it.items ?? [], layerNameById.get(Number(it.id)) ?? `ocg#${it.id}`);
            continue;
        }
        if (typeof it?.str !== 'string' || !it.str.trim()) continue;
        const t = it.transform ?? [0, 0, 0, 0, 0, 0];
        const sizePt = it.height || Math.abs(t[3]) || Math.hypot(t[1], t[3]);
        runs.push({
            text: it.str.slice(0, 40),
            layer,
            xMm: mm(t[4] - trim.x),
            topMm: mm(trim.y + trim.height - t[5]), // PDF 基线自下而上 → 换成「距成品线顶部」
            sizeMm: +(sizePt * PT_TO_MM).toFixed(2),
            font: it.fontName ?? '',
        });
    }
};
walkText(tc.items ?? [], '(no-ocg)');

// ── ③ 路径层：内容流里的矢量路径归到哪个图层（刀版能否自动提取的关键） ──
type PathHit = { layer: string; points: number; x0: number; y0: number; x1: number; y1: number };
const paths: PathHit[] = [];
const opHistogram: Record<string, number> = {};
/** 取证用：把 constructPath 的参数结构原样记下来（历次猜错的地方） */
const pathArgShape: string[] = [];
try {
    const gstate = await page.getOperatorList();
    const stack: string[] = [];
    const opName: Record<number, string> = {};
    for (const [k, v] of Object.entries(OPS)) opName[Number(v)] = k;
    for (let i = 0; i < gstate.fnArray.length; i++) {
        const fn = gstate.fnArray[i];
        const args = gstate.argsArray[i];
        opHistogram[opName[fn] ?? `op#${fn}`] = (opHistogram[opName[fn] ?? `op#${fn}`] ?? 0) + 1;
        if (fn === OPS.beginMarkedContent) {
            stack.push(layerNameById.get(Number(args?.[0])) ?? `ocg#${args?.[0]}`);
        } else if (fn === OPS.endMarkedContent) {
            stack.pop();
        } else if (fn === OPS.constructPath) {
            if (pathArgShape.length < 3) {
                pathArgShape.push(
                    `argsType=${args?.constructor?.name} len=${args?.length} ` +
                    `a0=${args?.[0]?.constructor?.name}:${args?.[0]?.length} ` +
                    `a1=${args?.[1]?.constructor?.name}:${args?.[1]?.length} ` +
                    `a2=${typeof args?.[2]} head=${JSON.stringify(Array.prototype.slice.call(args?.[1] ?? [], 0, 8))}`,
                );
            }
            // args 结构（pdf.js v6 实测）= [Number, [TypedArray(coords)], Object]，
            // 坐标在 **args[1][0]**（不是 args[1]）；早期按 args[1] 取导致 608 条路径全部当成 0。
            const raw = (Array.isArray(args?.[1]) ? args[1][0] : args?.[1]) as ArrayLike<number> | undefined;
            const coords = raw && typeof (raw as { length?: number }).length === 'number' ? raw : null;
            if (!coords || coords.length < 2) continue;
            const xs: number[] = [], ys: number[] = [];
            for (let j = 0; j + 1 < coords.length; j += 2) {
                if (Number.isFinite(coords[j])) xs.push(coords[j]);
                if (Number.isFinite(coords[j + 1])) ys.push(coords[j + 1]);
            }
            if (!xs.length || !ys.length) continue;
            paths.push({
                layer: stack[stack.length - 1] ?? '(no-ocg)',
                points: xs.length,
                x0: mm(Math.min(...xs) - trim.x),
                y0: mm(trim.y + trim.height - Math.max(...ys)),
                x1: mm(Math.max(...xs) - trim.x),
                y1: mm(trim.y + trim.height - Math.min(...ys)),
            });
        }
    }
} catch (e) {
    console.log('WARN getOperatorList failed:', ascii((e as Error).message));
}

// ── ④ 汇总：直接回答「能不能自动成模板」 ──────────────────────
const byLayer = new Map<string, { texts: number; paths: number; sample: string }>();
const bump = (layer: string, field: 'texts' | 'paths', sample?: string) => {
    const cur = byLayer.get(layer) ?? { texts: 0, paths: 0, sample: '' };
    cur[field]++;
    if (sample) cur.sample = sample;
    byLayer.set(layer, cur);
};
for (const r of runs) bump(r.layer, 'texts', r.text);
for (const p of paths) bump(p.layer, 'paths');

const dieLike = [...byLayer.keys()].filter((n) => /die|cut|knife|刀|模切|contour/i.test(n));
const bleedMm = boxes.bleed ? +(((boxes.bleed.width - trim.width) / 2) * PT_TO_MM).toFixed(2) : null;
const outside = (r: TextRun) => r.xMm < -0.5 || r.topMm < -0.5 || r.xMm > mm(trim.width) + 0.5 || r.topMm > mm(trim.height) + 0.5;
const outOfTrim = runs.filter(outside);

/** 乱码判定：子集字体既无 ToUnicode 又无 CMap 时，pdf.js 会回回控制码区的字符。
 * 导入器必须能区分“读到文字”与“读到垃圾”，不能把乱码当文案入库。 */
const garbled = (s: string) => {
    const chars = [...s];
    if (!chars.length) return false;
    const bad = chars.filter((c) => {
        const cp = c.codePointAt(0) ?? 0;
        return cp < 0x20 || (cp >= 0x7f && cp < 0xa1);
    }).length;
    return bad / chars.length > 0.3;
};
const garbledRuns = runs.filter((r) => garbled(r.text)).length;
const readableRatio = runs.length ? +((runs.length - garbledRuns) / runs.length).toFixed(2) : 1;

const report = {
    file: target,
    sha12: sha,
    sizeMB: +(bytes.length / 1024 / 1024).toFixed(2),
    pdfVersion: header,
    producer: doc.getProducer(),
    creator: doc.getCreator(),
    pageCount: doc.getPageCount(),
    // 页面旋转：A4 竖版上出现跳至 297mm 的路径就是 Rotate 在作怪，不处理会导致坐标整体错位
    pageRotate: (page as unknown as { rotate?: number }).rotate ?? doc.getPage(0).getRotation().angle,
    boxesPt: boxes,
    derived: {
        widthMm: mm(trim.width),
        heightMm: mm(trim.height),
        bleedMm,
        // 成品线原点不在 (0,0) 时所有坐标必须平移 —— 导入器漏这一步会整体偏移
        trimOriginMm: { x: mm(trim.x), y: mm(trim.y) },
    },
    ocGroups: { pdfLib: groups, pdfJs: ocGroups },
    fonts: fontRes,
    xobjects,
    images: { count: images.length, megaPixels: +(imageMPix / 1e6).toFixed(2), sample: images.slice(0, 10) },
    operatorHistogram: opHistogram,
    pathArgShape,
    textRuns: { total: runs.length, sample: runs.slice(0, 20), outsideTrim: outOfTrim.length, garbled: garbledRuns, readableRatio },
    vectorPaths: { total: paths.length, sample: paths.slice(0, 20) },
    layers: [...byLayer.entries()].map(([layer, v]) => ({ layer, ...v })),
    verdict: {
        hasTrimBox: !!boxes.trim,
        hasBleedBox: !!boxes.bleed,
        editableTextFound: runs.length > 0,
        // 矢量路径以内容流直方图为准（op 计数），unpacked 只是能安全解析出包围盒的那部分
        vectorPathOps: opHistogram.constructPath ?? 0,
        vectorPathFound: (opHistogram.constructPath ?? 0) > 0,
        layerCount: byLayer.size,
        dielineLayerByName: dieLike,
        // 内容流里有没有 BDC/EMC 标记：没有的话「图层归属」根本无从谈起
        markedContentTagged: (opHistogram.beginMarkedContent ?? 0) > 0,
        rasterOnly: (opHistogram.constructPath ?? 0) === 0 && xobjects.some((x) => x.subtype === 'Image'),
        publishableDraft: runs.length > 0 && !!boxes.trim,
        // 文字可读比例低于 0.6 就不该自动上架（子集字体无 ToUnicode/CMap 时读到的是垃圾）
        textReadable: runs.length > 0 && readableRatio >= 0.6,
    },
};

mkdirSync('scripts/out', { recursive: true });
const outFile = `scripts/out/${sha}-ai-report.json`;
writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

console.log(`FILE            ${ascii(target.split(/[\\/]/).pop() ?? target)} sizeMB=${report.sizeMB} sha12=${sha} pages=${report.pageCount}`);
console.log(`PDF             version=%PDF-${header} rotate=${report.pageRotate} producer=${ascii(doc.getProducer() ?? '')}`);
console.log(`CREATOR         ${ascii(doc.getCreator() ?? '')}`);
console.log(`BOX pt          trim=${JSON.stringify(boxes.trim)} bleed=${JSON.stringify(boxes.bleed)}`);
console.log(`BOX pt          crop=${JSON.stringify(boxes.crop)} media=${JSON.stringify(boxes.media)}`);
console.log(`DERIVED         ${report.derived.widthMm}x${report.derived.heightMm}mm bleed=${report.derived.bleedMm}mm origin=(${report.derived.trimOriginMm.x},${report.derived.trimOriginMm.y})`);
console.log(`OC GROUPS       pdfLib=${groups.length} pdfJs=${ocGroups.length}`);
for (const g of groups.slice(0, 30)) console.log(`  - ${ascii(g.name)} intent=${g.intent}`);
console.log(`FONTS           ${fontRes.length}`);
for (const f of fontRes.slice(0, 30)) console.log(`  - ${ascii(f)}`);
console.log(`XOBJECTS(page)  ${xobjects.length}`);
for (const x of xobjects.slice(0, 15)) console.log(`  - ${ascii(x.name)} ${x.subtype} ${x.w ?? '-'}x${x.h ?? '-'}px filter=${x.filter ?? '-'} bbox=${JSON.stringify(x.bbox ?? null)}`);
console.log(`IMAGES(all)     count=${images.length} megaPixels=${+(imageMPix / 1e6).toFixed(2)}`);
for (const im of images.slice(0, 10)) console.log(`  - ${im.w}x${im.h} bpc=${im.bpc} cs=${ascii(im.cs)}`);
console.log(`OPS             ${JSON.stringify(opHistogram)}`);
for (const s of pathArgShape) console.log(`PATH-ARG-SHAPE  ${s}`);
console.log(`TEXT            runs=${runs.length} outsideTrim=${outOfTrim.length} garbled=${garbledRuns} readable=${report.textRuns.readableRatio}`);
for (const r of runs.slice(0, 20)) console.log(`  [${ascii(r.layer)}] ${ascii(r.text)} @${r.xMm},${r.topMm} size=${r.sizeMm}mm font=${r.font}`);
console.log(`PATHS           unpacked=${paths.length} of ops=${opHistogram.constructPath ?? 0}`);
for (const p of paths.slice(0, 12)) console.log(`  [${ascii(p.layer)}] pts=${p.points} box=(${p.x0},${p.y0})-(${p.x1},${p.y1})mm`);
console.log(`LAYERS          ${byLayer.size}`);
for (const [l, v] of byLayer) console.log(`  ${ascii(l)} texts=${v.texts} paths=${v.paths} sample=${ascii(v.sample.slice(0, 20))}`);
console.log(`VERDICT         ${JSON.stringify(report.verdict)}`);
console.log(`REPORT          ${outFile}`);
