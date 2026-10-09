'use client';

import type { ActivePatch, ActiveTarget, AlignMode, LayerMode } from './useFabricCanvas';

// 属性面板：纯展示 + 受控，只把语义化 patch 交给引擎层（useFabricCanvas），自己不碰 canvas 实例。
type Props = {
    active: ActiveTarget | null;
    selectionCount: number;
    onPatch: (patch: ActivePatch) => void;
    onAlign: (mode: AlignMode) => void;
    onLayer: (where: LayerMode) => void;
};

// 印前友好的安全字体集（转曲前印厂替换成本高，故只给通用族）
const FONTS = ['Arial', 'Helvetica', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Trebuchet MS'];
const SWATCHES = ['#111111', '#ffffff', '#e11d48', '#f59e0b', '#0ea5e9', '#16a34a', '#7c3aed', '#000000'];

const ALIGN_OPTIONS: { mode: AlignMode; label: string; title: string }[] = [
    { mode: 'left', label: '⇤', title: 'Align left edge' },
    { mode: 'hcenter', label: '↔', title: 'Center horizontally' },
    { mode: 'right', label: '⇥', title: 'Align right edge' },
    { mode: 'top', label: '⤒', title: 'Align top edge' },
    { mode: 'vcenter', label: '↕', title: 'Center vertically' },
    { mode: 'bottom', label: '⤓', title: 'Align bottom edge' },
];

const LAYER_OPTIONS: { where: LayerMode; label: string; title: string }[] = [
    { where: 'front', label: '⬆⬆', title: 'Bring to front' },
    { where: 'forward', label: '⬆', title: 'Bring forward' },
    { where: 'backward', label: '⬇', title: 'Send backward' },
    { where: 'back', label: '⬇⬇', title: 'Send to back' },
];

const cellBase = 'rounded-md border py-1.5 text-xs font-semibold transition';
// 底色必须二选一：bg-white 与 bg-neutral-900 同优先级，Tailwind 产物里 bg-white 在后 → 叠加会白底白字看不见图标
const cellOff = 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900';
const cellOn = 'border-neutral-900 bg-neutral-900 text-white hover:border-neutral-900';
const cell = (on: boolean) => `${cellBase} ${on ? cellOn : cellOff}`;
const labelCls = 'text-[11px] font-medium uppercase tracking-wide text-neutral-400';

/** HTML 颜色输入只吃 #rrggbb，画布里可能是缩写或 rgb() → 兜底成黑色 */
function toHex6(color: string | undefined): string {
    const c = (color ?? '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
    const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(c);
    return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : '#000000';
}

export default function ObjectPropertiesPanel({ active, selectionCount, onPatch, onAlign, onLayer }: Props) {
    if (selectionCount > 1) {
        return (
            <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                {selectionCount} objects selected — select a single object to edit its properties.
            </p>
        );
    }
    if (!active) {
        return (
            <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-400">
                Nothing selected. Click an object on the canvas, or add text / an image above.
            </p>
        );
    }

    const isText = active.kind === 'text';

    return (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-bold capitalize text-neutral-900">{active.kind}</span>
                <span className="text-[11px] text-neutral-400">
                    center {active.centerXMm} · {active.centerYMm}mm
                </span>
            </div>

            {isText && (
                <>
                    <div>
                        <p className={labelCls}>Font</p>
                        <select
                            value={active.fontFamily}
                            onChange={(e) => onPatch({ fontFamily: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
                        >
                            {FONTS.map((f) => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                            {active.fontFamily && !FONTS.includes(active.fontFamily) && (
                                <option value={active.fontFamily}>{active.fontFamily}</option>
                            )}
                        </select>
                    </div>

                    <div>
                        <p className={labelCls}>Size · {active.fontSize}px</p>
                        <input
                            type="range" min={6} max={200} value={active.fontSize}
                            onChange={(e) => onPatch({ fontSize: Number(e.target.value) })}
                            className="mt-1 w-full accent-neutral-900"
                        />
                    </div>

                    <div>
                        <p className={labelCls}>Colour</p>
                        <div className="mt-1 flex items-center gap-2">
                            <input
                                type="color"
                                value={toHex6(active.fill)}
                                onChange={(e) => onPatch({ fill: e.target.value })}
                                className="h-8 w-10 shrink-0 cursor-pointer rounded border border-neutral-300 bg-white"
                            />
                            <div className="grid flex-1 grid-cols-8 gap-1">
                                {SWATCHES.map((s) => (
                                    <button
                                        key={s} type="button" title={s}
                                        onClick={() => onPatch({ fill: s })}
                                        className={`h-6 rounded border ${active.fill?.toLowerCase() === s.toLowerCase() ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200'}`}
                                        style={{ backgroundColor: s }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                        <button type="button" title="Bold" onClick={() => onPatch({ bold: !active.bold })}
                            className={cell(!!active.bold)}><b>B</b></button>
                        <button type="button" title="Italic" onClick={() => onPatch({ italic: !active.italic })}
                            className={cell(!!active.italic)}><i>I</i></button>
                        <button type="button" title="Underline" onClick={() => onPatch({ underline: !active.underline })}
                            className={cell(!!active.underline)}><u>U</u></button>
                        {(['left', 'center', 'right'] as const).map((a) => (
                            <button key={a} type="button" title={`Text align ${a}`} onClick={() => onPatch({ textAlign: a })}
                                className={cell(active.textAlign === a)}>
                                {a[0].toUpperCase()}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <div>
                <p className={labelCls}>Opacity · {Math.round(active.opacity * 100)}%</p>
                <input
                    type="range" min={0} max={100} value={Math.round(active.opacity * 100)}
                    onChange={(e) => onPatch({ opacity: Number(e.target.value) / 100 })}
                    className="mt-1 w-full accent-neutral-900"
                />
            </div>

            <div>
                <p className={labelCls}>Rotate · {active.angle}°</p>
                <input
                    type="range" min={-180} max={180} value={active.angle}
                    onChange={(e) => onPatch({ angle: Number(e.target.value) })}
                    className="mt-1 w-full accent-neutral-900"
                />
            </div>

            <div className="grid grid-cols-2 gap-1">
                <button type="button" title="Flip horizontally" onClick={() => onPatch({ flipX: !active.flipX })}
                    className={cell(active.flipX)}>⇄ Flip X</button>
                <button type="button" title="Flip vertically" onClick={() => onPatch({ flipY: !active.flipY })}
                    className={cell(active.flipY)}>⇅ Flip Y</button>
            </div>

            <div>
                <p className={labelCls}>Layer</p>
                <div className="mt-1 grid grid-cols-4 gap-1">
                    {LAYER_OPTIONS.map((o) => (
                        <button key={o.where} type="button" title={o.title} onClick={() => onLayer(o.where)} className={cell(false)}>
                            {o.label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <p className={labelCls}>Align to dieline</p>
                <div className="mt-1 grid grid-cols-6 gap-1">
                    {ALIGN_OPTIONS.map((o) => (
                        <button key={o.mode} type="button" title={o.title} onClick={() => onAlign(o.mode)} className={cell(false)}>
                            {o.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
