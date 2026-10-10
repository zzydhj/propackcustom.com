'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@/navigation';
import { useFabricCanvas, PX_PER_MM, ZOOM_MAX, ZOOM_MIN, type PreflightIssue } from './useFabricCanvas';
import ObjectPropertiesPanel from './ObjectPropertiesPanel';
import LayerList from './LayerList';
import PreflightPanel from './PreflightPanel';
import GuideOverlay from './GuideOverlay';
import { FreeDesignCallout } from './FreeDesignCallout';
import { parseDieShape } from '@/lib/dieline';
import { appendDielinePage, svgWithDielineLayer } from '@/lib/production-export';
import { useDesignSave } from './useDesignSave';
import { saveDesignBridge } from '@/lib/design-bridge';

const tool = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40';
const zoomBtn = 'rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40';

type Props = {
    productType: string;
    widthMm?: number;
    heightMm?: number;
    initialScene?: string;
    designId?: string;
    templateId?: string | null;
    name?: string;
    templateName?: string;
    dielineSvg?: string;
    bleedMm?: number;
    safeAreaMm?: number;
    /** 满版模板（背景必须盖到裁切线）：交给预检报“会露白底” */
    fullBleed?: boolean;
    /** 模板 slug：写进生产文件的刀版层说明，印厂能对上哪个模切 */
    templateSlug?: string;
};

