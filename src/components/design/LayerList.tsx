'use client';

import type { LayerInfo, LayerMode, LayerPatch } from './useFabricCanvas';

// 图层列表：只管「对象本身的事实」——名字、显隐、锁定、叠放次序。
// 外观（颜色字号对齐）仍归 ObjectPropertiesPanel，两边不重复造控件。
type Props = {
    /** canvas.getObjects() 顺序（下→上），列表按印刷习惯倒着展示（最上的图层排最前） */
    layers: LayerInfo[];
    activeIndex: number | null;
    onPatch: (index: number, patch: LayerPatch) => void;
    onSelect: (index: number) => void;
    onMove: (index: number, where: LayerMode) => void;
    onDelete: (index: number) => void;
};

const icon = 'grid h-6 w-6 place-items-center rounded border border-neutral-200 text-neutral-500 transition hover:border-neutral-900 hover:text-neutral-900';
const iconOn = 'border-neutral-900 bg-neutral-900 text-white hover:border-neutral-900 hover:text-white';

function EyeIcon({ off }: { off: boolean }) {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
            {off && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
        </svg>
    );
}

function LockIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    );
}

export default function LayerList({ layers, activeIndex, onPatch, onSelect, onMove, onDelete }: Props) {
    const rows = [...layers].reverse();

    return (
        <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Layers · {layers.length}</p>
            {rows.length === 0 && (
                <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-400">No objects yet.</p>
            )}
            {rows.map((l) => (
                <div
                    key={l.index}
                    className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 ${activeIndex === l.index ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white'}`}
                >
                    <button
                        type="button"
                        title="Select this object on the canvas"
                        onClick={() => onSelect(l.index)}
                        className="min-w-0 flex-1 text-left"
                    >
                        <input
                            // 非受控 + 失焦才提交：避免每敲一个字都进一次撤销历史
                            key={`${l.index}:${l.name}`}
                            defaultValue={l.name}
                            spellCheck={false}
                            onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== l.name) onPatch(l.index, { name: v });
                            }}
                            className="w-full truncate bg-transparent text-xs text-neutral-800 outline-none focus:text-neutral-900"
                        />
                    </button>

                    <button
                        type="button"
                        title={l.visible ? 'Hide' : 'Show'}
                        onClick={() => onPatch(l.index, { visible: !l.visible })}
                        className={`${icon} ${l.visible ? '' : 'opacity-40'}`}
                    >
                        <EyeIcon off={!l.visible} />
                    </button>
                    <button
                        type="button"
                        title={l.locked ? 'Unlock' : 'Lock position & size'}
                        onClick={() => onPatch(l.index, { locked: !l.locked })}
                        className={`${icon} ${l.locked ? iconOn : ''}`}
                    >
                        <LockIcon />
                    </button>
                    <button type="button" title="Bring forward" onClick={() => onMove(l.index, 'forward')} className={`${icon} text-[11px]`}>
                        ↑
                    </button>
                    <button type="button" title="Send backward" onClick={() => onMove(l.index, 'backward')} className={`${icon} text-[11px]`}>
                        ↓
                    </button>
                    <button
                        type="button"
                        title="Delete this object"
                        onClick={() => onDelete(l.index)}
                        className={`${icon} hover:border-[#ff4d4f] hover:text-[#ff4d4f]`}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
}
