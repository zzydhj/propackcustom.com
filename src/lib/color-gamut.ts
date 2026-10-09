// sRGB 颜色能否被 CMYK 胶印还原的近似判定（Pre-flight 的「色域预警」用）。
//
// 立场说明（重要）：真正的色域边界必须用 ICC profile（FOGRA30/37、GRACoL2013）算，
// 本项目**不做任何 RGB→CMYK 通道换算**——没有 profile 的 naive 换算会产生数值全错
// 却「看起来像转好了」的文件，比不转更危险。这里只做单向预警：告诉客户这个颜色
// 在四色胶印上大概率会偏暗/偏灰，需要实物打样确认。
//
// 依据是胶印公认的形状：黄色/品红方向色域宽，纯绿→青→纯蓝方向明显收拢，
// 所以高饱和的绿、青、蓝、荧光色最危险。边界值取近似控制点做线性插值。

// 各色相上的最大可达彩度（C*）控制点，量级对应涂布四色（ISO Coated v2 / FOGRA30）。
// 形状：黄→橙→红→品红扇区很宽（C 可达 90～96），绿→青扇区最窄（C 仅 50～60），
// 蓝紫中等。数值是工程近似，不是 profile 实测，所以只用于预警、不用于任何换算。
const CMYK_LIMITS: [hue: number, maxChroma: number][] = [
    [0, 88],    // 红
    [20, 92],
    [45, 96],   // 红橙：四色最能打的区间
    [70, 95],   // 橙黄（琥珀色这类正常品牌色应该判为可印）
    [85, 90],
    [105, 70],  // 黄绿：快速收敛
    [130, 60],
    [150, 55],  // 绿
    [180, 52],  // 青
    [210, 58],
    [240, 72],  // 蓝
    [270, 78],
    [300, 85],
    [330, 90],  // 品红
    [360, 88],
];

// 低于这个彩度就是黑灰白与中性色，任何四色都能印，不参与判定
const NEUTRAL_CHROMA = 15;

function srgbToLinear(v: number): number {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB → CIE Lab（D65 光源）。只用于算 L/C/h，不做配色 */
export function labFromSrgb(r: number, g: number, b: number): { l: number; a: number; b: number } {
    const R = srgbToLinear(r);
    const G = srgbToLinear(g);
    const B = srgbToLinear(b);
    // sRGB(D65) → XYZ
    const x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
    const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
    const z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
    // 相对 D65 白点归一
    const fx = f(x / 0.95047);
    const fy = f(y);
    const fz = f(z / 1.08883);
    return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function f(t: number): number {
    return t > 0.008856451679 ? Math.cbrt(t) : (903.3 * t + 16) / 116;
}

function chromaLimitAt(hue: number): number {
    for (let i = 0; i < CMYK_LIMITS.length - 1; i++) {
        const [h0, c0] = CMYK_LIMITS[i];
        const [h1, c1] = CMYK_LIMITS[i + 1];
        if (hue >= h0 && hue <= h1) {
            const t = (hue - h0) / (h1 - h0 || 1);
            return c0 + (c1 - c0) * t;
        }
    }
    return CMYK_LIMITS[0][1];
}

export type GamutHit = { chroma: number; limit: number; hue: number };

/**
 * 判断颜色是否大概率超出 CMYK 胶印色域。
 * 认不出的写法（rgb()、命名色、渐变对象等）一律返回 null = 不预警，避免假阳性。
 */
export function outOfCmykGamut(color: unknown): GamutHit | null {
    if (typeof color !== 'string') return null;
    const rgb = parseHexColor(color);
    if (!rgb) return null;
    const { l, a, b } = labFromSrgb(rgb[0], rgb[1], rgb[2]);
    const chroma = Math.sqrt(a * a + b * b);
    if (chroma < NEUTRAL_CHROMA) return null;
    let hue = (Math.atan2(b, a) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    const limit = chromaLimitAt(hue);
    // 极暗的颜色本身就没有饱和度可言，不报警
    if (l < 20) return null;
    return chroma > limit ? { chroma: Math.round(chroma), limit: Math.round(limit), hue: Math.round(hue) } : null;
}

function parseHexColor(input: string): [number, number, number] | null {
    const s = input.trim().toLowerCase();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
    if (short) return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16)];
    const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s);
    if (long) return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)];
    return null;
}
