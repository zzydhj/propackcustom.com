// 客户选中的图，进画布前先压成「有界工作图」。
//
// 为什么要这一层（实测根因）：以前是 FileReader.readAsDataURL → base64 进 Fabric 对象 →
// 每一次操作的撤销快照都重复带上整张图的 base64。一张 5MB 的图 = 6.7MB 文本 ×N 条快照：
// 改 20 步就是 130MB 字符串，而 record() 每步都要重新 JSON.stringify 一遍 → 拖动/输入开始卡，
// 保存时整个 sceneJson 也要过一次网络。解码后的位图本身也吃内存（5000×4000 ≈ 80MB），画布重绘一起变慢。
//
// 两条边界：
//  · 尺寸上限 1800px 长边：场景是 8px/mm，200mm 满版=1600 场景 px，所以 1800px 原图不算放大；
//    PNG 导出 multiplier=2 是轻度放大，真要印刷精度走的是矢量 SVG/PDF 那条链。
//  · 字节上限 1.2MB：超了就先降质量、再降尺寸（宁可略糊也不要卡编辑）。
//
// 格式只选 JPEG / PNG，**不用 WebP**：导出 SVG/PDF 时我们把存下来的字节原样内联进交给印厂的文件，
// Ai / Inkscape / RIP 对 JPEG（不透明）和 PNG（透明）是确定支持，对 WebP 是赌注。

/** 长边上限（px） */
export const WORKING_MAX_EDGE = 1800;
/** 工作图字节上限 */
export const WORKING_MAX_BYTES = 1_200_000;

export type WorkingImage = {
    /** 可直接 PUT 的有界图 */
    blob: Blob;
    mime: 'image/jpeg' | 'image/png';
    width: number;
    height: number;
    originalBytes: number;
    hasAlpha: boolean;
    /** 只在 R2 不可用时才需要（懒生成，别白算一遍 base64） */
    dataUrl: () => Promise<string>;
};

export function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

async function decodeToElement(file: File): Promise<{ img: HTMLImageElement; release: () => void }> {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl;
    try {
        await img.decode();
    } catch (e) {
        URL.revokeObjectURL(objectUrl);
        throw e instanceof Error ? e : new Error('image-decode-failed');
    }
    return { img, release: () => URL.revokeObjectURL(objectUrl) };
}

/**
 * 固有尺寸。SVG 写 width="100%" 时 naturalWidth 是 0（实测），
 * 这时按 viewBox 的比例来，否则退化成 1:1 —— 不能让它走到 0 尺寸画布（编码会直接失败）。
 */
async function intrinsicSize(img: HTMLImageElement, file: File): Promise<{ w: number; h: number }> {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w > 0 && h > 0) return { w, h };
    if (file.type === 'image/svg+xml') {
        try {
            const m = /viewBox\s*=\s*["'][\d.\- ]+\s+[\d.\- ]+\s+([\d.]+)\s+([\d.]+)["']/.exec(await file.text());
            if (m) return { w: Number(m[1]), h: Number(m[2]) };
        } catch { /* 读不出来就按方形 */ }
    }
    return { w: 1024, h: 1024 };
}

function hasTransparentPixel(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
    // 整张 getImageData 只为读 alpha 通道：1800×1800 ≈ 3.2M 像素，一次几毫秒，可接受。
    // 采样步长 7：透明区通常是成片的，逐个像素扫不出更多信息但会更慢。
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4 * 7) if (data[i] !== 255) return true;
    return false;
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
    if (typeof canvas.toBlob === 'function') {
        return new Promise((res) => canvas.toBlob((b) => res(b), mime, quality));
    }
    // 老浏览器没有 toBlob：从 dataURL 拆（这条路径只在极旧环境走）
    try {
        const url = canvas.toDataURL(mime, quality);
        const [head, body] = url.split(',');
        const type = /data:([^;]+)/.exec(head)?.[1] ?? mime;
        const bin = atob(body);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return Promise.resolve(new Blob([bytes], { type }));
    } catch {
        return Promise.resolve(null);
    }
}

