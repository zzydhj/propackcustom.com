// 把 Fabric 场景 JSON（sceneTemplate / sceneJson）编译成**静态 SVG 预览**，服务端可直接渲染。
// 为什么不用 Fabric 的 toSVG()：那是客户端能力，要跑浏览器；而模板库列表页要在 10 万级规模下
// 服务端出图（且 R2 还没配，没有栅格缩略图可用）。
//
// 坐标系：场景 px ÷ pxPerMm = mm，所以输出的 viewBox 单位与刀版 SVG 一致（都是 mm），
// 前端可以直接叠在一起，也方便印前肉眼核对尺寸。
//
// 支持范围（有意收窄，宁可少画也不要画错）：textbox / rect / circle / image。
// line、path、group、图层样式等**不画**（Fabric 的 path 变换与 line 的原点语义容易在预览里错位，
// 预览的作用是"像不像这张设计"，不是 1:1 复刻）。遇到不支持的类型直接跳过，不报错。

const PX_PER_MM = 8; // 与 useFabricCanvas 的 PX_PER_MM 一致
const MAX_SCENE_BYTES = 300_000; // 场景过大（内嵌 dataURL 图）就不渲染预览，回退刀版框

type SceneObj = {
    type?: string;
    visible?: boolean;
    opacity?: number;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    rx?: number;
    ry?: number;
    radius?: number;
    scaleX?: number;
    scaleY?: number;
    angle?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string | number;
    fontStyle?: string;
    lineHeight?: number;
    textAlign?: string;
    charSpacing?: number;
    src?: string;
    originX?: string;
    originY?: string;
};

const mm = (px: number, s: number) => Math.round((px / s) * 1000) / 1000;
const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 旋转：Fabric 的 angle 绕对象原点，这里统一按左上角旋转（预览够用，且与 originX/Y=left/top 的写法一致） */
function transformOf(o: SceneObj, s: number): string {
    const parts: string[] = [];
    if (o.left || o.top) parts.push(`translate(${mm(o.left ?? 0, s)} ${mm(o.top ?? 0, s)})`);
    if (o.angle) parts.push(`rotate(${o.angle})`);
    if ((o.scaleX ?? 1) !== 1 || (o.scaleY ?? 1) !== 1) parts.push(`scale(${o.scaleX ?? 1} ${o.scaleY ?? 1})`);
    return parts.length ? ` transform="${parts.join(' ')}"` : '';
}

function renderObject(o: SceneObj, s: number): string {
    if (o.visible === false) return '';
    const type = (o.type ?? '').toLowerCase();
    const tf = transformOf(o, s);
    const op = o.opacity != null && o.opacity < 1 ? ` opacity="${o.opacity}"` : '';

    if (type === 'rect') {
        const w = mm((o.width ?? 0) * (o.scaleX ?? 1), s);
        const h = mm((o.height ?? 0) * (o.scaleY ?? 1), s);
        const rx = o.rx ? mm(o.rx * (o.scaleX ?? 1), s) : undefined;
        const stroke = o.stroke ? ` stroke="${o.stroke}" stroke-width="${mm(o.strokeWidth ?? 1, s)}"` : '';
        return `<rect${tf}${op} width="${w}" height="${h}"${rx != null ? ` rx="${rx}" ry="${rx}"` : ''} ${o.fill ? `fill="${o.fill}"` : 'fill="none"'}${stroke}/>`;
    }

    if (type === 'circle') {
        const r = mm((o.radius ?? 0) * (o.scaleX ?? 1), s);
        // 生成器统一写 originX/Y = left/top，此时 left/top 是外接框左上角
        const cx = r, cy = r;
        const stroke = o.stroke ? ` stroke="${o.stroke}" stroke-width="${mm(o.strokeWidth ?? 1, s)}"` : '';
        return `<circle${tf}${op} cx="${cx}" cy="${cy}" r="${r}" ${o.fill ? `fill="${o.fill}"` : 'fill="none"'}${stroke}/>`;
    }

    if (type === 'image' && o.src) {
        const w = mm((o.width ?? 0) * (o.scaleX ?? 1), s);
        const h = mm((o.height ?? 0) * (o.scaleY ?? 1), s);
        return `<image${tf}${op} href="${esc(o.src)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
    }

    if ((type === 'textbox' || type === 'itext' || type === 'text') && o.text != null) {
        const size = mm((o.fontSize ?? 12) * (o.scaleY ?? 1), s);
        const lh = mm((o.fontSize ?? 12) * (o.lineHeight ?? 1.16) * (o.scaleY ?? 1), s);
        const w = mm((o.width ?? 0) * (o.scaleX ?? 1), s);
        const align = o.textAlign ?? 'left';
        const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
        const x = align === 'center' ? w / 2 : align === 'right' ? w : 0;
        const family = (o.fontFamily ?? 'Arial').split(',')[0].trim().replace(/["']/g, '');
        const weight = o.fontWeight && o.fontWeight !== 'normal' ? ` font-weight="${o.fontWeight}"` : '';
        const italic = o.fontStyle === 'italic' ? ' font-style="italic"' : '';
        const spacing = o.charSpacing ? ` letter-spacing="${mm(o.charSpacing / 1000 * (o.fontSize ?? 12), s)}"` : '';
        const lines = String(o.text).split('\n');
        const body = lines
            .map((line, i) => `<tspan x="${x}"${i === 0 ? '' : ` dy="${lh}"`}>${esc(line || ' ')}</tspan>`)
            .join('');
        // 首行基线：按 cap-height 近似（预览够用；不同字体会有一两个百分点偏差）
        return `<text${tf}${op} y="${size * 0.8}" text-anchor="${anchor}" font-family="${esc(family)}, sans-serif" font-size="${size}"${weight}${italic}${spacing} ${o.fill ? `fill="${o.fill}"` : 'fill="#111111"'}>${body}</text>`;
    }

    return '';
}

/**
 * 场景 JSON → 预览 SVG 字符串。
 * 返回 undefined 表示"不适合出预览"（空场景 / 场景过大 / 解析失败），调用方应回退到刀版框。
 */
export function sceneToSvg(
    scene: unknown,
    opts: { widthMm?: number | null; heightMm?: number | null; pxPerMm?: number } = {},
): string | undefined {
    const { widthMm, heightMm, pxPerMm = PX_PER_MM } = opts;
    if (!widthMm || !heightMm) return undefined;

    let objects: SceneObj[] = [];
    try {
        const raw = typeof scene === 'string' ? JSON.parse(scene) : scene;
        const list = Array.isArray(raw) ? raw : (raw as { objects?: unknown[] })?.objects;
        if (!Array.isArray(list) || list.length === 0) return undefined;
        if (JSON.stringify(list).length > MAX_SCENE_BYTES) return undefined; // 内嵌大图，别塞进列表页 HTML
        objects = list as SceneObj[];
    } catch {
        return undefined;
    }

    const body = objects.map((o) => renderObject(o, pxPerMm)).filter(Boolean).join('');
    if (!body) return undefined;

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthMm} ${heightMm}" preserveAspectRatio="xMidYMid meet" role="img">` +
        `<rect width="${widthMm}" height="${heightMm}" fill="#ffffff"/>${body}</svg>`
    );
}
