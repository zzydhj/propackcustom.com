'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';

// 编辑器只能在客户端加载（fabric 依赖 window）；这里强制 ssr:false。
const DesignCanvas = dynamic(() => import('./DesignCanvas'), {
    ssr: false,
    loading: () => (
        <div className="grid h-full w-full place-items-center bg-neutral-50 text-sm text-neutral-400">Loading designer…</div>
    ),
});

// 全屏左右工作台容器：fixed 覆盖站点导航/页脚，占满整个浏览器视口。
export function DesignStudio({
    productType,
    widthMm = 100,
    heightMm = 100,
    initialScene,
    designId,
    templateId,
    name,
    templateName,
    dielineSvg,
    bleedMm,
    safeAreaMm,
    fullBleed,
    templateSlug,
}: {
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
    /** 满版模板标记（来自 DesignTemplate.fullBleed），透传给画布做预检 */
    fullBleed?: boolean;
    templateSlug?: string;
}) {
    // 编辑器全屏：锁定背景滚动（否则底层 header/footer 仍在文档流，可滚出滞动条）
    useEffect(() => {
        const html = document.documentElement;
        const prev = html.style.overflow;
        html.style.overflow = 'hidden';
        return () => { html.style.overflow = prev; };
    }, []);

    return (
        <div className="fixed inset-0 z-[60] flex bg-neutral-50">
            <DesignCanvas
                productType={productType}
                widthMm={widthMm}
                heightMm={heightMm}
                initialScene={initialScene}
                designId={designId}
                templateId={templateId}
                name={name}
                templateName={templateName}
                dielineSvg={dielineSvg}
                bleedMm={bleedMm}
                safeAreaMm={safeAreaMm}
                fullBleed={fullBleed}
                templateSlug={templateSlug}
            />
        </div>
    );
}