// 全屏左右工作台：左栏 = 作品命名/保存 + 编辑工具；右栏 = 画布工作区（占满剩余视口）。
export default function DesignCanvas({ productType, widthMm = 100, heightMm = 100, initialScene, designId, templateId, name, templateName, templateSlug, dielineSvg, bleedMm = 3, safeAreaMm = 3, fullBleed = false }: Props) {
    const {
        canvasElRef, canvasRef, ready,
        addText, addImage, removeActive, undo, redo, canUndo, canRedo,
        active, selectionCount, patchActive, alignActive, layerActive,
        zoom, applyZoom,
        issues, selectObject,
        layers, activeIndex, patchLayer, selectLayer, moveLayer, removeLayer,
        exportJSON, importJSON, exportPNG, exportSVG,
    } = useFabricCanvas({ widthMm, heightMm, bleedMm, safeAreaMm, dielineSvg, fullBleed });

    const fileRef = useRef<HTMLInputElement>(null);
    const jsonRef = useRef<HTMLInputElement>(null);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);

    // 生产文件用的刀版元数据：形状从 dielineSvg 现场解析（与预检同源），不另存一份
    const prodMeta = useMemo(() => ({
        widthMm,
        heightMm,
        bleedMm,
        safeAreaMm,
        die: parseDieShape(dielineSvg ?? null, { widthMm, heightMm, pxPerMm: PX_PER_MM }),
        templateName,
        templateSlug,
    }), [widthMm, heightMm, bleedMm, safeAreaMm, dielineSvg, templateName, templateSlug]);
    const fileBase = `production-${(templateSlug ?? templateName ?? productType).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design'}`;
    const router = useRouter();
    const [guides, setGuides] = useState(true);
    const { title, setTitle, savedId, saving, msg, setStatus, save } = useDesignSave({
        productType, designId, templateId, name, ready, exportJSON,
    });

    useEffect(() => {
        if (ready && initialScene) importJSON(initialScene);
    }, [ready, initialScene, importJSON]);

    // 以某个屏幕锚点（默认视口中心）为不动点缩放，并补偿外层滚动位置
    const zoomAt = useCallback((next: number, clientX?: number, clientY?: number) => {
        const scroller = scrollerRef.current;
        const stage = stageRef.current;
        if (!scroller || !stage) {
            applyZoom(next);
            return;
        }
        const r0 = stage.getBoundingClientRect();
        const ax = clientX ?? r0.left + r0.width / 2;
        const ay = clientY ?? r0.top + r0.height / 2;
        const sx = (ax - r0.left) / zoom;
        const sy = (ay - r0.top) / zoom;
        const z = applyZoom(next);
        // setDimensions 是同步布局，可以直接拿到新矩形
        const r1 = stage.getBoundingClientRect();
        scroller.scrollLeft += r1.left + sx * z - ax;
        scroller.scrollTop += r1.top + sy * z - ay;
    }, [applyZoom, zoom]);

    // 适应屏幕：留出工作区内边距，且不放大超过 100%（小模板 Fit 只会缩小）
    const fitZoom = useCallback(() => {
        const s = scrollerRef.current;
        if (!s) return 1;
        const pad = 64;
        return Math.min(1, (s.clientWidth - pad) / (widthMm * PX_PER_MM), (s.clientHeight - pad) / (heightMm * PX_PER_MM));
    }, [widthMm, heightMm]);

    // Ctrl/⌘ + 滚轮（含触控板捏合）= 缩放；普通滚轮交给浏览器，滚动条就是平移
    useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            zoomAt(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [zoom, zoomAt]);

    // 预检列表点一行：选中该对象并把它的中心滚到工作区中间（缩放后对象可能在视口外）
    const focusIssue = useCallback((issue: PreflightIssue) => {
        selectObject(issue.index);
        const s = scrollerRef.current;
        const stage = stageRef.current;
        if (!s || !stage) return;
        const r = stage.getBoundingClientRect();
        const sr = s.getBoundingClientRect();
        s.scrollLeft += r.left + (issue.rect.left + issue.rect.width / 2) * zoom - (sr.left + sr.width / 2);
        s.scrollTop += r.top + (issue.rect.top + issue.rect.height / 2) * zoom - (sr.top + sr.height / 2);
    }, [selectObject, zoom]);

    // 大模板（200×150mm = 1600×1200px）100% 下只能看到一个角 → 首次就绪自动 Fit 缩小
    const fittedSizeRef = useRef('');
    useEffect(() => {
        if (!ready) {
            fittedSizeRef.current = '';
            return;
        }
        const key = `${widthMm}x${heightMm}`;
        if (fittedSizeRef.current === key) return;
        fittedSizeRef.current = key;
        const f = fitZoom();
        if (f < 0.995) zoomAt(f);
    }, [ready, widthMm, heightMm, fitZoom, zoomAt]);

    // 键盘 Delete 删除选中；文本编辑态不拦截
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Delete') return;
            const active = canvasRef.current?.getActiveObject() as { isEditing?: boolean } | null;
            if (active?.isEditing) return;
            if (active) {
                e.preventDefault();
                removeActive();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [canvasRef, removeActive]);

    async function handleSave() {
        const id = await save();
        // 保存后把作品 id 写进地址，刷新/回去还能接着改同一份
        if (id) router.replace(`/design/${productType}?design=${id}`);
    }

    const downloadJSON = () => {
        const blob = new Blob([exportJSON()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'design.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadPNG = () => {
        const url = exportPNG(2);
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        a.download = 'design.png';
        a.click();
    };

    // 矢量 SVG：物理毫米尺寸根节点，Ai/Inkscape 打开即真实尺寸，可转曲可转 PDF
    const downloadSVG = () => {
        const svg = exportSVG();
        if (!svg) return;
        // 印刷层包进 <g id="PRINT">，刀线单独一个非印刷 <g id="DIELINE">：印厂可整组开关，不会把裁切线印上去
        const blob = new Blob([svgWithDielineLayer(svg, prodMeta, PX_PER_MM)], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileBase}.svg`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 浏览器端直出 mm 精确 PDF（jspdf+svg2pdf 动态加载，不进首屏 bundle）
    async function downloadPDF() {
        if (!ready) return;
        setStatus('Rendering PDF…');
        try {
            const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
            const svg = exportSVG();
            if (!svg) throw new Error('empty svg');
            // svg2pdf 要求已解析的 SVGElement：传字符串会在 collectStyleSheetTexts 里炸（rootSvg.querySelectorAll 不存在）
            const svgEl = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
            const doc = new jsPDF({ orientation: widthMm >= heightMm ? 'landscape' : 'portrait', unit: 'mm', format: [widthMm, heightMm] });
            await (doc as unknown as { svg(node: unknown, opts: { x: number; y: number; width: number; height: number }): Promise<unknown> }).svg(svgEl, { x: 0, y: 0, width: widthMm, height: heightMm });
            // 第 2 页 = 1:1 刀版层（裁切/出血/安全），第 1 页保持干净的油墨层
            appendDielinePage(doc as unknown as Parameters<typeof appendDielinePage>[0], prodMeta);
            (doc as unknown as { save(name: string): void }).save(`${fileBase}.pdf`);
            setStatus('Production PDF saved ✓ (page 2 = dieline) — outline fonts before printing');
        } catch (err) {
            console.error('[design] PDF export failed', err);
            setStatus('PDF render failed — use Export SVG instead');
        }
    }

    return (
        <div className="flex h-full w-full">
            {/* 左栏：作品 + 工具 */}
            <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between">
                    <Link href={`/design/${productType}`} className="text-sm text-neutral-500 hover:text-neutral-900">← Templates</Link>
                    {savedId && <span className="text-xs text-neutral-400">#{savedId.slice(0, 8)}</span>}
                </div>

                <div>
                    <h2 className="text-base font-bold text-neutral-900">Design Studio</h2>
                    <p className="text-xs text-neutral-500">{templateName ?? productType} · {widthMm}×{heightMm}mm</p>
                </div>

                {/* 紧凑版：不能挤掉画布高度，但要在不滚动时就能看到 */}
                <FreeDesignCallout variant="strip" />

                <div className="space-y-2">
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Design name"
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                    />
                    <button type="button" onClick={handleSave} disabled={saving || !ready} className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                    {msg && <p className="text-xs text-neutral-500">{msg}</p>}
                </div>

                <div className="space-y-2 border-t border-neutral-100 pt-3">
                    <button type="button" className={tool} onClick={addText}>+ Add text</button>
                    <button type="button" className={tool} onClick={() => fileRef.current?.click()}>+ Upload image</button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImage(f); e.target.value = ''; }} />
                    <button type="button" className={tool} onClick={removeActive}>Delete selected</button>
                </div>

                {/* 对象属性面板：选中态与 patch 都由引擎层给出，本文件只负责摆位置 */}
                <div className="border-t border-neutral-100 pt-3">
                    <ObjectPropertiesPanel
                        active={active}
                        selectionCount={selectionCount}
                        onPatch={patchActive}
                        onAlign={alignActive}
                        onLayer={layerActive}
                    />
                </div>

                {/* 图层列表：名字/显隐/锁定/叠放次序都在这，属性面板不重复造控件 */}
                <div className="border-t border-neutral-100 pt-3">
                    <LayerList
                        layers={layers}
                        activeIndex={activeIndex}
                        onPatch={patchLayer}
                        onSelect={selectLayer}
                        onMove={moveLayer}
                        onDelete={removeLayer}
                    />
                </div>

                {/* 印前自检：超出出血线/跨裁切线/文字出安全区，点条目回到画布定位 */}
                <div className="border-t border-neutral-100 pt-3">
                    <PreflightPanel issues={issues} onFocus={focusIssue} />
                </div>

                <div className="flex gap-2 border-t border-neutral-100 pt-3">
                    <button type="button" className={`${tool} flex-1`} onClick={undo} disabled={!canUndo}>↶ Undo</button>
                    <button type="button" className={`${tool} flex-1`} onClick={redo} disabled={!canRedo}>↷ Redo</button>
                </div>

                <div className="space-y-2 border-t border-neutral-100 pt-3">
                    <button type="button" className={tool} onClick={() => jsonRef.current?.click()}>Import JSON</button>
                    <input ref={jsonRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(importJSON); e.target.value = ''; }} />
                    <button type="button" className={tool} onClick={downloadJSON}>Export JSON</button>
                    <button type="button" className={tool} onClick={downloadSVG}>Export SVG (vector)</button>
                    <button type="button" className={tool} onClick={() => void downloadPDF()}>Export PDF (print)</button>
                    <button type="button" className={tool} onClick={downloadPNG}>Export PNG</button>
                </div>

                <label className="flex items-center gap-2 text-sm text-neutral-600">
                    <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} className="accent-neutral-900" />
                    Show bleed &amp; safe guides
                </label>

                {savedId && (
                    <div className="space-y-2 border-t border-neutral-100 pt-3">
                        <button
                            type="button"
                            onClick={() => {
                                saveDesignBridge(savedId);
                                router.push('/quote');
                            }}
                            className="w-full rounded-lg bg-[#ffec5a] px-3 py-2 text-sm font-black text-neutral-900 transition hover:brightness-95"
                        >
                            Get expert quote →
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                saveDesignBridge(savedId);
                                router.push('/products');
                            }}
                            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900"
                        >
                            Order with a product →
                        </button>
                    </div>
                )}

                <p className="mt-auto pt-3 text-[11px] text-neutral-400">Fabric.js · 1mm = 8px at 100% · SVG/PDF export stays at print size regardless of zoom.</p>
            </aside>

            {/* 右栏：缩放工具条 + 画布工作区（放大后靠外层滚动条平移） */}
            <main className="flex min-w-0 flex-1 flex-col bg-neutral-100">
                <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2">
                    <button type="button" title="Zoom out" className={zoomBtn} disabled={zoom <= ZOOM_MIN} onClick={() => zoomAt(zoom / 1.25)}>−</button>
                    <span className="w-12 text-center text-xs font-semibold tabular-nums text-neutral-700">{Math.round(zoom * 100)}%</span>
                    <button type="button" title="Zoom in" className={zoomBtn} disabled={zoom >= ZOOM_MAX} onClick={() => zoomAt(zoom * 1.25)}>+</button>
                    <button type="button" title="Fit to screen" className={zoomBtn} onClick={() => zoomAt(fitZoom())}>Fit</button>
                    <button type="button" title="Actual size (1mm = 8px)" className={zoomBtn} onClick={() => zoomAt(1)}>100%</button>
                    <span className="ml-auto hidden text-xs text-neutral-400 lg:block">
                        {widthMm}×{heightMm}mm · Ctrl/⌘ + 滚轮缩放，普通滚轮平移
                    </span>
                </div>
                <div ref={scrollerRef} className="flex-1 overflow-auto">
                    {/* min-h/min-w-full + m-auto：内容比工作区小时居中，比它大时不裁左上角 */}
                    <div className="flex min-h-full min-w-full p-8">
                        <div ref={stageRef} className="relative m-auto w-fit rounded bg-white shadow-md">
                            <canvas ref={canvasElRef} />
                            <GuideOverlay dielineSvg={dielineSvg} bleedMm={bleedMm} safeAreaMm={safeAreaMm} zoom={zoom} showGuides={guides} />
                            {!ready && (
                                <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">Initializing canvas…</div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
