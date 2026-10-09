'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Textbox } from 'fabric';
import type { FabricObject } from 'fabric';
import { outOfCmykGamut } from '@/lib/color-gamut';

// 预览基准：1mm = 8px（≈200dpi 预览，桌面画布显示更大；导出 PNG 用 multiplier 达 300dpi+，矢量 PDF 走后端链）
export const PX_PER_MM = 8;

// 文档级缩放：用 canvas.setZoom + 同步改 CSS 尺寸，场景坐标与 sceneJson 完全不变，
// 大模板（200×150mm = 1600×1200px）缩小后能整张看下，放大后由外层 overflow 容器出滚动条当平移。
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;

type Opts = {
    widthMm?: number;
    heightMm?: number;
    background?: string;
    bleedMm?: number;
    safeAreaMm?: number;
    /** 引导式（快速定制）页：锁定画布，客户只能填字段不能拖、不能改结构 */
    lockEditing?: boolean;
};

export type IssueBox = { left: number; top: number; width: number; height: number };

/** 印前自检结果：矩形用场景 px（未缩放），UI 自己乘 zoom 定位 */
export type PreflightIssue = {
    index: number;
    severity: 'error' | 'warning';
    kind: 'outside-bleed' | 'crossing-trim' | 'text-outside-safe' | 'cmyk-out-of-gamut';
    label: string;
    rect: IssueBox;
    /** 仅 cmyk-out-of-gamut ：问题颜色原值，UI 用它画色块 */
    color?: string;
};

function overlap(a: IssueBox, b: IssueBox): boolean {
    return a.left < b.left + b.width && a.left + a.width > b.left
        && a.top < b.top + b.height && a.top + a.height > b.top;
}

function contains(outer: IssueBox, inner: IssueBox): boolean {
    return inner.left >= outer.left - 0.5
        && inner.top >= outer.top - 0.5
        && inner.left + inner.width <= outer.left + outer.width + 0.5
        && inner.top + inner.height <= outer.top + outer.height + 0.5;
}

function objectLabel(o: FabricObject): string {
    if (o instanceof Textbox) return `Text “${(o.text ?? '').replace(/\s+/g, ' ').slice(0, 18)}”`;
    if (o instanceof FabricImage) return 'Image';
    return o.type ?? 'Object';
}

/** 引导式编辑的字段：把画布对象映成「客户可以填的东西」（背景与装饰不参与） */
export type DesignField = { index: number; kind: 'text' | 'image'; value: string };

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
    });
}

/** 属性面板要读的选中对象快照（只有单选才有；多选/空白返回 null） */
export type ActiveTarget = {
    kind: 'text' | 'image';
    opacity: number;
    angle: number;
    flipX: boolean;
    flipY: boolean;
    // 对象中心点（mm）：缩放/旋转都围绕中心，读数比左上角稳定
    centerXMm: number;
    centerYMm: number;
    // kind === 'text' 才有
    fontFamily?: string;
    fontSize?: number;
    fill?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    textAlign?: string;
};

export type ActivePatch = Partial<Omit<ActiveTarget, 'kind' | 'centerXMm' | 'centerYMm'>>;
export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type LayerMode = 'front' | 'forward' | 'backward' | 'back';

function readActive(c: Canvas): ActiveTarget | null {
    const objs = c.getActiveObjects();
    if (objs.length !== 1) return null;
    const o = objs[0];
    const cp = o.getCenterPoint();
    const common = {
        opacity: o.opacity ?? 1,
        angle: Math.round(o.angle ?? 0),
        flipX: !!o.flipX,
        flipY: !!o.flipY,
        centerXMm: +(cp.x / PX_PER_MM).toFixed(1),
        centerYMm: +(cp.y / PX_PER_MM).toFixed(1),
    };
    if (o instanceof Textbox) {
        return {
            kind: 'text',
            ...common,
            fontFamily: o.fontFamily,
            fontSize: o.fontSize,
            fill: typeof o.fill === 'string' ? o.fill : '#111111',
            bold: String(o.fontWeight) === 'bold',
            italic: String(o.fontStyle) !== 'normal',
            underline: !!o.underline,
            textAlign: String(o.textAlign),
        };
    }
    if (o instanceof FabricImage) return { kind: 'image', ...common };
    return null;
}

