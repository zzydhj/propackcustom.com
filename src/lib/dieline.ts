// 从刀版 SVG 里解析出**裁切形状**，让印前校验按真实形状判定，而不是一律用矩形包围盒。
//
// 为什么必须做这件事：圆形贴纸/异形的刀版是画在 dielineSvg 里的，而预检以前只看
// 0..widthMm × 0..heightMm 这个方框 —— 结果“文字在方框里但在圆外”照样报绿，
// 客户以为没问题，印出来四角/边缘被切掉。这里把形状解析出来，规则改成按形状判。
//
// 不新增字段、不存两份数据：形状从 dielineSvg 现场解析，永远不会与刀版文件对不上。

export type DieBox = { left: number; top: number; width: number; height: number };

/** 一个判定区域：矩形（方框刀版）或圆（圆刀）。坐标都是场景 px */
export type DieRegion =
    | { kind: 'rect'; box: DieBox }
    | { kind: 'circle'; cx: number; cy: number; r: number };

/** 解析结果：成品线形状；出血/安全区由它外扩/内缩得到 */
export type DieShape = { kind: 'rect' } | { kind: 'circle'; cx: number; cy: number; r: number };

const num = (s: string | undefined): number | undefined => {
    if (!s) return undefined;
    const v = Number(s.replace(/(mm|px|cm|in|pt)$/i, ''));
    return Number.isFinite(v) ? v : undefined;
};

