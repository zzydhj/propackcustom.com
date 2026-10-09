'use client';

import dynamic from 'next/dynamic';

// 预览依赖 Fabric（需要 window），与其它设计器入口一样强制 ssr:false
const GuidedWorkspace = dynamic(() => import('./GuidedWorkspace'), {
    ssr: false,
    loading: () => (
        <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-10 2xl:px-12 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="h-72 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-72 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
    ),
});

type Props = {
    productType: string;
    templateId: string;
    templateSlug: string;
    templateName: string;
    widthMm: number;
    heightMm: number;
    bleedMm: number;
    safeAreaMm: number;
    dielineSvg?: string;
    initialScene?: string;
};

export function GuidedStudio(props: Props) {
    return <GuidedWorkspace {...props} />;
}
