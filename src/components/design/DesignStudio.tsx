'use client';

import dynamic from 'next/dynamic';

// 画布依赖 window，必须 ssr:false；把 dynamic 放在这个 client 组件里（App Router 规则：
// ssr:false 的 next/dynamic 只能在 client component 使用）。
const DesignCanvas = dynamic(() => import('./DesignCanvas'), {
    ssr: false,
    loading: () => <div className="grid h-[400px] place-items-center text-sm text-neutral-400">Loading design canvas…</div>,
});

export function DesignStudio({
    productType,
    widthMm = 100,
    heightMm = 100,
    initialScene,
    designId,
    templateId,
    name,
}: {
    productType: string;
    widthMm?: number;
    heightMm?: number;
    initialScene?: string;
    designId?: string;
    templateId?: string | null;
    name?: string;
}) {
    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 className="text-lg font-bold text-neutral-900">Design Studio</h2>
                <p className="text-sm text-neutral-500">
                    Product type: <span className="font-mono">{productType}</span> — pick a template, edit text and artwork in your browser, then save and order.
                </p>
            </div>
            <DesignCanvas productType={productType} widthMm={widthMm} heightMm={heightMm} initialScene={initialScene} designId={designId} templateId={templateId} name={name} />
        </div>
    );
}
