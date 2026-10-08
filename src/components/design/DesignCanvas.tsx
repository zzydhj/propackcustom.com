'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/navigation';
import { useFabricCanvas } from './useFabricCanvas';
import { saveDesign } from '@/features/design/actions';

const btn = 'rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40';

type Props = {
    productType: string;
    widthMm?: number;
    heightMm?: number;
    initialScene?: string;
    designId?: string;
    templateId?: string | null;
    name?: string;
};

// 画布 + 编辑工具栏 + 作品保存。被 DesignStudio 以 dynamic(ssr:false) 载入，可安全顶层 import fabric（经 hook）。
export default function DesignCanvas({ productType, widthMm, heightMm, initialScene, designId, templateId, name }: Props) {
    const {
        canvasElRef, canvasRef, ready,
        addText, addImage, removeActive, undo, redo, canUndo, canRedo,
        exportJSON, importJSON, exportPNG,
    } = useFabricCanvas({ widthMm, heightMm });

    const fileRef = useRef<HTMLInputElement>(null);
    const jsonRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const [title, setTitle] = useState(name ?? 'Untitled design');
    const [savedId, setSavedId] = useState<string | undefined>(designId);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    // 载入已有场景（模板预置或已存作品）
    useEffect(() => {
        if (ready && initialScene) importJSON(initialScene);
    }, [ready, initialScene, importJSON]);

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
        if (!ready) return;
        setSaving(true);
        setMsg('');
        const res = await saveDesign({ id: savedId, sceneJson: exportJSON(), name: title, templateId: templateId ?? undefined, productType });
        setSaving(false);
        if (res.ok && res.id) {
            setSavedId(res.id);
            setMsg('Saved ✓');
            router.replace(`/design/${productType}?design=${res.id}`);
        } else {
            setMsg(res.error === 'forbidden' ? 'You cannot save this design' : 'Save failed');
        }
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

    return (
        <div className="flex flex-col gap-4">
            {/* 作品栏：命名 + 保存 */}
            <div className="flex flex-wrap items-center gap-2">
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Design name"
                    className="w-56 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-semibold outline-none focus:border-neutral-900"
                />
                <button type="button" onClick={handleSave} disabled={saving || !ready} className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                </button>
                {savedId && <span className="text-xs text-neutral-400">#{savedId.slice(0, 8)}</span>}
                {msg && <span className="text-xs text-neutral-500">{msg}</span>}
            </div>

            {/* 工具栏 */}
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

            <div className="flex min-h-[calc(100vh-300px)] items-center justify-center overflow-auto rounded-2xl border border-neutral-200 bg-neutral-100 p-6">
                <div className="relative w-fit rounded bg-white shadow-md">
                    <canvas ref={canvasElRef} />
                    {!ready && (
                        <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">Initializing canvas…</div>
                    )}
                </div>
            </div>
        </div>
    );
}
