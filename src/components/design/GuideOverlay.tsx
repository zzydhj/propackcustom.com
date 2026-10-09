'use client';

import { PX_PER_MM } from './useFabricCanvas';

// 刀版/出血/安全区覆盖层：独立 HTML，绝不进 Fabric 对象树 → sceneJson 与导出产物保持干净。
// 全屏编辑器与快速定制页共用，mm→px 要乘当前 zoom 才能跟被 setZoom 放大的画布对齐。
type Props = {
    dielineSvg?: string;
    bleedMm: number;
    safeAreaMm: number;
    zoom: number;
    showGuides: boolean;
};

export default function GuideOverlay({ dielineSvg, bleedMm, safeAreaMm, zoom, showGuides }: Props) {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-visible">
            {dielineSvg && (
                <div className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: dielineSvg }} />
            )}
            {showGuides && bleedMm > 0 && (
                <div className="absolute border border-red-400/80" style={{ inset: -bleedMm * PX_PER_MM * zoom }} title={`bleed ${bleedMm}mm`} />
            )}
            {showGuides && safeAreaMm > 0 && (
                <div className="absolute border border-dashed border-blue-400/70" style={{ inset: safeAreaMm * PX_PER_MM * zoom }} title={`safe area ${safeAreaMm}mm`} />
            )}
        </div>
    );
}
