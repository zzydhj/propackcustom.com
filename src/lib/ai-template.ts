import type { PdfFacts } from './pdf-facts.ts';
import { isGarbledText } from './pdf-facts.ts';
import { px } from './scene-units.ts';
import { slugify, sizeToken } from './template-slug.ts';

// AI / PDF → DesignTemplate 的**纯映射契约**（不碰 IO、不碰数据库、不碰 pdfjs）。
//
// 输入是 src/lib/pdf-facts.ts 提取到的事实，输出是一份「可审核的模板草稿」+ 一份问题清单。
// 为什么要拆两层：提取只负责「文件里有什么」，这里只负责「能不能自动上架、要人看什么」。
// 命令行导入器、后台审核台、以后的 worker 都复用这一份判定，避免规则各写一遍。
//
// 判定依据全部来自四个真实样本的实测（HANDOFF §6A）：
//   · 四个文件 TrimBox == BleedBox == CropBox == MediaBox → 「没出血」是常态，补默认值并警告
//   · 四个文件内容流都没有 BDC/EMC 标记 → 图层归属做不到，草稿只能靠文字位置
//   · 一个文件 70% 文字是乱码（子集字体无 ToUnicode/CMap）→ 必须能识别并拒绝自动上架
//   · 一个文件成品线 2265mm（10:1 放大稿）→ 尺寸区间要拦
//   · 字体出现 微软雅黑/等线（商业）与阿里巴巴普惠体（免费商用）→ 要白名单，不能一律回退

/** 源文件没带 BleedBox 时补的默认出血（与 DesignTemplate 的库默认一致） */
export const DEFAULT_BLEED_MM = 3;
export const DEFAULT_SAFE_MM = 3;

/** 成品尺寸合理区间：超出就要求人工确认，不静默入库 */
const MIN_SIDE_MM = 10;
const MAX_SIDE_MM = 1200;

/** 可读文字比例低于此值 → 不自动上架（读到的是垃圾，不是文案） */
const MIN_READABLE_RATIO = 0.6;

/** 可商用/可再分布字体白名单（比对前去掉子集前缀 XXXXXX+ 与非字母字符） */
const FONT_ALLOWLIST = [
    'alibabapuhuiti', 'notosans', 'notoserif', 'arial', 'helvetica', 'inter',
    'roboto', 'opensans', 'lato', 'sourcesans', 'dejavu', 'liberation', 'freesans',
];

/** 草稿里统一使用的可嵌入字体（源字体不可用时回退到它） */
export const FALLBACK_FONT = 'Arial';

/** 导入后的成品分辨率（只作为元数据记录，供缩略图/位图渲染用） */
const TARGET_DPI = 300;

export type ImportIssue = { level: 'error' | 'warning'; code: string; message: string };

export type ImportSlot = {
    key: string;
    kind: 'text';
    /** 给审核人看的标签（取原文前若干字） */
    label: string;
    defaultText: string;
    xMm: number;
    /** 文字框顶边（已把 PDF 基线换算成框顶，见下） */
    topMm: number;
    widthMm: number;
    fontSizeMm: number;
    font: string;
    /** 源字体不在白名单时记录原名，供人工决定要不要买授权 */
    sourceFontUnknown?: boolean;
};

/** Fabric 对象的属性集合：只用 JSON 安全类型，保证能直接写进 Prisma 的 Json 列 */
export type SceneObject = Record<string, string | number | boolean>;

export type AiTemplateDraft = {
    slug: string;
    name: string;
    productType: string;
    widthMm: number;
    heightMm: number;
    bleedMm: number;
    safeAreaMm: number;
    fullBleed: boolean;
    slots: ImportSlot[];
    /** Fabric 场景 JSON（可直接塞 DesignTemplate.sceneTemplate） */
    sceneTemplate: { version: string; objects: SceneObject[] };
    tags: string[];
    sourceHash: string;
    sourceKey?: string;
    widthPx: number;
    heightPx: number;
    dpi: number;
    issues: ImportIssue[];
    /** 没有 error 级问题才算可发布；批量导入时 false 的行一律 active=false */
    publishable: boolean;
};

const fontKey = (name: string) =>
    name.replace(/^[A-Z]{6}\+/i, '').replace(/[^a-z]/gi, '').toLowerCase();

const isAllowlistedFont = (name: string) => FONT_ALLOWLIST.some((f) => fontKey(name).includes(f));

