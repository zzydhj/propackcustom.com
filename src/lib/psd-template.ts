// PSD → Design Studio 模板的映射契约（纯函数，不依赖 ag-psd、不做像素合成）。
//
// 输入是解析器（ag-psd / psd-tools / Photoshop action 都行）给出的规范化图层树，
// 输出直接落进 DesignTemplate：widthMm/heightMm/bleedMm/safeAreaMm/dielineSvg/sceneTemplate，
// 外加 slots（给「快速定制」引导式编辑用）与 issues（给后台审核台判合格）。
//
// 尺寸口径（最容易静默出错的地方，集中在这里）：
//   PSD 画布 = 成品尺寸（trim），像素按文档 DPI 计量；
//   我们的场景像素 = 1mm = PX_PER_MM(8) px，等效 203.2 dpi；
//   PSD 文字字号单位是点（1pt = 1/72 inch），Fabric 的 fontSize 是场景像素。
const MM_PER_INCH = 25.4;
export const SCENE_PX_PER_MM = 8; // 与 useFabricCanvas.PX_PER_MM 保持一致
export const SCENE_DPI = SCENE_PX_PER_MM * MM_PER_INCH; // 203.2

/** PSD 文档 DPI 缺失时的兜底（印刷交付惯例） */
export const FALLBACK_DPI = 300;

/** 我们后台托管的字体；不在表内的一律报 issue，交给审核人决定替换还是收权 */
export const HOSTED_FONTS = [
    'Arial', 'Helvetica', 'Verdana', 'Georgia', 'Times New Roman',
    'Courier New', 'Impact', 'Trebuchet MS',
];

export type PsdLayer = {
    name: string;
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    hidden?: boolean;
    blendMode?: string;
    children?: PsdLayer[];
    /** 文字层才有的字段（ag-psd 的 LayerTextData 子集） */
    text?: {
        text?: string;
        /** ag-psd 里 fillColor 直接是 {r,g,b}（0-255），旧数据也见过 0-1 数组 */
        style?: { fontSize?: number; font?: { name?: string }; fillColor?: { r?: number; g?: number; b?: number } | number[] };
        paragraphStyle?: { justification?: string };
    };
    /** 图层样式（描边/发光/浮雕…）：Fabric 表达不了，见到就必须拦下来人工确认 */
    effects?: unknown;
    mask?: unknown;
};

export type PsdDoc = {
    width: number;
    height: number;
    dpi?: number;
    layers: PsdLayer[];
    /** 专色通道名（刀版常用专色承载） */
    spotNames?: string[];
};

export type Slot = {
    key: string;
    kind: 'text' | 'image';
    labelMm: { left: number; top: number; width: number; height: number };
    placeholder?: string;
    fontFamily?: string;
    fontSizeMm?: number;
};

export type MapIssue = { level: 'error' | 'warning'; code: string; message: string };

export type MappedTemplate = {
    widthMm: number;
    heightMm: number;
    bleedMm: number;
    safeAreaMm: number;
    dielineSvg: string | null;
    sceneTemplate: { version: string; objects: unknown[] };
    slots: Slot[];
    backgroundLayers: string[];
    issues: MapIssue[];
};

const pxToMm = (px: number, dpi: number) => (px / dpi) * MM_PER_INCH;
/** PSD 像素只能是整数，反算 mm 必然带 0.0x 偏差（1063px@300dpi = 90.002mm），就近吸到 0.5mm */
const snapMm = (v: number) => Math.round(v * 2) / 2;
/**
 * 图层是否有可用几何：PSD 里包围盒依附像素数据，没像素的空图层读回来 right===left、bottom===top。
 * 不拦这一条的话，“标记图层”会静默算出 bleed=0mm / safe=27mm 这种看起正常的错值。
 */
function hasGeometry(l: PsdLayer): boolean {
    return (l.right ?? 0) - (l.left ?? 0) > 0.5 && (l.bottom ?? 0) - (l.top ?? 0) > 0.5;
}
const ptToScenePx = (pt: number) => (pt * SCENE_DPI) / 72;
const layerScenePx = (layer: PsdLayer, dpi: number) => {
    const l = (layer.left ?? 0) * (SCENE_DPI / dpi);
    const t = (layer.top ?? 0) * (SCENE_DPI / dpi);
    const w = Math.max(0, ((layer.right ?? 0) - (layer.left ?? 0)) * (SCENE_DPI / dpi));
    const h = Math.max(0, ((layer.bottom ?? 0) - (layer.top ?? 0)) * (SCENE_DPI / dpi));
    return { l, t, w, h };
};

