import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// PDF / AI(内嵌 PDF 兼容流) 事实提取 —— 服务端专用。
//
// 只做「读出现实」，不做任何判断：尺寸、图层、文字、路径、字体。
// 判断（能不能上架、要报什么警告）全部交给 src/lib/ai-template.ts，
// 这样两边都能单独测；导入器、后台审核台、命令行脚本共用同一份提取。
//
// 分工（都是 MIT/Apache，刻意避开 AGPL 的 mupdf）：
//   · pdf-lib     结构层：页框 /OCProperties 图层名 / 字体资源表
//   · pdfjs-dist  内容层：解压 Flate 内容流 → 带坐标的矢量文字与路径
//
// 三条实测硬约束（HANDOFF §5-31/32）：
//   1) 必须给 cMapUrl/cMapPacked/standardFontDataUrl，否则 CJK 子集字体解不出来（文字直接 0 条）
//   2) constructPath 的坐标是 user space，没乘 CTM —— 所以这里只报「有没有路径」，
//      不假装包围盒可用；刀版提取要等 CTM 累加实现后才能上线
//   3) 现代 .ai 只有开了「创建 PDF 兼容文件」才能这样读；老 AI8/9 二进制无解

const PT_TO_MM = 25.4 / 72;

// pdf.js 的中日韩 CMap 与标准字体目录。必须从**包本身**解析位置：
// 拿 import.meta.url 拼相对路径会跟着文件搬家而错（实测在 src/lib/ 里算出 src/node_modules/... 导致 CMap 加载失败、文字直接变 0 条）
const require_ = createRequire(import.meta.url);
const PDF_PKG_ROOT = dirname(dirname(dirname(require_.resolve('pdfjs-dist/legacy/build/pdf.mjs'))));
const CMAP_DIR = join(PDF_PKG_ROOT, 'cmaps') + '/';
const STANDARD_FONT_DIR = join(PDF_PKG_ROOT, 'standard_fonts') + '/';

export type PdfBox = { x: number; y: number; width: number; height: number };
export type PdfTextRun = {
    text: string; layer: string;
    xMm: number; topMm: number;
    /** 文字块实测宽度（PDF 用户空间换算）：映射器拿它做 Textbox 宽度，不靠猜字宽 */
    widthMm: number;
    sizeMm: number; font: string;
};
export type PdfLayer = { name: string; texts: number; paths: number; sample: string };

export type PdfFacts = {
    file: string;
    sha12: string;
    sizeBytes: number;
    pdfVersion: string;
    creator: string;
    producer: string;
    pageCount: number;
    rotate: number;
    boxes: { media: PdfBox | null; crop: PdfBox | null; trim: PdfBox | null; bleed: PdfBox | null; art: PdfBox | null };
    /** 成品线（TrimBox，缺则退 CropBox/MediaBox）换算成 mm */
    widthMm: number;
    heightMm: number;
    /** (BleedBox − TrimBox)/2；四个真实样本全是 0，所以「没出血」是常态不是异常 */
    bleedMm: number;
    /** 成品线原点不在 (0,0) 时坐标要平移；不处理会整体偏移 */
    trimOriginMm: { x: number; y: number };
    layers: PdfLayer[];
    /** 内容流里有没有 BDC/EMC 标记 —— 没有就无法把文字/路径归到图层（样本全中） */
    markedContentTagged: boolean;
    /** OCG 图层名（Illustrator 的图层） */
    ocgNames: string[];
    fonts: string[];
    runs: PdfTextRun[];
    /** 控制码占比 > 30% 的文字条数：子集字体既无 ToUnicode 又无 CMap 时读到的是垃圾 */
    garbledRuns: number;
    vectorPathOps: number;
};

const mm = (pt: number) => +(pt * PT_TO_MM).toFixed(2);

