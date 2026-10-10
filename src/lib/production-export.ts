// 生产交付：把「印刷层」与「刀版层」分开交出去。
//
// 为什么必须分开：刀模线**不能被印到产品上**（印上去就是事故），但印厂模切又必须要这条线。
// 所以正确做法不是把刀线画进印刷层，而是：
//   · SVG  → 印刷内容包在 <g id="PRINT">，刀线单独放 <g id="DIELINE">（品红、非印刷，Ai/Inkscape 可整组关掉）
//   · PDF  → 第 1 页只有印刷层；第 2 页是 1:1 刀版层（裁切/出血/安全线）
// 刀线一律**取自模板版本**，不是客户画布里的东西 —— 客户能改自己的裁切线同样是事故。

import type { DieShape } from './dieline';

export type ProductionMeta = {
    widthMm: number;
    heightMm: number;
    bleedMm: number;
    safeAreaMm: number;
    die: DieShape;
    templateName?: string;
    templateSlug?: string;
};

/** 刀版线颜色：品红是行业惯例（CutContour 专色通道），一眼能认出"这不是油墨" */
const DIE_COLOR = '#ff00ff';
const BLEED_COLOR = '#00a651';
const SAFE_COLOR = '#9aa0a6';

/** 刀版三线的 SVG 片段（坐标先由 toUnit 换算成调用方的单位） */
function dieLines(meta: ProductionMeta, toUnit: (mm: number) => number, sw: number): string {
    const { widthMm, heightMm, bleedMm, safeAreaMm, die } = meta;
    const r0 = Math.min(widthMm, heightMm) / 2;
    const line = (inset: number, stroke: string, dash: string) =>
        die.kind === 'circle'
            ? `<circle cx="${toUnit(widthMm / 2)}" cy="${toUnit(heightMm / 2)}" r="${toUnit(r0 + inset)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
            : `<rect x="${toUnit(-inset)}" y="${toUnit(-inset)}" width="${toUnit(widthMm + inset * 2)}" height="${toUnit(heightMm + inset * 2)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    // 裁切线实线；出血/安全虚线（圆刀也按同心圆给，否则印厂拿到的是方框，与模切不符）
    return line(0, DIE_COLOR, '') + line(bleedMm, BLEED_COLOR, '2 1.5') + line(-safeAreaMm, SAFE_COLOR, '1.5 1.5');
}

/**
 * 给 Fabric 导出的 SVG 加两层结构：印刷组 + 非印刷刀版组。
 * Fabric 的 toSVG 用的是场景 px 坐标系（1mm = pxPerMm px），这里按同一单位画刀线，避免两套坐标。
 */
export function svgWithDielineLayer(artworkSvg: string, meta: ProductionMeta, pxPerMm: number): string {
    const close = artworkSvg.lastIndexOf('</svg>');
    if (close < 0) return artworkSvg;
    const openEnd = artworkSvg.indexOf('>') + 1;
    const head = artworkSvg.slice(0, openEnd);
    const body = artworkSvg.slice(openEnd, close);
    const toUnit = (mm: number) => Math.round(mm * pxPerMm * 1000) / 1000;
    const label = meta.templateSlug ?? 'untitled';
    const die =
        `<g id="DIELINE" fill="none" data-print="false" inkscape:label="DIELINE" inkscape:groupmode="layer">` +
        `<desc>Cut contour and guides — NON-PRINTING. Sourced from template ${label}, do not edit on the artwork layer.</desc>` +
        dieLines(meta, toUnit, 0.6) +
        `</g>`;
    return `${head}<g id="PRINT">${body}</g>${die}${artworkSvg.slice(close)}`;
}

/** jsPDF 的最小接口（避免把 jspdf 类型拉进这个模块的依赖） */
type PdfDoc = {
    addPage(format: [number, number], orientation: 'portrait' | 'landscape'): unknown;
    setDrawColor(r: number, g: number, b: number): unknown;
    setFillColor?(r: number, g: number, b: number): unknown;
    setLineWidth(mm: number): unknown;
    setLineDashPattern?(dash: number[], phase: number): unknown;
    rect(x: number, y: number, w: number, h: number, style: string): unknown;
    circle(x: number, y: number, r: number, style: string): unknown;
    setFont?(f: string, s?: string): unknown;
    setFontSize?(n: number): unknown;
    text(x: number, y: number, s: string): unknown;
};

/**
 * 给 PDF 追加第 2 页：1:1 刀版层（裁切实线品红、出血虚线绿、安全虚线灰）。
 * 印厂拿这一页就能出刀模/核对出血，而第 1 页保持干净油墨层。
 */
export function appendDielinePage(doc: PdfDoc, meta: ProductionMeta): void {
    const { widthMm, heightMm, bleedMm, safeAreaMm, die } = meta;
    doc.addPage([widthMm, heightMm], widthMm >= heightMm ? 'landscape' : 'portrait');

    const frame = (inset: number, rgb: [number, number, number], dash: number[], w: number) => {
        doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
        doc.setLineWidth(w);
        doc.setLineDashPattern?.(dash, 0);
        if (die.kind === 'circle') {
            doc.circle(widthMm / 2, heightMm / 2, Math.min(widthMm, heightMm) / 2 + inset, 'S');
        } else {
            doc.rect(-inset, -inset, widthMm + inset * 2, heightMm + inset * 2, 'S');
        }
    };
    frame(0, [255, 0, 255], [], 0.25);
    frame(bleedMm, [0, 166, 81], [1.5, 1], 0.2);
    frame(-safeAreaMm, [154, 160, 166], [1, 1], 0.2);
    doc.setLineDashPattern?.([], 0);

    // 说明文字放在页面外（负坐标）会被裁掉，所以压在最下方的窄条里，且用浅灰：这一页本来就不是印刷页
    doc.setFont?.('helvetica', 'normal');
    doc.setFontSize?.(6);
    doc.setDrawColor(120, 120, 120);
    doc.text(1, heightMm - 1, `DIELINE — non-printing · ${meta.templateName ?? ''} ${widthMm}x${heightMm}mm · bleed ${bleedMm}mm · safe ${safeAreaMm}mm · ${meta.templateSlug ?? ''}`);
}
