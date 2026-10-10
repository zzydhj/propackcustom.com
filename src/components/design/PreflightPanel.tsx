'use client';

import type { PreflightIssue } from './useFabricCanvas';

// 印前自检列表：纯展示，点击某行交给上层去画布上选中并滚过去。
type Props = {
    issues: PreflightIssue[];
    onFocus: (issue: PreflightIssue) => void;
};

const MESSAGE: Record<PreflightIssue['kind'], string> = {
    'outside-bleed': 'sits outside the bleed area — it will be trimmed away entirely',
    'crossing-trim': 'crosses the trim line — part of it will be cut off',
    'text-outside-safe': 'is outside the safe area — too close to the cut line',
    'cmyk-out-of-gamut': 'is a colour four-colour printing cannot reach — it will print duller',
    'no-full-bleed': 'nothing covers the cut shape — a white edge will show on the printed piece',
};

export default function PreflightPanel({ issues, onFocus }: Props) {
    const errors = issues.filter((i) => i.severity === 'error').length;
    const warnings = issues.length - errors;
    const hasGamut = issues.some((i) => i.kind === 'cmyk-out-of-gamut');

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Pre-flight check</p>
                {issues.length > 0 && (
                    <p className="text-[11px] font-semibold">
                        {errors > 0 && <span className="text-[#ff4d4f]">{errors} to fix </span>}
                        {warnings > 0 && <span className="text-[#d48806]">{warnings} warning{warnings > 1 ? 's' : ''}</span>}
                    </p>
                )}
            </div>

            {issues.length === 0 ? (
                <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700 ring-1 ring-green-100">
                    Nothing bleeds off the cut line ✓
                </p>
            ) : (
                <ul className="space-y-1">
                    {issues.map((issue) => {
                        // index < 0 = 整张图级别的问题（如没铺满出血），画布上没有对应对象可选中
                        const selectable = issue.index >= 0;
                        return (
                            <li key={`${issue.index}-${issue.kind}`}>
                                <button
                                    type="button"
                                    onClick={() => onFocus(issue)}
                                    title={selectable ? 'Click to select this object on the canvas' : undefined}
                                    className={`w-full rounded-lg border bg-white px-2.5 py-2 text-left text-xs transition ${selectable ? 'hover:border-neutral-900' : 'cursor-default'} ${issue.severity === 'error' ? 'border-[#ff4d4f]/50' : 'border-[#d48806]/50'}`}
                                >
                                    {issue.color && (
                                        <span
                                            className="mr-1.5 inline-block h-3 w-3 shrink-0 rounded-sm border border-neutral-300 align-[-2px]"
                                            style={{ backgroundColor: issue.color }}
                                        />
                                    )}
                                    <span className="font-semibold text-neutral-900">{issue.label}</span>{' '}
                                    <span className="text-neutral-500">{MESSAGE[issue.kind]}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {hasGamut && (
                <p className="text-[11px] leading-relaxed text-neutral-400">
                    Colour check is an approximate offset-gamut estimate, not an ICC conversion — order a physical
                    proof for brand-critical colours, or quote a spot (Pantone) ink.
                </p>
            )}
        </div>
    );
}
