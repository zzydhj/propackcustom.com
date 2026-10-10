'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, FabricImage, Textbox } from 'fabric';
import type { FabricObject } from 'fabric';
import { outOfCmykGamut } from '@/lib/color-gamut';
import { coversRegion, dieRegions as buildDieRegions, parseDieShape, regionContains, regionOverlaps, type DieObject } from '@/lib/dieline';
import { assetAsDataUrl, isRemoteAsset, storeWorkingImage } from '@/lib/design-asset';
import { formatBytes, toWorkingImage } from '@/lib/working-image';

// 预览基准：1mm = 8px（≈200dpi 预览，桌面画布显示更大；导出 PNG 用 multiplier 达 300dpi+，矢量 PDF 走后端链）
// 单位常量收在 src/lib/scene-units.ts（服务端/脚本也要用，不能从本文件拉走整个 Fabric）；
// 这里 re-export 保持既有 import 路径不变
export { PX_PER_MM } from '@/lib/scene-units';
import { PX_PER_MM } from '@/lib/scene-units';

// 文档级缩放：用 canvas.setZoom + 同步改 CSS 尺寸，场景坐标与 sceneJson 完全不变，
// 大模板（200×150mm = 1600×1200px）缩小后能整张看下，放大后由外层 overflow 容器出滚动条当平移。
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;

/** 撤销栈上限：图已改成引用（不再堆 base64），但几百个对象的场景 JSON 也不小，无上限仍会涨 */
export const HISTORY_MAX = 60;

type Opts = {
    widthMm?: number;
    heightMm?: number;
    background?: string;
    bleedMm?: number;
    safeAreaMm?: number;
    /** 引导式（快速定制）页：锁定画布，客户只能填字段不能拖、不能改结构 */
    lockEditing?: boolean;
    /** 刀版 SVG：预检从里解析裁切形状（圆刀不再按矩形包围盒判，形状不另存一份以免与刀版对不上） */
    dielineSvg?: string | null;
    /** 满版模板：背景必须盖到裁切线，否则报“会露白底” */
    fullBleed?: boolean;
};

export type IssueBox = { left: number; top: number; width: number; height: number };

/** 印前自检结果：矩形用场景 px（未缩放），UI 自己乘 zoom 定位 */
export type PreflightIssue = {
    index: number;
    severity: 'error' | 'warning';
    kind: 'outside-bleed' | 'crossing-trim' | 'text-outside-safe' | 'cmyk-out-of-gamut' | 'no-full-bleed';
    label: string;
    rect: IssueBox;
    /** 仅 cmyk-out-of-gamut ：问题颜色原值，UI 用它画色块 */
    color?: string;
};

function objectLabel(o: FabricObject): string {
    const custom = (o as { name?: string }).name;
    if (typeof custom === 'string' && custom.trim()) return custom.trim();
    if (o instanceof Textbox) return `Text “${(o.text ?? '').replace(/\s+/g, ' ').slice(0, 18)}”`;
    if (o instanceof FabricImage) return 'Image';
    return o.type ?? 'Object';
}

/** 引导式编辑的字段：把画布对象映成「客户可以填的东西」（背景与装饰不参与） */
export type DesignField = { index: number; kind: 'text' | 'image'; value: string };

/** 图层一行：index 是 canvas.getObjects() 的下标（下→上），UI 倒序展示 */
export type LayerInfo = { index: number; name: string; kind: string; locked: boolean; visible: boolean };
export type LayerPatch = { name?: string; locked?: boolean; visible?: boolean };

// 我们往 Fabric 对象上挂的自定义字段：必须显式加入序列化列表，否则 save/undo 快照会丢字段
export const SCENE_PROPS = ['name', 'locked'] as const;

/** 对象是否锁定：画布级 lockEditing（引导页）或单对象 locked（图层面板设的） */
function isLocked(o: object): boolean {
    return Boolean((o as { locked?: unknown }).locked);
}

