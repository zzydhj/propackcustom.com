'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Textbox } from 'fabric';

// 预览基准：1mm = 8px（≈200dpi 预览，桌面画布显示更大；导出 PNG 用 multiplier 达 300dpi+，矢量 PDF 走后端链）
export const PX_PER_MM = 8;

type Opts = {
    widthMm?: number;
    heightMm?: number;
    background?: string;
};

// 引擎层：把 Fabric 命令式 canvas 的生命周期 + 编辑操作 + 撤销/重做历史封进 React。
// 只在客户端 useEffect 里 new Canvas（SSR 不执行），故对本模块的顶层 fabric import 安全——
// 前提是它只被 dynamic(ssr:false) 的组件引用（见 DesignCanvas）。
export function useFabricCanvas(opts: Opts = {}) {
    const { widthMm = 100, heightMm = 100, background = '#ffffff' } = opts;
    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const canvasRef = useRef<Canvas | null>(null);
    const [ready, setReady] = useState(false);

    const history = useRef<{ stack: string[]; idx: number }>({ stack: [], idx: -1 });
    const restoring = useRef(false); // 程序化还原时抑制 object:added 回写历史
    const [, setTick] = useState(0);

    const record = useCallback((c: Canvas) => {
        if (restoring.current) return;
        const snap = JSON.stringify(c.toJSON());
        const h = history.current;
        h.stack = h.stack.slice(0, h.idx + 1); // 丢弃 redo 分支
        h.stack.push(snap);
        h.idx = h.stack.length - 1;
        setTick((t) => t + 1);
    }, []);

    useEffect(() => {
        if (!canvasElRef.current) return;
        const canvas = new Canvas(canvasElRef.current, {
            width: Math.round(widthMm * PX_PER_MM),
            height: Math.round(heightMm * PX_PER_MM),
            backgroundColor: background,
            preserveObjectStacking: true,
        });
        canvasRef.current = canvas;
        const onAdded = () => record(canvas);
        const onRemoved = () => record(canvas);
        const onModified = () => record(canvas);
        canvas.on('object:added', onAdded);
        canvas.on('object:removed', onRemoved);
        canvas.on('object:modified', onModified);
        history.current = { stack: [JSON.stringify(canvas.toJSON())], idx: 0 };
        setReady(true);
        return () => {
            canvas.off('object:added', onAdded);
            canvas.off('object:removed', onRemoved);
            canvas.off('object:modified', onModified);
            canvas.dispose();
            canvasRef.current = null;
            setReady(false);
        };
    }, [widthMm, heightMm, background, record]);

    const restore = useCallback((snap: string) => {
        const c = canvasRef.current;
        if (!c) return;
        restoring.current = true;
        void c.loadFromJSON(snap).then(() => {
            c.renderAll();
            restoring.current = false;
            setTick((t) => t + 1);
        });
    }, []);

    const addText = useCallback(() => {
        const c = canvasRef.current;
        if (!c) return;
        const t = new Textbox('Double-click to edit', {
            left: 40, top: 40, width: 240, fontFamily: 'Arial', fontSize: 28, fill: '#111111',
        });
        c.add(t);
        c.setActiveObject(t);
        c.requestRenderAll();
    }, []);

    const addImage = useCallback(async (file: File) => {
        const c = canvasRef.current;
        if (!c) return;
        const dataUrl = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.onerror = () => rej(r.error);
            r.readAsDataURL(file);
        });
        const img = await FabricImage.fromURL(dataUrl);
        const w = (img.width ?? 100);
        const h = (img.height ?? 100);
        const scale = Math.min(1, (c.getWidth() * 0.6) / w, (c.getHeight() * 0.6) / h);
        img.set({ left: 24, top: 24, scale });
        c.add(img);
        c.setActiveObject(img);
        c.requestRenderAll();
    }, []);

    const removeActive = useCallback(() => {
        const c = canvasRef.current;
        const o = c?.getActiveObject();
        if (c && o) {
            c.remove(o);
            c.requestRenderAll();
        }
    }, []);

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
            history.current = { stack: [JSON.stringify(c.toJSON())], idx: 0 };
            setTick((t) => t + 1);
        });
    }, []);

    const exportPNG = useCallback((multiplier = 2) => canvasRef.current?.toDataURL({ format: 'png', multiplier }) ?? '', []);

    // 导出 SVG：根节点尺寸替换为物理毫米 + viewBox，保证 Ai/Inkscape/印厂打开即真实尺寸
    const exportSVG = useCallback((): string => {
        const c = canvasRef.current;
        if (!c) return '';
        const raw = c.toSVG();
        const pxW = c.getWidth();
        const pxH = c.getHeight();
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
    }, [canvasRef]);

    return {
        canvasElRef, canvasRef, ready,
        addText, addImage, removeActive, undo, redo,
        canUndo: history.current.idx > 0,
        canRedo: history.current.idx < history.current.stack.length - 1,
        exportJSON, importJSON, exportPNG, exportSVG,
    };
}