/** 去掉扩展名与「_复制 / copy」这类噪声，作为模板名基座 */
function baseName(file: string): string {
    const bare = file.split(/[\\/]/).pop() ?? file;
    return bare
        .replace(/\.[^.]+$/, '')
        .replace(/[_\s-]*(复制|副本|拷贝|copy|final|终稿|改|v\d+)\s*$/gi, '')
        .trim() || bare;
}

/**
 * 把 PDF/AI 事实映射成模板草稿。
 *
 * 注意两处刻意的「不精确」，都因为源文件信息不足，只能靠人工审核补：
 * 1) PDF 给的是**基线** y，而 Fabric Textbox 要的是框顶 —— 这里按 0.8×字号估算上移，
 *    不同字体的 ascent 差异会带来 ±0.3mm 级偏移。
 * 2) pdf.js 的 run.fontName 是资源名（g_d0_f1），不是真实字体名，所以字体白名单只能
 *    按**整页字体表**判，落到具体某个文字块时统一用 FALLBACK_FONT。
 */
export function mapPdfToTemplate(
    facts: PdfFacts,
    opts: { productType: string; nameHint?: string; sourceKey?: string },
): AiTemplateDraft {
    const issues: ImportIssue[] = [];

    const push = (level: ImportIssue['level'], code: string, message: string) =>
        issues.push({ level, code, message });

    // ── 尺寸与出血 ─────────────────────────────────────
    if (!facts.boxes.trim) {
        push('warning', 'no-trim-box', '文件没有 TrimBox，成品尺寸取自 CropBox/MediaBox，需人工核对是否等于真实裁切线');
    }
    if (facts.widthMm < MIN_SIDE_MM || facts.heightMm < MIN_SIDE_MM || facts.widthMm > MAX_SIDE_MM || facts.heightMm > MAX_SIDE_MM) {
        push('error', 'size-out-of-range', `成品尺寸 ${facts.widthMm}×${facts.heightMm}mm 超出 ${MIN_SIDE_MM}–${MAX_SIDE_MM}mm 合理区间（疑似放大稿或多联大版），不能自动入库`);
    }
    if (facts.rotate % 360 !== 0) {
        push('error', 'page-rotated', `页面带 ${facts.rotate}° 旋转，坐标换算本期未处理，导入结果会整体错位`);
    }
    if (facts.pageCount > 1) {
        push('warning', 'multi-page', `共 ${facts.pageCount} 页，只取了第 1 页；其余页需分别导入`);
    }
    const bleedMm = facts.bleedMm > 0 ? facts.bleedMm : DEFAULT_BLEED_MM;
    if (facts.bleedMm <= 0) {
        push('warning', 'no-bleed', `文件未声明 BleedBox（四个真实样本都如此），已按默认 ${DEFAULT_BLEED_MM}mm 补；满版稿需人工确认背景是否铺到出血`);
    }

    // ── 图层 ───────────────────────────────────────────
    if (!facts.markedContentTagged) {
        push('warning', 'no-layer-marked-content',
            `内容流没有 BDC/EMC 标记（OCG 声明了 ${facts.ocgNames.length} 个图层），文字与路径无法归层 → 背景/刀版不能自动分离，草稿只放文字槽位`);
    }
    if (facts.vectorPathOps > 0) {
        push('warning', 'vector-paths-not-imported',
            `检测到 ${facts.vectorPathOps} 条矢量路径，但坐标未做 CTM 累加，本期不导入背景与刀版（见 HANDOFF §5-32）`);
    }
    // 注：不再根据 Producer 判定“文件被第三方工具重写过”。实测两个 Adobe 直出文件也会被
    // pdf-lib 的 getProducer() 报成 "pdf-lib"，那个信号根本不成立（现已改为从字节读真实值）。

    // ── 文字 ───────────────────────────────────────────
    const readable = facts.runs.filter((r) => !isGarbledText(r.text));
    const ratio = facts.runs.length ? readable.length / facts.runs.length : 0;
    if (facts.garbledRuns > 0) {
        push(ratio < MIN_READABLE_RATIO ? 'error' : 'warning', 'text-garbled',
            `${facts.garbledRuns}/${facts.runs.length} 条文字读不出（子集字体既无 ToUnicode 也无 CMap），可读比例 ${ratio.toFixed(2)}`);
    }
    if (readable.length === 0) {
        push('error', 'no-editable-text', '一个可编辑文字块都没有 → 导进去就是一张死图，不构成模板');
    }
    const unknownFonts = [...new Set(facts.fonts.filter((f) => !isAllowlistedFont(f)))];
    if (unknownFonts.length) {
        push('warning', 'font-not-allowlisted',
            `以下字体不在可商用白名单：${unknownFonts.join(', ')}；草稿文字统一回退 ${FALLBACK_FONT}，要保留原字体需买授权或子集化`);
    }

    // ── 槽位与场景 ─────────────────────────────────────
    const safe = DEFAULT_SAFE_MM;
    const used = new Set<string>();
    const slots: ImportSlot[] = [];
    const objects: SceneObject[] = [];
    let outsideSafe = 0;

    readable.forEach((r, i) => {
        let key = slugify(r.text).slice(0, 24) || `text-${i + 1}`;
        for (let n = 2; used.has(key); n++) key = `text-${i + 1}-${n}`;
        used.add(key);

        // PDF 的 y 是基线；Fabric Textbox 的 top 是框顶。按 0.8×字号上移（近似 ascent）
        const topMm = Math.max(0, +(r.topMm - r.sizeMm * 0.8).toFixed(2));
        const widthMm = Math.max(r.sizeMm, r.widthMm || r.sizeMm * Math.max(1, [...r.text].length));
        if (r.xMm < safe || topMm < safe || r.xMm + widthMm > facts.widthMm - safe || topMm + r.sizeMm > facts.heightMm - safe) outsideSafe++;

        const slot: ImportSlot = {
            key,
            kind: 'text',
            label: r.text.slice(0, 28),
            defaultText: r.text,
            xMm: r.xMm,
            topMm,
            widthMm: +widthMm.toFixed(2),
            fontSizeMm: r.sizeMm,
            font: FALLBACK_FONT,
            sourceFontUnknown: unknownFonts.length > 0,
        };
        slots.push(slot);

        objects.push({
            type: 'textbox',
            originX: 'left',
            originY: 'top',
            left: px(slot.xMm),
            top: px(slot.topMm),
            width: px(slot.widthMm),
            fontSize: px(slot.fontSizeMm),
            fontFamily: FALLBACK_FONT,
            fontWeight: 'normal',
            fill: '#111111',
            text: slot.defaultText,
            textAlign: 'left',
            // name 会随 toObject(['name','locked']) 持久化，图层面板与引导页都靠它认字段
            name: slot.key,
            locked: false,
        });
    });

    if (outsideSafe > 0) {
        push('warning', 'text-outside-safe', `${outsideSafe} 个文字块落在安全区边缘内，进设计器会直接吃 Pre-flight 警告，需要人工挪位`);
    }

    const base = opts.nameHint ?? baseName(facts.file);
    const baseSlug = slugify(base);
    const size = sizeToken(Math.round(facts.widthMm), Math.round(facts.heightMm)); // 128x148mm
    const name = `${base} · ${Math.round(facts.widthMm)}×${Math.round(facts.heightMm)}mm`; // 展示用 × 号
    // slugify 会把中文全部剥掉（实测：广耀眼镜标.ai 的 slug 成了 128-148mm），
    // 所以 slug = [拉丁名|imported, 尺寸, 源指纹前 6 位]：确定、ASCII、不靠人现想
    const slug = slugify([baseSlug || 'imported', size, `ai${facts.sha12.slice(0, 6)}`].join('-'));
    if (!baseSlug) {
        push('warning', 'non-latin-name',
            `模板名「${base}」没有拉丁字符，slug 退化为 imported-…；本站只英文，上架前应改个英文名`);
    }

    const publishable = !issues.some((it) => it.level === 'error');

    return {
        slug,
        name,
        productType: opts.productType,
        widthMm: facts.widthMm,
        heightMm: facts.heightMm,
        bleedMm,
        safeAreaMm: safe,
        // 草稿没有背景图层（图层分离做不到），所以不能标满版 —— 标了会一打开就报「会露白底」
        fullBleed: false,
        slots,
        sceneTemplate: { version: '6.7.0', objects },
        tags: ['imported:pdf', publishable ? 'needs-review:artwork' : 'blocked'],
        sourceHash: facts.sha12,
        sourceKey: opts.sourceKey,
        widthPx: Math.round((facts.widthMm / 25.4) * TARGET_DPI),
        heightPx: Math.round((facts.heightMm / 25.4) * TARGET_DPI),
        dpi: TARGET_DPI,
        issues,
        publishable,
    };
}