/**
 * 从导出的 SVG 里挑出**外链**图片地址（Fabric 把 image 的 src 原样写进 href）。
 * 画布改用同源代理后，这些地址在 Ai/Inkscape/印厂手里是断链 —— 交出去前必须换成 dataURL。
 */
function externalImageHrefs(svg: string): string[] {
    const found = [...svg.matchAll(/(?:xlink:)?href="([^"]+)"/g)].map((m) => m[1]);
    // 长的先换：短地址可能是长地址的前缀（同一目录下的两张图）
    return [...new Set(found.filter(isRemoteAsset))].sort((a, b) => b.length - a.length);
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
    const { widthMm = 100, heightMm = 100, background = '#ffffff', bleedMm = 0, safeAreaMm = 0, lockEditing = false, dielineSvg = null, fullBleed = false } = opts;
    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const canvasRef = useRef<Canvas | null>(null);
    const [ready, setReady] = useState(false);

    const history = useRef<{ stack: string[]; idx: number }>({ stack: [], idx: -1 });
    const restoring = useRef(false); // 程序化还原时抑制 object:added 回写历史
    // 历史指针放 state（渲染期不读 ref），快照本体留在 ref 里
    // bytes = 栈内全部快照的字符数：「大文件会不会吃内存」的直接读数，UI 底部也拿它做提示
    const [hmeta, setHmeta] = useState({ len: 0, idx: -1, bytes: 0 });
    const [active, setActive] = useState<ActiveTarget | null>(null);
    const [selectionCount, setSelectionCount] = useState(0);
    const recordTimer = useRef<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const [issues, setIssues] = useState<PreflightIssue[]>([]);
    const [fields, setFields] = useState<DesignField[]>([]);
    const [layers, setLayers] = useState<LayerInfo[]>([]);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    // 图片处理状态：选完大图要等解码+压缩+存桶，这段时间按钮该禁用；
    // imageNote 同时是量测读数（原图→工作图多少字节），客户看得到、验收也量得到
    const [imageBusy, setImageBusy] = useState(false);
    const [imageNote, setImageNote] = useState('');

    const baseW = Math.round(widthMm * PX_PER_MM);
    const baseH = Math.round(heightMm * PX_PER_MM);

    const syncSelection = useCallback((c: Canvas) => {
        const objs = c.getActiveObjects();
        setSelectionCount(objs.length);
        setActive(objs.length === 1 ? readActive(c) : null);
        // 图层列表高亮用：active 对象在 getObjects() 里的下标（多选/空选为 null）
        setActiveIndex(objs.length === 1 ? c.getObjects().indexOf(objs[0]) : null);
    }, []);

    // 对象列表变了就要重算：引导页字段 + 图层列表 + 把锁定对象变成不可选中、不可拖
    const refreshFields = useCallback((c: Canvas) => {
        const fieldList: DesignField[] = [];
        const layerList: LayerInfo[] = [];
        c.getObjects().forEach((o, index) => {
            if (o instanceof Textbox) fieldList.push({ index, kind: 'text', value: o.text ?? '' });
            else if (o instanceof FabricImage) fieldList.push({ index, kind: 'image', value: '' });
            layerList.push({
                index,
                name: objectLabel(o),
                kind: o.type ?? 'object',
                locked: lockEditing || isLocked(o),
                visible: o.visible !== false,
            });
        });
        setFields(fieldList);
        setLayers(layerList);

        // 锁定开关集中推导（画布级 lockEditing 或单对象 locked）：只设 selectable 不够，
        // 键盘/手柄仍可改位置。lockEditing 下还得把已有的 active 丢掉，
        // 否则 addImage 会让客户看到一圈蓝色手柄却拖不动（比不能拖更困惑）
        c.getObjects().forEach((o) => {
            const locked = lockEditing || isLocked(o);
            o.selectable = !locked;
            o.evented = !locked;
            o.lockMovementX = locked;
            o.lockMovementY = locked;
            o.lockScalingX = locked;
            o.lockScalingY = locked;
            o.lockRotation = locked;
        });
        if (lockEditing) {
            c.discardActiveObject();
            c.selection = false;
        }
    }, [lockEditing]);

    // 刀版形状：从 dielineSvg 现场解析（圆刀/方刀），再由出血、安全区推出三个判定区域。
    // 以前一律用矩形包围盒 → 圆形贴纸“文字在方框内但在圆外”不报，印出来才发现被切。
    const dieRegions = useMemo(
        () => buildDieRegions(parseDieShape(dielineSvg, { widthMm, heightMm, pxPerMm: PX_PER_MM }), {
            widthMm, heightMm, pxPerMm: PX_PER_MM, bleedMm, safeAreaMm,
        }),
        [dielineSvg, widthMm, heightMm, bleedMm, safeAreaMm],
    );

    // 印前几何校验：超出出血=error，跨裁切线=warning，文字出安全区=warning，另跟色域预警与满版检查
    const runPreflight = useCallback((c: Canvas) => {
        const { trim, bleed, safe } = dieRegions;

        const found: PreflightIssue[] = [];
        let coversTrim = false;
        c.getObjects().forEach((o, index) => {
            if (o.visible === false) return;
            const r = o.getBoundingRect();
            const box: IssueBox = { left: r.left, top: r.top, width: r.width, height: r.height };
            // 圆形对象带上真实圆：否则它的外接矩形四角永远比圆大，满出血背景圆会被误判“超出出血”
            const obj: DieObject = o.type === 'circle'
                ? { box, circle: { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 } }
                : { box };
            const label = objectLabel(o);
            if (coversRegion(obj, trim)) coversTrim = true;
            if (!regionContains(bleed, obj)) {
                found.push({ index, severity: 'error', kind: 'outside-bleed', label, rect: box });
                return;
            }
            // 部分在成品内、部分在外：会被裁掉（整张盖住成品线的背景不算）
            if (!regionContains(trim, obj) && regionOverlaps(trim, obj) && !coversRegion(obj, trim)) {
                found.push({ index, severity: 'warning', kind: 'crossing-trim', label, rect: box });
            } else if (o instanceof Textbox && !regionContains(safe, obj)) {
                found.push({ index, severity: 'warning', kind: 'text-outside-safe', label, rect: box });
            }
            // 色域预警与几何无关：位置正确但颜色不可印同样要报（只查实心 fill，栅格图不查）
            const fill = (o as { fill?: unknown }).fill;
            if (typeof fill === 'string' && outOfCmykGamut(fill)) {
                found.push({ index, severity: 'warning', kind: 'cmyk-out-of-gamut', label, rect: box, color: fill });
            }
        });

        // 满版模板：没有任何对象盖住成品线 → 四周会露白底（空模板不报，否则客户一打开就被警告）
        if (fullBleed && !coversTrim && c.getObjects().some((o) => o.visible !== false)) {
            found.unshift({
                index: -1, severity: 'warning', kind: 'no-full-bleed', label: 'Background',
                rect: { left: 0, top: 0, width: baseW, height: baseH },
            });
        }
        setIssues(found);
    }, [baseW, baseH, dieRegions, fullBleed]);

    const record = useCallback((c: Canvas) => {
        if (restoring.current) return;
        const snap = JSON.stringify(c.toObject([...SCENE_PROPS]));
        // 丢弃 redo 分支，再按上限裁掉最旧的（从头部裁不影响 idx 永远指末尾这个关系）
        let stack = history.current.stack.slice(0, history.current.idx + 1).concat(snap);
        if (stack.length > HISTORY_MAX) stack = stack.slice(stack.length - HISTORY_MAX);
        history.current = { stack, idx: stack.length - 1 };
        setHmeta({ len: stack.length, idx: stack.length - 1, bytes: stack.reduce((n, s) => n + s.length, 0) });
        runPreflight(c);
        refreshFields(c);
    }, [refreshFields, runPreflight]);

    const resetHistory = useCallback((c: Canvas) => {
        const snap = JSON.stringify(c.toObject([...SCENE_PROPS]));
        history.current = { stack: [snap], idx: 0 };
        setHmeta({ len: 1, idx: 0, bytes: snap.length });
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
            // 印刷品不能拉压失真：缩放始终等比，并把“反选键”置 null 禁掉 Shift 非等比拉伸
            uniformScaling: true,
            uniScaleKey: null,
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
            setHmeta({ len: history.current.stack.length, idx: history.current.idx, bytes: history.current.stack.reduce((n, s) => n + s.length, 0) });
        });
    }, [refreshFields, runPreflight, syncSelection]);

    const addText = useCallback(() => {
        const c = canvasRef.current;
        if (!c) return;
        const boxWidth = 240;
        // 多个连续新建时逐次错开一点，否则完全重叠、看像没反应
        const step = (c.getObjects().length % 5) * 20;
        // 落点一律用未缩放的场景尺寸（baseW/baseH）：c.getWidth() 会被 zoom 放大，
        // 放大状态下新建的对象会落到刀版外。fabric v6/7 默认 originX/originY=center，
        // 不显式声明的话 left/top 会被当中心点→新对象左半跑出刀版
        const t = new Textbox('Double-click to edit', {
            width: boxWidth,
            originX: 'left', originY: 'center',
            left: Math.max(0, Math.min(baseW - boxWidth, (baseW - boxWidth) / 2 + step)),
            top: Math.round(baseH / 2) + step,
            fontFamily: 'Arial', fontSize: 28, fill: '#111111',
        });
        c.add(t);
        // 引导页（锁定）不要自动选中：避免预览区出现控制手柄
        if (!lockEditing) c.setActiveObject(t);
        c.requestRenderAll();
        syncSelection(c);
    }, [baseW, baseH, lockEditing, syncSelection]);

    /**
     * 客户选中的文件 → 可以直接交给 Fabric 的 src。
     * 先压成有界工作图（见 src/lib/working-image），再优先存进 R2 换**同源代理地址**；
     * 存储不可用就退回工作图的 dataURL —— 两条路都不会再把客户原图的 base64 塞进 sceneJson。
     */
    const prepareImage = useCallback(async (file: File): Promise<string | null> => {
        setImageBusy(true);
        try {
            let work;
            try {
                work = await toWorkingImage(file);
            } catch {
                setImageNote('That image could not be read — try a JPG or PNG exported from your design tool.');
                return null;
            }
            const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
            const hint = `${stem}.${work.mime === 'image/png' ? 'png' : 'jpg'}`;
            const stored = await storeWorkingImage(work.blob, hint);
            const shrink = `${formatBytes(work.originalBytes)} → ${formatBytes(work.blob.size)} · ${work.width}×${work.height}px`;
            setImageNote(stored
                ? `${shrink} · stored in cloud (the scene keeps a link, not the pixels)`
                : `${shrink} · kept in this browser (file storage not configured)`);
            return stored ?? (await work.dataUrl());
        } finally {
            setImageBusy(false);
        }
    }, []);

    const addImage = useCallback(async (file: File) => {
        const c = canvasRef.current;
        if (!c) return;
        const src = await prepareImage(file);
        if (!src) return;
        const img = await FabricImage.fromURL(src);
        const w = (img.width ?? 100);
        const h = (img.height ?? 100);
        // 同样用场景尺寸算缩放与落点，不受 UI zoom 影响；并显式左上角为基准居中到刀版内
        const scale = Math.min(1, (baseW * 0.6) / w, (baseH * 0.6) / h);
        // 必须用 scaleX/scaleY：Fabric v7 里 scale 是原型方法，set({ scale }) 只是把方法
        // 遮蔽成一个数字，真正渲染的 scaleX/scaleY 仍为 1 → 大图 1:1 溢到刀版外
        const step = (c.getObjects().length % 5) * 20; // 连续上传时错开，不要完全重叠
        img.set({
            originX: 'left', originY: 'top', scaleX: scale, scaleY: scale,
            left: Math.max(0, Math.min(baseW - w * scale, (baseW - w * scale) / 2 + step)),
            top: Math.max(0, Math.min(baseH - h * scale, (baseH - h * scale) / 2 + step)),
        });
        c.add(img);
        if (!lockEditing) c.setActiveObject(img);
        c.requestRenderAll();
        syncSelection(c);
    }, [baseW, baseH, lockEditing, prepareImage, syncSelection]);

    const removeActive = useCallback(() => {
        const c = canvasRef.current;
        const o = c?.getActiveObject();
        if (c && o) {
            // 不要在这里显式 record()：c.remove() 会同步触发 object:removed → 已经进一次历史，
            // 再记一次会变成两条相同快照，删一个对象要按两次 Undo 才能回退
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
        c.remove(o); // 历史由 object:removed 统一记录，这里不重复 record
        c.requestRenderAll();
        syncSelection(c);
    }, [syncSelection]);

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

    // 导出前把场景归一到「印刷该有的样子」：
    // 1) 视口与尺寸拍回 1:1，否则 PNG 像素与 SVG viewBox 会跟着 UI 缩放跑；
    // 2) 暂时摘掉隐藏对象——Fabric v7 的 toSVG 不跳过 visible:false，只写 style
    //    visibility:hidden，等于客户“删掉”的内容仍留在交给印厂的矢量文件里。
    const withExportScene = useCallback(<T,>(fn: (c: Canvas) => T): T | undefined => {
        const c = canvasRef.current;
        if (!c) return undefined;
        const prevVt = c.viewportTransform ? (c.viewportTransform.slice() as [number, number, number, number, number, number]) : null;
        const prevW = c.getWidth();
        const prevH = c.getHeight();
        c.setDimensions({ width: baseW, height: baseH });
        c.setViewportTransform([1, 0, 0, 1, 0, 0]);

        const hidden = c.getObjects().map((o, i) => ({ o, i })).filter(({ o }) => o.visible === false);
        restoring.current = true; // 这段摆弄不能进入历史栈，也不能被算进预检
        hidden.forEach(({ o }) => c.remove(o));
        try {
            return fn(c);
        } finally {
            hidden.sort((a, b) => a.i - b.i).forEach(({ o, i }) => {
                c.add(o);
                c.moveObjectTo(o, Math.min(i, c.getObjects().length - 1));
            });
            c.setDimensions({ width: prevW, height: prevH });
            if (prevVt) c.setViewportTransform(prevVt);
            restoring.current = false;
            c.requestRenderAll();
            runPreflight(c);
            refreshFields(c);
        }
    }, [baseW, baseH, refreshFields, runPreflight]);

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
        const src = await prepareImage(file);
        if (!src) return;
        // 先记住客户看到的占位尺寸，换图后按原矩形回填，避免客户一改图就撑破版面
        const footprintW = o.getScaledWidth();
        const footprintH = o.getScaledHeight();
        await o.setSrc(src);
        o.scaleToWidth(footprintW);
        o.scaleToHeight(footprintH);
        o.setCoords();
        c.requestRenderAll();
        record(c);
    }, [prepareImage, record]);

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

    // 图层面板的三个入口：不需要先选中（锁定/隐藏的对象也能改）
    const patchLayer = useCallback((index: number, patch: LayerPatch) => {
        const c = canvasRef.current;
        const o = c?.getObjects()[index];
        if (!c || !o) return;
        if (patch.name !== undefined) o.set({ name: patch.name } as never);
        if (patch.visible !== undefined) o.set({ visible: patch.visible });
        if (patch.locked !== undefined) o.set({ locked: patch.locked } as never);
        refreshFields(c);
        c.requestRenderAll();
        record(c);
    }, [record, refreshFields]);

    const selectLayer = useCallback((index: number) => {
        const c = canvasRef.current;
        const o = c?.getObjects()[index];
        if (!c || !o || lockEditing || isLocked(o)) return; // 锁定对象不给选中框
        c.discardActiveObject();
        c.setActiveObject(o);
        c.requestRenderAll();
        syncSelection(c);
    }, [lockEditing, syncSelection]);

    /** 按索引删除：锁定/隐藏的对象没有选中态，不能走 removeActive */
    const removeLayer = useCallback((index: number) => {
        const c = canvasRef.current;
        const o = c?.getObjects()[index];
        if (!c || !o) return;
        c.remove(o); // 同上：object:removed 会记一次历史，不能重复 record
        c.requestRenderAll();
        syncSelection(c);
    }, [syncSelection]);

    /** 与 layerActive 同一套 API，但按索引操作（锁定时没有选中态可用） */
    const moveLayer = useCallback((index: number, where: LayerMode) => {
        const c = canvasRef.current;
        if (!c) return;
        const objs = c.getObjects();
        const o = objs[index];
        if (!o) return;
        const to = where === 'front' ? objs.length - 1
            : where === 'back' ? 0
                : where === 'forward' ? Math.min(objs.length - 1, index + 1)
                    : Math.max(0, index - 1);
        if (to === index) return;
        c.moveObjectTo(o, to);
        c.requestRenderAll();
        refreshFields(c);
        record(c);
    }, [record, refreshFields]);

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

    // v7 的 toJSON() 不收参数（官方注明不支持附加属性），自定义字段必须走 toObject(propertiesToInclude)
    const exportJSON = useCallback(() => (canvasRef.current ? JSON.stringify(canvasRef.current.toObject([...SCENE_PROPS])) : '{}'), []);

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

    const exportPNG = useCallback((multiplier = 2) => withExportScene((c) => c.toDataURL({ format: 'png', multiplier })) ?? '', [withExportScene]);

    // 导出 SVG：根节点尺寸替换为物理毫米 + viewBox，保证 Ai/Inkscape/印厂打开即真实尺寸
    // 改成 async：交出去前要先内联图片 —— 画布里的图现在是 /api/asset/… 代理地址，
    // 印厂拿到相对地址就是断图（PDF 走同一条导出链，所以一并依赖这一步）
    const exportSVG = useCallback(async (): Promise<string> => {
        const svg = withExportScene((c) => c.toSVG());
        if (!svg) return '';
        let filled = svg;
        let unresolved = 0;
        for (const url of externalImageHrefs(svg)) {
            const dataUrl = await assetAsDataUrl(url);
            if (!dataUrl) { unresolved++; continue; }
            filled = filled.split(url).join(dataUrl);
        }
        if (unresolved) {
            setImageNote(`${unresolved} image(s) could not be embedded — the vector file links them instead. Export PNG if unsure.`);
        }
        const raw = filled;
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
    }, [baseW, baseH, withExportScene]);

    return {
        canvasElRef, canvasRef, ready,
        addText, addImage, removeActive, undo, redo,
        canUndo: hmeta.idx > 0,
        canRedo: hmeta.idx < hmeta.len - 1,
        active, selectionCount, patchActive, alignActive, layerActive,
        zoom, applyZoom,
        issues, selectObject,
        fields, setFieldText, setFieldImage, removeObject,
        imageBusy, imageNote,
        historySteps: hmeta.len, historyBytes: hmeta.bytes,
        layers, activeIndex, patchLayer, selectLayer, moveLayer, removeLayer,
        exportJSON, importJSON, exportPNG, exportSVG,
    };
}