function scaleToFit(w: number, h: number, maxEdge: number): { w: number; h: number } {
    if (w <= 0 || h <= 0) return { w: maxEdge, h: maxEdge };
    if (w <= maxEdge && h <= maxEdge) return { w: Math.round(w), h: Math.round(h) };
    const k = maxEdge / Math.max(w, h);
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** JPEG 的降级阶梯：先降质量再降尺寸（质量对印刷小图更敏感，尺寸能保就保） */
const JPEG_LADDER: Array<[number, number]> = [
    [WORKING_MAX_EDGE, 0.85], [WORKING_MAX_EDGE, 0.72], [WORKING_MAX_EDGE, 0.6],
    [1400, 0.68], [1100, 0.62],
];
/** PNG 只能降尺寸（无质量参数可选） */
const PNG_LADDER: number[] = [WORKING_MAX_EDGE, 1500, 1200, 950, 750];

/** 客户文件 → 有界工作图。解码失败（真的不是图 / 格式浏览器不认）会抛，调用方给提示 */
export async function toWorkingImage(file: File): Promise<WorkingImage> {
    const { img, release } = await decodeToElement(file);
    try {
        const natural = await intrinsicSize(img, file);
        const first = scaleToFit(natural.w, natural.h, WORKING_MAX_EDGE);

        const canvas = document.createElement('canvas');
        canvas.width = first.w;
        canvas.height = first.h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas-unavailable');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, first.w, first.h);

        const alpha = hasTransparentPixel(ctx, first.w, first.h);
        const mime: 'image/jpeg' | 'image/png' = alpha ? 'image/png' : 'image/jpeg';

        let blob: Blob | null = null;
        let edge = first.w;
        let height = first.h;
        for (const step of mime === 'image/jpeg' ? JPEG_LADDER : PNG_LADDER.map((e) => [e, 0] as [number, number])) {
            const [maxEdge, quality] = step;
            const size = scaleToFit(natural.w, natural.h, maxEdge);
            if (size.w !== edge || size.h !== height || blob === null) {
                canvas.width = size.w;
                canvas.height = size.h;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.clearRect(0, 0, size.w, size.h);
                ctx.drawImage(img, 0, 0, size.w, size.h);
                edge = size.w;
                height = size.h;
            }
            blob = await toBlob(canvas, mime, quality || undefined);
            if (blob && blob.size <= WORKING_MAX_BYTES) break;
        }
        if (!blob) throw new Error('encode-failed');
        // 原图本来就在两条边界内、且已经是 JPEG/PNG：原样透传，不要再编一次。
        // 实测一张 26KB 的透明 PNG 被浏览器重压成 91KB（PNG 没有质量参数可降，只能靠降尺寸，
        // 于是「明明合格的小图」反而可能白掉一档分辨率）。透传的字节和客户传来的完全一致，
        // 印厂拿到的东西也更可追溯；只有超边界的大图才进上面那条重编码阶梯。
        const rawType = file.type === 'image/jpeg' || file.type === 'image/png' ? file.type : null;
        const fits = !!rawType
            && file.size <= WORKING_MAX_BYTES
            && natural.w <= WORKING_MAX_EDGE && natural.h <= WORKING_MAX_EDGE;
        const out: Blob = fits ? file : blob;
        const outMime: 'image/jpeg' | 'image/png' = fits ? rawType! : mime;
        const w = fits ? Math.round(natural.w) : edge;
        const h = fits ? Math.round(natural.h) : height;
        return {
            blob: out,
            mime: outMime,
            width: w,
            height: h,
            originalBytes: file.size,
            hasAlpha: alpha,
            dataUrl: () => new Promise<string>((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(String(r.result));
                r.onerror = () => rej(r.error);
                r.readAsDataURL(out);
            }),
        };
    } finally {
        release();
    }
}
