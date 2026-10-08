'use client';

import { useEffect, useRef } from 'react';
import { useFabricCanvas } from './useFabricCanvas';

const btn = 'rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40';

// 画布 + 编辑工具栏。被 DesignStudio 以 dynamic(ssr:false) 载入，可安全顶层 import fabric（经 hook）。
export default function DesignCanvas({ widthMm, heightMm, initialScene }: { widthMm?: number; heightMm?: number; initialScene?: string }) {
    const {
        canvasElRef, canvasRef, ready,
        addText, addImage, removeActive, undo, redo, canUndo, canRedo,
        exportJSON, importJSON, exportPNG,
    } = useFabricCanvas({ widthMm, heightMm });

    const fileRef = useRef<HTMLInputElement>(null);
    const jsonRef = useRef<HTMLInputElement>(null);

    // 载入已有场景（M1b 从库读；也可由导入 JSON 复用）
    useEffect(() => {
        if (ready && initialScene) importJSON(initialScene);
    }, [ready, initialScene, importJSON]);

    // 键盘 Delete 删除选中对象；正在编辑文字时不拦截（交给 Fabric 内建文本编辑）
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

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btn} onClick={addText}>+ Text</button>
                <button type="button" className={btn} onClick={() => fileRef.current?.click()}>+ Image</button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImage(f); e.target.value = ''; }} />
                <button type="button" className={btn} onClick={removeActive}>Delete</button>
                <span className="mx-1 h-5 w-px bg-neutral-200" />
                <button type="button" className={btn} onClick={undo} disabled={!canUndo}>Undo</button>
                <button type="button" className={btn} onClick={redo} disabled={!canRedo}>Redo</button>
                <span className="mx-1 h-5 w-px bg-neutral-200" />
                <button type="button" className={btn} onClick={() => jsonRef.current?.click()}>Import JSON</button>
                <input ref={jsonRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(importJSON); e.target.value = ''; }} />
                <button type="button" className={btn} onClick={downloadJSON}>Export JSON</button>
                <button type="button" className={btn} onClick={downloadPNG}>Export PNG</button>
            </div>

            <div className="overflow-auto rounded-2xl border border-neutral-200 bg-neutral-100 p-6">
                <div className="relative mx-auto w-fit rounded bg-white shadow-md">
                    <canvas ref={canvasElRef} />
                    {!ready && (
                        <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">Initializing canvas…</div>
                    )}
                </div>
            </div>
        </div>
    );
}