const attr = (tag: string, name: string): string | undefined => {
    const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`).exec(tag);
    return m ? (m[1] ?? m[2]) : undefined;
};

/**
 * 解析刀版 SVG 的裁切形状。
 * 规则：取面积最大的 <circle> 或 <rect>（徽章类刀版常有多圈，最外圈才是裁切线）；
 * 只有 <path>（异形）时退化成矩形 —— 异形需要真正的路径包含判定，本期不做，但**不会误报成"在圆内"**。
 */
export function parseDieShape(
    svg: string | null | undefined,
    opts: { widthMm: number; heightMm: number; pxPerMm: number },
): DieShape {
    const { widthMm, heightMm, pxPerMm } = opts;
    const rect: DieShape = { kind: 'rect' };
    if (!svg || !svg.includes('<svg')) return rect;

    // viewBox 决定单位：刀版一般用 mm（viewBox="0 0 80 80" + width="80mm"），
    // 但上传的文件单位五花八门 → 用 viewBox 与成品 mm 尺寸反算单位比例，再统一换成场景 px。
    const vb = /viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/.exec(svg);
    const vbMinX = vb ? Number(vb[1]) : 0;
    const vbMinY = vb ? Number(vb[2]) : 0;
    const vbW = vb ? Number(vb[3]) : widthMm;
    const vbH = vb ? Number(vb[4]) : heightMm;
    if (!Number.isFinite(vbW) || !Number.isFinite(vbH) || vbW <= 0 || vbH <= 0) return rect;
    const toX = (v: number) => ((v - vbMinX) / vbW) * widthMm * pxPerMm;
    const toY = (v: number) => ((v - vbMinY) / vbH) * heightMm * pxPerMm;

    let best: { cx: number; cy: number; r: number } | null = null;
    for (const m of svg.matchAll(/<circle\b[^>]*/g)) {
        const tag = m[0];
        const cx = num(attr(tag, 'cx'));
        const cy = num(attr(tag, 'cy'));
        const r = num(attr(tag, 'r'));
        if (cx == null || cy == null || r == null) continue;
        if (!best || r > best.r) best = { cx: toX(cx), cy: toY(cy), r: (r / vbW) * widthMm * pxPerMm };
    }
    if (best) {
        // 只有“大到像裁切轮廓”的圆才算刀版：吊带的打孔圆（直径几 mm）不能把整张判成小圆
        // —— 实测：吊牌刀版里那个孔被当成裁切形状后，所有对象都被报“超出出血”。
        const minDimPx = Math.min(widthMm, heightMm) * pxPerMm;
        if (best.r * 2 >= minDimPx * 0.85) return { kind: 'circle', ...best };
    }
    return rect;
}

/** 由形状 + 出血/安全区（px）推出三个判定区域 */
export function dieRegions(
    shape: DieShape,
    opts: { widthMm: number; heightMm: number; pxPerMm: number; bleedMm: number; safeAreaMm: number },
): { trim: DieRegion; bleed: DieRegion; safe: DieRegion } {
    const { widthMm, heightMm, pxPerMm, bleedMm, safeAreaMm } = opts;
    const W = widthMm * pxPerMm;
    const H = heightMm * pxPerMm;
    const b = bleedMm * pxPerMm;
    const s = safeAreaMm * pxPerMm;
    if (shape.kind === 'circle') {
        return {
            trim: { kind: 'circle', cx: shape.cx, cy: shape.cy, r: shape.r },
            bleed: { kind: 'circle', cx: shape.cx, cy: shape.cy, r: shape.r + b },
            safe: { kind: 'circle', cx: shape.cx, cy: shape.cy, r: Math.max(0, shape.r - s) },
        };
    }
    return {
        trim: { kind: 'rect', box: { left: 0, top: 0, width: W, height: H } },
        bleed: { kind: 'rect', box: { left: -b, top: -b, width: W + b * 2, height: H + b * 2 } },
        safe: { kind: 'rect', box: { left: s, top: s, width: Math.max(0, W - s * 2), height: Math.max(0, H - s * 2) } },
    };
}

const corners = (box: DieBox) => [
    [box.left, box.top],
    [box.left + box.width, box.top],
    [box.left, box.top + box.height],
    [box.left + box.width, box.top + box.height],
];

/**
 * 待判定的对象：一律有外接矩形；圆形对象额外给出真实圆（半径/圆心）。
 * 为什么：圆的外接矩形四角永远比圆本身大——不记真实形状的话，圆贴纸上一个刚好铺满出血的
 * 背景圆会被判“超出出血”，把本来对的模板永久报红（实测踩过）。
 */
export type DieObject = { box: DieBox; circle?: { cx: number; cy: number; r: number } };

const TOL = 0.5; // px，与设计器旧 contains() 的容差保持一致，免得四舍五入误报

const inRect = (o: DieObject, rect: DieBox): boolean => {
    if (o.circle) {
        const { cx, cy, r } = o.circle;
        return cx - r >= rect.left - TOL && cy - r >= rect.top - TOL
            && cx + r <= rect.left + rect.width + TOL && cy + r <= rect.top + rect.height + TOL;
    }
    const b = o.box;
    return b.left >= rect.left - TOL && b.top >= rect.top - TOL
        && b.left + b.width <= rect.left + rect.width + TOL
        && b.top + b.height <= rect.top + rect.height + TOL;
};

const inCircle = (o: DieObject, cx: number, cy: number, r: number): boolean => {
    if (o.circle) return Math.hypot(o.circle.cx - cx, o.circle.cy - cy) + o.circle.r <= r + TOL;
    return corners(o.box).every(([x, y]) => Math.hypot(x - cx, y - cy) <= r + TOL);
};

/** 对象是否**完整落在区域内**（圆形对象按圆判，其余按四角保守判） */
export function regionContains(region: DieRegion, obj: DieObject): boolean {
    return region.kind === 'rect' ? inRect(obj, region.box) : inCircle(obj, region.cx, region.cy, region.r);
}

/** 对象是否与区域有交集 */
export function regionOverlaps(region: DieRegion, obj: DieObject): boolean {
    const b = obj.box;
    if (region.kind === 'rect') {
        const o = region.box;
        return b.left < o.left + o.width && o.left < b.left + b.width && b.top < o.top + o.height && o.top < b.top + b.height;
    }
    const nx = Math.max(b.left, Math.min(region.cx, b.left + b.width));
    const ny = Math.max(b.top, Math.min(region.cy, b.top + b.height));
    const d = Math.hypot(region.cx - nx, region.cy - ny);
    return obj.circle ? d <= region.r + obj.circle.r : d <= region.r;
}

/** 对象是否把区域整个盖住（用来豁免"铺满成品线的背景"与判满版） */
export function coversRegion(obj: DieObject, region: DieRegion): boolean {
    if (region.kind === 'rect') {
        const r = region.box, b = obj.box;
        return b.left <= r.left && b.top <= r.top && b.left + b.width >= r.left + r.width && b.top + b.height >= r.top + r.height;
    }
    if (obj.circle) {
        const d = Math.hypot(obj.circle.cx - region.cx, obj.circle.cy - region.cy);
        return obj.circle.r >= region.r && d <= obj.circle.r - region.r;
    }
    const b = obj.box;
    const bbg: DieBox = { left: region.cx - region.r, top: region.cy - region.r, width: region.r * 2, height: region.r * 2 };
    return b.left <= bbg.left && b.top <= bbg.top && b.left + b.width >= bbg.left + bbg.width && b.top + b.height >= bbg.top + bbg.height;
}
