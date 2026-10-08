'use client';

import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/navigation';
import { useFabricCanvas, PX_PER_MM } from './useFabricCanvas';
import { saveDesign } from '@/features/design/actions';

const tool = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-40';

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
};

// 全屏左右工作台：左栏 = 作品命名/保存 + 编辑工具；右栏 = 画布工作区（占满剩余视口）。
export default function DesignCanvas({ productType, widthMm = 100, heightMm = 100, initialScene, designId, templateId, name, templateName, dielineSvg, bleedMm = 3, safeAreaMm = 3 }: Props) {
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
    const [guides, setGuides] = useState(true);

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

                <div className="flex gap-2 border-t border-neutral-100 pt-3">
                    <button type="button" className={`${tool} flex-1`} onClick={undo} disabled={!canUndo}>↶ Undo</button>
                    <button type="button" className={`${tool} flex-1`} onClick={redo} disabled={!canRedo}>↷ Redo</button>
                </div>

                <div className="space-y-2 border-t border-neutral-100 pt-3">
                    <button type="button" className={tool} onClick={() => jsonRef.current?.click()}>Import JSON</button>
                    <input ref={jsonRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(importJSON); e.target.value = ''; }} />
                    <button type="button" className={tool} onClick={downloadJSON}>Export JSON</button>
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
                                try { localStorage.setItem('pp_order_design', savedId); } catch { /* ignore */ }
                                router.push('/quote');
                            }}
                            className="w-full rounded-lg bg-[#ffec5a] px-3 py-2 text-sm font-black text-neutral-900 transition hover:brightness-95"
                        >
                            Get expert quote →
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                try { localStorage.setItem('pp_order_design', savedId); } catch { /* ignore */ }
                                router.push('/products');
                            }}
                            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900"
                        >
                            Order with a product →
                        </button>
                    </div>
                )}

                <p className="mt-auto pt-3 text-[11px] text-neutral-400">Fabric.js · millimetre units · bleed-aware output in a later milestone.</p>
            </aside>

            {/* 右栏：画布工作区 */}
            <main className="relative flex flex-1 items-center justify-center overflow-auto bg-neutral-100 p-8">
                <div className="relative w-fit rounded bg-white shadow-md">
                    <canvas ref={canvasElRef} />
                    {/* 刀版/出血/安全区：独立 HTML 覆盖层，不进 Fabric 对象树 → sceneJson 与导出产物保持干净 */}
                    <div className="pointer-events-none absolute inset-0 overflow-visible">
                        {dielineSvg && (
                            <div className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: dielineSvg }} />
                        )}
                        {guides && bleedMm > 0 && (
                            <div className="absolute border border-red-400/80" style={{ inset: -bleedMm * PX_PER_MM }} title={`bleed ${bleedMm}mm`} />
                        )}
                        {guides && safeAreaMm > 0 && (
                            <div className="absolute border border-dashed border-blue-400/70" style={{ inset: safeAreaMm * PX_PER_MM }} title={`safe area ${safeAreaMm}mm`} />
                        )}
                    </div>
                    {!ready && (
                        <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">Initializing canvas…</div>
                    )}
                </div>
            </main>
        </div>
    );
}