// 引擎层：把 Fabric 命令式 canvas 的生命周期 + 编辑操作 + 选中态 + 撤销/重做历史封进 React。
// 只在客户端 useEffect 里 new Canvas（SSR 不执行），故对本模块的顶层 fabric import 安全——
// 前提是它只被 dynamic(ssr:false) 的组件引用（见 DesignCanvas）。
export function useFabricCanvas(opts: Opts = {}) {
    const { widthMm = 100, heightMm = 100, background = '#ffffff', bleedMm = 0, safeAreaMm = 0, lockEditing = false } = opts;
    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const canvasRef = useRef<Canvas | null>(null);
    const [ready, setReady] = useState(false);

    const history = useRef<{ stack: string[]; idx: number }>({ stack: [], idx: -1 });
    const restoring = useRef(false); // 程序化还原时抑制 object:added 回写历史
    // 历史指针放 state（渲染期不读 ref），快照本体留在 ref 里
    const [hmeta, setHmeta] = useState({ len: 0, idx: -1 });
    const [active, setActive] = useState<ActiveTarget | null>(null);
    const [selectionCount, setSelectionCount] = useState(0);
    const recordTimer = useRef<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const [issues, setIssues] = useState<PreflightIssue[]>([]);
    const [fields, setFields] = useState<DesignField[]>([]);

    const baseW = Math.round(widthMm * PX_PER_MM);
    const baseH = Math.round(heightMm * PX_PER_MM);

    const syncSelection = useCallback((c: Canvas) => {
        const n = c.getActiveObjects().length;
        setSelectionCount(n);
        setActive(n === 1 ? readActive(c) : null);
    }, []);

    // 对象列表变了就要重算：引导页字段 + （锁定时）把对象变成不可选中、不可拖
    const refreshFields = useCallback((c: Canvas) => {
        const list: DesignField[] = [];
        c.getObjects().forEach((o, index) => {
            if (o instanceof Textbox) list.push({ index, kind: 'text', value: o.text ?? '' });
            else if (o instanceof FabricImage) list.push({ index, kind: 'image', value: '' });
        });
        setFields(list);
        if (lockEditing) {
            // 锁定时不能给任何对象上选中框/控制手柄：addImage 等入口会把新对象设为 active，
            // 客户会看到一圈蓝色手柄（看起来像“可以拖”，但拖不动 → 比不能拖更困惑）
            c.discardActiveObject();
            c.selection = false;
            c.getObjects().forEach((o) => { o.selectable = false; o.evented = false; });
        }
    }, [lockEditing]);

    // 印前几何校验：超出出血框=error，跨裁切线=warning，文字出安全区=warning；另跟一条色域预警
    // 三个基准框用场景 px（成品线 / 出血线 / 安全区），mm 换算与导引线 overlay 共用 PX_PER_MM
    const runPreflight = useCallback((c: Canvas) => {
        const bleedPx = bleedMm * PX_PER_MM;
        const safePx = safeAreaMm * PX_PER_MM;
        const trimBox: IssueBox = { left: 0, top: 0, width: baseW, height: baseH };
        const bleedBox: IssueBox = { left: -bleedPx, top: -bleedPx, width: baseW + bleedPx * 2, height: baseH + bleedPx * 2 };
        const safeBox: IssueBox = { left: safePx, top: safePx, width: Math.max(0, baseW - safePx * 2), height: Math.max(0, baseH - safePx * 2) };

        const found: PreflightIssue[] = [];
        c.getObjects().forEach((o, index) => {
            if (o.visible === false) return;
            const r = o.getBoundingRect();
            const box: IssueBox = { left: r.left, top: r.top, width: r.width, height: r.height };
            const label = objectLabel(o);
            if (!contains(bleedBox, box)) {
                found.push({ index, severity: 'error', kind: 'outside-bleed', label, rect: box });
                return;
            }
            // 部分在成品内、部分在外：会被裁掉（整张铺满成品线的背景不算）
            if (!contains(trimBox, box) && overlap(box, trimBox) && !contains(box, trimBox)) {
                found.push({ index, severity: 'warning', kind: 'crossing-trim', label, rect: box });
            } else if (o instanceof Textbox && !contains(safeBox, box)) {
                found.push({ index, severity: 'warning', kind: 'text-outside-safe', label, rect: box });
            }
            // 色域预警与几何无关：位置正确但颜色不可印同样要报（只查实心 fill，栅格图不查）
            const fill = (o as { fill?: unknown }).fill;
            if (typeof fill === 'string' && outOfCmykGamut(fill)) {
                found.push({ index, severity: 'warning', kind: 'cmyk-out-of-gamut', label, rect: box, color: fill });
            }
        });
        setIssues(found);
    }, [baseW, baseH, bleedMm, safeAreaMm]);

    const record = useCallback((c: Canvas) => {
        if (restoring.current) return;
        const snap = JSON.stringify(c.toJSON());
        // 丢弃 redo 分支
        const stack = history.current.stack.slice(0, history.current.idx + 1).concat(snap);
        history.current = { stack, idx: stack.length - 1 };
        setHmeta({ len: stack.length, idx: stack.length - 1 });
        runPreflight(c);
        refreshFields(c);
    }, [refreshFields, runPreflight]);

    const resetHistory = useCallback((c: Canvas) => {
        history.current = { stack: [JSON.stringify(c.toJSON())], idx: 0 };
        setHmeta({ len: 1, idx: 0 });
    }, []);

    // 拖滑块/连续微调不能每改一个像素就推一次历史 → 合并成一次
    const scheduleRecord = useCallback((c: Canvas) => {
        if (recordTimer.current) window.clearTimeout(recordTimer.current);
        recordTimer.current = window.setTimeout(() => record(c), 350);
    }, [record]);

    useEffect(() => {
        if (!canvasElRef.current) return;
        const canvas = new Canvas(canvasElRef.current, {
            width: baseW,
            height: baseH,
            backgroundColor: background,
            preserveObjectStacking: true,
        });
        canvasRef.current = canvas;
        const onAdded = () => record(canvas);
        const onRemoved = () => record(canvas);
        const onModified = () => record(canvas);
        const sync = () => syncSelection(canvas);
        canvas.on('object:added', onAdded);
        canvas.on('object:removed', onRemoved);
        canvas.on('object:modified', onModified);
        canvas.on('selection:created', sync);
        canvas.on('selection:updated', sync);
        canvas.on('selection:cleared', sync);
        resetHistory(canvas);
        runPreflight(canvas);
        refreshFields(canvas);
        setZoom(1);
        setReady(true);
        return () => {
            canvas.off('object:added', onAdded);
            canvas.off('object:removed', onRemoved);
            canvas.off('object:modified', onModified);
            canvas.off('selection:created', sync);
            canvas.off('selection:updated', sync);
            canvas.off('selection:cleared', sync);
            if (recordTimer.current) window.clearTimeout(recordTimer.current);
            canvas.dispose();
            canvasRef.current = null;
            setActive(null);
            setSelectionCount(0);
            setReady(false);
        };
    }, [baseW, baseH, background, record, refreshFields, resetHistory, runPreflight, syncSelection]);

    const restore = useCallback((snap: string) => {
        const c = canvasRef.current;
        if (!c) return;
        restoring.current = true;
        void c.loadFromJSON(snap).then(() => {
            c.renderAll();
            restoring.current = false;
            syncSelection(c);
            runPreflight(c); // 还原期间 object:added 被抑制，预检与字段要主动重跑
            refreshFields(c);
            setHmeta({ len: history.current.stack.length, idx: history.current.idx });
        });
    }, [refreshFields, runPreflight, syncSelection]);

    const addText = useCallback(() => {
        const c = canvasRef.current;
        if (!c) return;
        const boxWidth = 240;
        // 落点一律用未缩放的场景尺寸（baseW/baseH）：c.getWidth() 会被 zoom 放大，
        // 放大状态下新建的对象会落到刀版外。fabric v6/7 默认 originX/originY=center，
        // 不显式声明的话 left/top 会被当中心点→新对象左半跑出刀版
        const t = new Textbox('Double-click to edit', {
            width: boxWidth,
            originX: 'left', originY: 'center',
            left: Math.max(0, (baseW - boxWidth) / 2),
            top: Math.round(baseH / 2),
            fontFamily: 'Arial', fontSize: 28, fill: '#111111',
        });
        c.add(t);
        // 引导页（锁定）不要自动选中：避免预览区出现控制手柄
        if (!lockEditing) c.setActiveObject(t);
        c.requestRenderAll();
        syncSelection(c);
    }, [baseW, baseH, lockEditing, syncSelection]);

    const addImage = useCallback(async (file: File) => {
        const c = canvasRef.current;
        if (!c) return;
        const dataUrl = await readFileAsDataUrl(file);
        const img = await FabricImage.fromURL(dataUrl);
        const w = (img.width ?? 100);
        const h = (img.height ?? 100);
        // 同样用场景尺寸算缩放与落点，不受 UI zoom 影响；并显式左上角为基准居中到刀版内
        const scale = Math.min(1, (baseW * 0.6) / w, (baseH * 0.6) / h);
        // 必须用 scaleX/scaleY：Fabric v7 里 scale 是原型方法，set({ scale }) 只是把方法
        // 遮蔽成一个数字，真正渲染的 scaleX/scaleY 仍为 1 → 大图 1:1 溢到刀版外
        img.set({
            originX: 'left', originY: 'top', scaleX: scale, scaleY: scale,
            left: Math.max(0, (baseW - w * scale) / 2),
            top: Math.max(0, (baseH - h * scale) / 2),
        });
        c.add(img);
        if (!lockEditing) c.setActiveObject(img);
        c.requestRenderAll();
        syncSelection(c);
    }, [baseW, baseH, lockEditing, syncSelection]);

    const removeActive = useCallback(() => {
        const c = canvasRef.current;
        const o = c?.getActiveObject();
        if (c && o) {
            c.remove(o);
            c.requestRenderAll();
            syncSelection(c);
        }
    }, [syncSelection]);

    /** 按顶层下标移除对象：引导页没有选中态，只能按字段索引拿掉客户刚加的东西 */
    const removeObject = useCallback((index: number) => {
        const c = canvasRef.current;
        const o = c?.getObjects()[index];
        if (!c || !o) return;
        c.remove(o);
        c.requestRenderAll();
        syncSelection(c);
        record(c);
    }, [record, syncSelection]);

    // 属性面板→当前选中对象：UI 只传语义（bold/italic），fabric 字段名映射留在引擎层
    const patchActive = useCallback((patch: ActivePatch) => {
        const c = canvasRef.current;
        const o = c?.getActiveObject();
        if (!c || !o) return;
        const props: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) continue;
            if (key === 'bold') props.fontWeight = value ? 'bold' : 'normal';
            else if (key === 'italic') props.fontStyle = value ? 'italic' : 'normal';
            else props[key] = value;
        }
        o.set(props);
        o.setCoords();
        c.requestRenderAll();
        syncSelection(c);
        scheduleRecord(c);
    }, [scheduleRecord, syncSelection]);

    // 对齐基准是画布（= 刀版成品尺寸），用包围盒算，旋转后的对象也不会跳位
    const alignActive = useCallback((mode: AlignMode) => {
        const c = canvasRef.current;
        const o = c?.getActiveObject();
        if (!c || !o) return;
        const r = o.getBoundingRect();
        const cw = c.getWidth();
        const ch = c.getHeight();
        const left = o.left ?? 0;
        const top = o.top ?? 0;
        if (mode === 'left') o.set({ left: left - r.left });
        else if (mode === 'right') o.set({ left: left + (cw - r.left - r.width) });
        else if (mode === 'hcenter') o.set({ left: left + (cw - r.width) / 2 - r.left });
        else if (mode === 'top') o.set({ top: top - r.top });
        else if (mode === 'bottom') o.set({ top: top + (ch - r.top - r.height) });
        else o.set({ top: top + (ch - r.height) / 2 - r.top });
        o.setCoords();
        c.requestRenderAll();
        syncSelection(c);
        record(c);
    }, [record, syncSelection]);

    // Fabric v7 层级靠 canvas.getObjects()（下→上）+ moveObjectTo，对象上没有 bringToFront
    const layerActive = useCallback((where: LayerMode) => {
        const c = canvasRef.current;
        const o = c?.getActiveObject();
        if (!c || !o) return;
        const objs = c.getObjects();
        const from = objs.indexOf(o);
        if (from < 0) return;
        const to = where === 'front' ? objs.length - 1
            : where === 'back' ? 0
                : where === 'forward' ? Math.min(objs.length - 1, from + 1)
                    : Math.max(0, from - 1);
        if (to === from) return;
        c.moveObjectTo(o, to);
        c.requestRenderAll();
        record(c);
    }, [record]);

    // 返回实际生效的缩放值，供 UI 层算鼠标锚点后的滚动补偿
    const applyZoom = useCallback((next: number): number => {
        const c = canvasRef.current;
        const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
        if (!c) return z;
        // 先改缩放再以新尺寸设 CSS 尺寸：Fabric 内部一个场景 px 对应 z 个屏 px，指针命中仍准确
        c.setZoom(z);
        c.setDimensions({ width: Math.round(baseW * z), height: Math.round(baseH * z) });
        c.requestRenderAll();
        setZoom(z);
        return z;
    }, [baseW, baseH]);

    // 导出前把视口与尺寸拍回 1:1，否则 PNG 像素与 SVG viewBox 会跟着 UI 缩放跑
    const withFlatViewport = useCallback(<T,>(fn: (c: Canvas) => T): T | undefined => {
        const c = canvasRef.current;
        if (!c) return undefined;
        const prevVt = c.viewportTransform ? (c.viewportTransform.slice() as [number, number, number, number, number, number]) : null;
        const prevW = c.getWidth();
        const prevH = c.getHeight();
        c.setDimensions({ width: baseW, height: baseH });
        c.setViewportTransform([1, 0, 0, 1, 0, 0]);
        try {
            return fn(c);
        } finally {
            c.setDimensions({ width: prevW, height: prevH });
            if (prevVt) c.setViewportTransform(prevVt);
            c.requestRenderAll();
        }
    }, [baseW, baseH]);

    // 引导式编辑（快速定制页）只靠这两个入口改画面，客户不接触画布结构
    const setFieldText = useCallback((index: number, text: string) => {
        const c = canvasRef.current;
        const o = c?.getObjects()[index];
        if (!c || !(o instanceof Textbox)) return;
        o.set({ text });
        o.setCoords();
        c.requestRenderAll();
        refreshFields(c);
        scheduleRecord(c);
    }, [refreshFields, scheduleRecord]);

    const setFieldImage = useCallback(async (index: number, file: File) => {
        const c = canvasRef.current;
        const o = c?.getObjects()[index];
        if (!c || !(o instanceof FabricImage)) return;
        const dataUrl = await readFileAsDataUrl(file);
        // 先记住客户看到的占位尺寸，换图后按原矩形回填，避免客户一改图就撑破版面
        const footprintW = o.getScaledWidth();
        const footprintH = o.getScaledHeight();
        await o.setSrc(dataUrl);
        o.scaleToWidth(footprintW);
        o.scaleToHeight(footprintH);
        o.setCoords();
        c.requestRenderAll();
        record(c);
    }, [record]);

    // 从预检列表点回画布：选中该对象（顶层下标）
    const selectObject = useCallback((index: number) => {
        const c = canvasRef.current;
        if (!c) return;
        const o = c.getObjects()[index];
        if (!o) return;
        c.discardActiveObject();
        c.setActiveObject(o);
        c.requestRenderAll();
        syncSelection(c);
    }, [syncSelection]);

    const undo = useCallback(() => {
        const h = history.current;
        if (h.idx <= 0) return;
        h.idx -= 1;
        restore(h.stack[h.idx]);
    }, [restore]);

    const redo = useCallback(() => {
        const h = history.current;
        if (h.idx >= h.stack.length - 1) return;
        h.idx += 1;
        restore(h.stack[h.idx]);
    }, [restore]);

    const exportJSON = useCallback(() => (canvasRef.current ? JSON.stringify(canvasRef.current.toJSON()) : '{}'), []);

    const importJSON = useCallback((json: string) => {
        const c = canvasRef.current;
        if (!c) return;
        restoring.current = true;
        void c.loadFromJSON(json).then(() => {
            c.renderAll();
            restoring.current = false;
            resetHistory(c);
            syncSelection(c);
            runPreflight(c);
            refreshFields(c);
        });
    }, [refreshFields, resetHistory, runPreflight, syncSelection]);

    const exportPNG = useCallback((multiplier = 2) => withFlatViewport((c) => c.toDataURL({ format: 'png', multiplier })) ?? '', [withFlatViewport]);

    // 导出 SVG：根节点尺寸替换为物理毫米 + viewBox，保证 Ai/Inkscape/印厂打开即真实尺寸
    const exportSVG = useCallback((): string => {
        const svg = withFlatViewport((c) => c.toSVG());
        if (!svg) return '';
        const raw = svg;
        const pxW = baseW;
        const pxH = baseH;
        const mmW = (pxW / PX_PER_MM).toFixed(2).replace(/\.?0+$/, '');
        const mmH = (pxH / PX_PER_MM).toFixed(2).replace(/\.?0+$/, '');
        return raw.replace(/<svg\b[^>]*>/, (tag) => {
            let t = tag;
            if (/\swidth="[^"]*"/.test(t)) t = t.replace(/\swidth="[^"]*"/, ` width="${mmW}mm"`);
            else t = t.replace('<svg', `<svg width="${mmW}mm"`);
            if (/\sheight="[^"]*"/.test(t)) t = t.replace(/\sheight="[^"]*"/, ` height="${mmH}mm"`);
            else t = t.replace('<svg', `<svg height="${mmH}mm"`);
            if (!/viewBox=/.test(t)) t = t.replace('<svg', `<svg viewBox="0 0 ${pxW} ${pxH}"`);
            return t;
        });
    }, [baseW, baseH, withFlatViewport]);

    return {
        canvasElRef, canvasRef, ready,
        addText, addImage, removeActive, undo, redo,
        canUndo: hmeta.idx > 0,
        canRedo: hmeta.idx < hmeta.len - 1,
        active, selectionCount, patchActive, alignActive, layerActive,
        zoom, applyZoom,
        issues, selectObject,
        fields, setFieldText, setFieldImage, removeObject,
        exportJSON, importJSON, exportPNG, exportSVG,
    };
}