/** 拍平图层树：组只是组织手段，槽位识别只认叶子层的命名 */
export function flatten(layers: PsdLayer[]): PsdLayer[] {
    const out: PsdLayer[] = [];
    const walk = (list: PsdLayer[]) => {
        for (const l of list) {
            if (l.children?.length) walk(l.children);
            else out.push(l);
        }
    };
    walk(layers);
    return out;
}

// 命名规范：__text:key__ / __slot:key__ / __dieline__ / __bleed__ / __safe__，其余进背景
const TEXT_RE = /^__text:([a-z0-9_]+)__$/i;
const SLOT_RE = /^__slot:([a-z0-9_]+)__$/i;
const isMark = (name: string, mark: string) => name.trim().toLowerCase() === mark;

function fillColorCss(color?: { r?: number; g?: number; b?: number } | number[]): string {
    if (!color) return '#111111';
    const rgb = (Array.isArray(color)
        ? color.slice(0, 3).map((v) => (v <= 1 ? v * 255 : v))
        : [color.r ?? 0, color.g ?? 0, color.b ?? 0]
    ).map((v) => Math.max(0, Math.min(255, Math.round(v))));
    if (rgb.length < 3 || rgb.some((v) => Number.isNaN(v))) return '#111111';
    return `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function alignFrom(justification?: string): string {
    const j = (justification ?? '').toLowerCase();
    if (j.includes('center') || j.includes('middle')) return 'center';
    if (j.includes('right')) return 'right';
    return 'left';
}

export function mapPsdToTemplate(doc: PsdDoc): MappedTemplate {
    const issues: MapIssue[] = [];
    const dpi = doc.dpi && doc.dpi > 0 ? doc.dpi : FALLBACK_DPI;
    if (!doc.dpi) issues.push({ level: 'warning', code: 'no-dpi', message: `文档未给出 DPI，按 ${FALLBACK_DPI} 解析` });

    const widthMm = snapMm(pxToMm(doc.width, dpi));
    const heightMm = snapMm(pxToMm(doc.height, dpi));
    const leaves = flatten(doc.layers);

    let bleedMm = 3;
    let safeAreaMm = 3;
    let dieline: PsdLayer | null = null;
    const slots: Slot[] = [];
    const objects: unknown[] = [];
    const backgroundLayers: string[] = [];

    for (const layer of leaves) {
        const name = layer.name.trim();
        if (layer.hidden) {
            issues.push({ level: 'warning', code: 'hidden-skipped', message: `隐藏层「${name}」未参与模板生成` });
            continue;
        }
        const isMarker = isMark(name, '__dieline__') || /dieline|刀版/i.test(name)
            || isMark(name, '__bleed__') || isMark(name, '__safe__')
            || !!TEXT_RE.exec(name) || !!SLOT_RE.exec(name);
        if (isMarker && !hasGeometry(layer)) {
            issues.push({ level: 'error', code: 'layer-no-geometry', message: `「${name}」是空图层，PSD 里空图层没有几何信息；请在 PS 里给它实体像素（哪怕 1px 占位矩形）` });
            continue;
        }
        const box = layerScenePx(layer, dpi);

        if (isMark(name, '__dieline__') || /dieline|刀版/i.test(name)) {
            dieline = layer;
            continue; // 刀版绝不进印刷层
        }
        if (isMark(name, '__bleed__')) {
            // 规范：该图层的包围盒是“含出血的完整矩形”，比 trim 宽出的部分两侧均分
            const wMm = pxToMm((layer.right ?? 0) - (layer.left ?? 0), dpi);
            const hMm = pxToMm((layer.bottom ?? 0) - (layer.top ?? 0), dpi);
            bleedMm = snapMm(Math.max(0, Math.min((wMm - widthMm) / 2, (hMm - heightMm) / 2)));
            continue;
        }
        if (isMark(name, '__safe__')) {
            // 规范：该图层的包围盒是“安全区矩形”，比 trim 内缩的部分两侧均分
            const wMm = pxToMm((layer.right ?? 0) - (layer.left ?? 0), dpi);
            const hMm = pxToMm((layer.bottom ?? 0) - (layer.top ?? 0), dpi);
            safeAreaMm = snapMm(Math.max(0, Math.min((widthMm - wMm) / 2, (heightMm - hMm) / 2)));
            continue;
        }

        const textKey = TEXT_RE.exec(name)?.[1];
        if (textKey) {
            if (!layer.text?.text) {
                issues.push({ level: 'error', code: 'text-without-content', message: `槽位「${textKey}」不是文字层或内容为空` });
                continue;
            }
            const fontName = layer.text.style?.font?.name ?? 'Arial';
            if (!HOSTED_FONTS.includes(fontName)) {
                issues.push({ level: 'warning', code: 'font-not-hosted', message: `「${textKey}」字体 ${fontName} 未托管，渲染会回退，需替换字体或取得授权` });
            }
            if (layer.effects) {
                issues.push({ level: 'error', code: 'text-effects', message: `「${textKey}」带图层样式，Fabric 无法表达，需先在 PSD 里栅格化或去掉样式` });
            }
            const sizePt = layer.text.style?.fontSize ?? 12;
            objects.push({
                type: 'textbox',
                originX: 'left', originY: 'top',
                left: +box.l.toFixed(2), top: +box.t.toFixed(2),
                width: +Math.max(20, box.w).toFixed(2),
                text: layer.text.text,
                fontFamily: HOSTED_FONTS.includes(fontName) ? fontName : 'Arial',
                fontSize: +ptToScenePx(sizePt).toFixed(2),
                fill: fillColorCss(layer.text.style?.fillColor),
                textAlign: alignFrom(layer.text.paragraphStyle?.justification),
            });
            slots.push({
                key: textKey,
                kind: 'text',
                labelMm: {
                    left: +pxToMm(layer.left ?? 0, dpi).toFixed(2),
                    top: +pxToMm(layer.top ?? 0, dpi).toFixed(2),
                    width: +(box.w / SCENE_PX_PER_MM).toFixed(2),
                    height: +(box.h / SCENE_PX_PER_MM).toFixed(2),
                },
                placeholder: layer.text.text,
                fontFamily: HOSTED_FONTS.includes(fontName) ? fontName : 'Arial',
                fontSizeMm: +(sizePt / 72 * MM_PER_INCH).toFixed(2),
            });
            continue;
        }

        const slotKey = SLOT_RE.exec(name)?.[1];
        if (slotKey) {
            slots.push({
                key: slotKey,
                kind: 'image',
                labelMm: {
                    left: +pxToMm(layer.left ?? 0, dpi).toFixed(2),
                    top: +pxToMm(layer.top ?? 0, dpi).toFixed(2),
                    width: +(box.w / SCENE_PX_PER_MM).toFixed(2),
                    height: +(box.h / SCENE_PX_PER_MM).toFixed(2),
                },
            });
            backgroundLayers.push(name); // 示例图仍要留在背景合成图里，客户替换时才盖上去
            continue;
        }

        backgroundLayers.push(name);
    }

    if (slots.length === 0) {
        issues.push({ level: 'error', code: 'no-editable-slot', message: '没有任何 __text__/__slot__ 图层，成品会是死图，客户无从编辑' });
    }
    if (!dieline) {
        issues.push({ level: 'warning', code: 'no-dieline', message: '缺 __dieline__ 图层，按画布外框生成简易裁切线' });
    }
    if (leaves.length === 0) {
        issues.push({ level: 'error', code: 'empty-doc', message: '文档没有可解析的可见图层' });
    }

    // 刀版：有图层取其包围盒，没有就退化成 trim 外框。
    // viewBox 用 mm（与 prisma/seed-templates.mjs 里现有刀版一致，渲染时拉伸铺满画布）
    const mmBox = dieline
        ? {
            x: pxToMm(dieline.left ?? 0, dpi),
            y: pxToMm(dieline.top ?? 0, dpi),
            w: pxToMm((dieline.right ?? 0) - (dieline.left ?? 0), dpi),
            h: pxToMm((dieline.bottom ?? 0) - (dieline.top ?? 0), dpi),
        }
        : { x: 0, y: 0, w: widthMm, h: heightMm };
    const dielineSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthMm} ${heightMm}">`
        + `<rect x="${mmBox.x.toFixed(2)}" y="${mmBox.y.toFixed(2)}" width="${mmBox.w.toFixed(2)}" height="${mmBox.h.toFixed(2)}"`
        + ` fill="none" stroke="#e11d48" stroke-width="0.6" stroke-dasharray="2 1.5" /></svg>`;

    return {
        widthMm,
        heightMm,
        bleedMm,
        safeAreaMm,
        dielineSvg,
        sceneTemplate: { version: '7.4.0', objects },
        slots,
        backgroundLayers,
        issues,
    };
}

/** 审核台判合格用：有 error 就不许直接上架 */
export function templatePublishable(mapped: MappedTemplate): boolean {
    return mapped.issues.every((i) => i.level !== 'error');
}