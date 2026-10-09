// 模板 slug 规则（纯函数，无 DB 依赖，方便单测与导入器复用）。
// 10 万级模板库里 slug 是公开 URL 与去重锚点，必须确定、可预测、只含安全字符。

/** 任意名称 → URL 安全 slug：转 ASCII、小写、非字母数字收成一横 */
export function slugify(input: string): string {
    return (input ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')           // 去掉变音符（É→E）
        .replace(/[€£]/g, '-cur-')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '');
}

/** slug 撞车时加数字后缀：my-label → my-label-2 → my-label-3 */
export function slugWithSuffix(base: string, n: number): string {
    if (n <= 1) return base;
    return `${base}-${n}`;
}

/** 尺寸参与命名时生成稳定片段：100×54mm → 100x54mm（避免 "×" 被吃掉导致同名） */
export function sizeToken(widthMm?: number | null, heightMm?: number | null): string {
    if (!widthMm || !heightMm) return '';
    return `${widthMm}x${heightMm}mm`;
}