const textOf = (v: unknown): string | undefined => {
    // 上面的 lookup 系列已经解引用，这里不会再拿到 PDFRef；只处理字符串型与名字型
    const s = v as { decodeText?: () => string; asString?: () => string };
    const raw = s?.decodeText?.() ?? s?.asString?.();
    // PDFName 的字符串可能带前导斜杠（/Image），直接比较会全部 miss
    return typeof raw === 'string' ? raw.replace(/^\//, '') : undefined;
};

/** 乱码判定：控制码区占比超 30% 就算读不到（导出给映射器复用，不另写一份规则） */
export const isGarbledText = (s: string) => {
    const chars = [...s];
    if (!chars.length) return false;
    const bad = chars.filter((c) => {
        const cp = c.codePointAt(0) ?? 0;
        return cp < 0x20 || (cp >= 0x7f && cp < 0xa1);
    }).length;
    return bad / chars.length > 0.3;
};

type OcGroup = { id?: number; name?: string; visible?: boolean };

/** 读一个 PDF/AI 文件的全部事实。失败直接抛，由调用方决定怎么记日志 */
export async function readPdfFacts(file: string): Promise<PdfFacts> {
    const bytes = readFileSync(file);
    const sha12 = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const pdfVersion = Buffer.from(bytes.subarray(0, 9)).toString('latin1').match(/%PDF-([\d.]+)/)?.[1] ?? '?';

    // ── 结构层 ────────────────────────────────────────────
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pageDict = doc.getPage(0).node;

    const readBox = (key: string): PdfBox | null => {
        const v = pageDict.lookup(PDFName.of(key));
        return v instanceof PDFArray ? v.asRectangle() : null;
    };
    const boxes = {
        media: readBox('MediaBox'),
        crop: readBox('CropBox'),
        trim: readBox('TrimBox'),
        bleed: readBox('BleedBox'),
        art: readBox('ArtBox'),
    };

    const ocgNames: string[] = [];
    const oc = doc.catalog.lookup(PDFName.of('OCProperties'));
    if (oc instanceof PDFDict) {
        const ocgs = oc.lookup(PDFName.of('OCGs'));
        if (ocgs instanceof PDFArray) {
            for (let i = 0; i < ocgs.size(); i++) {
                const g = ocgs.lookup(i);
                if (!(g instanceof PDFDict)) continue;
                ocgNames.push(textOf(g.lookup(PDFName.of('Name'))) ?? '(unnamed)');
            }
        }
    }

    const fonts: string[] = [];
    const res = pageDict.lookup(PDFName.of('Resources'));
    if (res instanceof PDFDict) {
        const fontDict = res.lookup(PDFName.of('Font'));
        if (fontDict instanceof PDFDict) {
            for (const [, val] of fontDict.entries()) {
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
                if (name) fonts.push(name);
            }
        }
    }

    const trim = boxes.trim ?? boxes.crop ?? boxes.media;
    if (!trim) throw new Error(`${file}: no page box resolvable (Media/Crop/Trim all missing)`);

    // ── 内容层 ────────────────────────────────────────────
    const pdf = await pdfjs
        .getDocument({
            data: new Uint8Array(bytes),
            cMapUrl: CMAP_DIR,
            cMapPacked: true,
            standardFontDataUrl: STANDARD_FONT_DIR,
        })
        .promise;
    const page = await pdf.getPage(1);
    const OPS: Record<string, number> = pdfjs.OPS;

    const layerNameById = new Map<number, string>();
    try {
        const cfg = await pdf.getOptionalContentConfig({ intent: 'display' });
        const loose = cfg as unknown as { getGroups?: () => OcGroup[]; groups?: OcGroup[] };
        const list: OcGroup[] = typeof loose?.getGroups === 'function' ? loose.getGroups() : (loose?.groups ?? []);
        for (const g of list) {
            const id = Number(g?.id);
            if (Number.isFinite(id)) layerNameById.set(id, String(g?.name ?? '(unnamed)'));
        }
    } catch {
        /* 没有 OCG 配置：文字统一归 (no-ocg)，由映射器降级处理 */
    }

    const runs: PdfTextRun[] = [];
    const tc = await page.getTextContent({ includeMarkedContent: true });
    const walkText = (items: unknown[], layer: string) => {
        for (const raw of items ?? []) {
            const it = raw as {
                type?: string; id?: number; items?: unknown[]; str?: string;
                transform?: number[]; fontName?: string; height?: number; width?: number;
            };
            if (it?.type === 'markedContent') {
                walkText(it.items ?? [], layerNameById.get(Number(it.id)) ?? `ocg#${it.id}`);
                continue;
            }
            if (typeof it?.str !== 'string' || !it.str.trim()) continue;
            const t = it.transform ?? [0, 0, 0, 0, 0, 0];
            const sizePt = it.height || Math.abs(t[3]) || Math.hypot(t[1], t[3]);
            runs.push({
                text: it.str,
                layer,
                xMm: mm(t[4] - trim.x),
                // PDF 基线自下而上 → 换成「距成品线顶部」，与设计器坐标同向
                topMm: mm(trim.y + trim.height - t[5]),
                sizeMm: +(sizePt * PT_TO_MM).toFixed(2),
                widthMm: +mm(it.width ?? 0),
                font: it.fontName ?? '',
            });
        }
    };
    walkText(tc.items ?? [], '(no-ocg)');

    let vectorPathOps = 0;
    let markedContentTagged = false;
    try {
        const gstate = await page.getOperatorList();
        for (let i = 0; i < gstate.fnArray.length; i++) {
            const fn = gstate.fnArray[i];
            if (fn === OPS.constructPath) vectorPathOps++;
            else if (fn === OPS.beginMarkedContent || fn === OPS.beginMarkedContentProps) markedContentTagged = true;
        }
    } catch {
        /* 内容流异常：保持已拿到的事实，让映射器按缺失项报警 */
    }

    const layers = new Map<string, PdfLayer>();
    const bump = (name: string, field: 'texts' | 'paths', sample?: string) => {
        const cur = layers.get(name) ?? { name, texts: 0, paths: 0, sample: '' };
        cur[field]++;
        if (sample && !cur.sample) cur.sample = sample.slice(0, 40);
        layers.set(name, cur);
    };
    for (const r of runs) bump(r.layer, 'texts', r.text);
    if (vectorPathOps) bump('(unattributed)', 'paths', '');

    return {
        file,
        sha12,
        sizeBytes: bytes.length,
        pdfVersion,
        creator: doc.getCreator() ?? '',
        producer: doc.getProducer() ?? '',
        pageCount: doc.getPageCount(),
        rotate: (page as unknown as { rotate?: number }).rotate ?? 0,
        boxes,
        widthMm: mm(trim.width),
        heightMm: mm(trim.height),
        bleedMm: boxes.bleed ? +(((boxes.bleed.width - trim.width) / 2) * PT_TO_MM).toFixed(2) : 0,
        trimOriginMm: { x: mm(trim.x), y: mm(trim.y) },
        layers: [...layers.values()],
        markedContentTagged,
        ocgNames,
        fonts,
        runs,
        garbledRuns: runs.filter((r) => isGarbledText(r.text)).length,
        vectorPathOps,
    };
}
