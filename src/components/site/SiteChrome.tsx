'use client';

import { usePathname } from 'next/navigation';
import { FloatingHelp } from './FloatingHelp';

// 营销页头/页尾由服务端 layout 渲染后以 props 传入（避免客户端组件渲染 async 服务端组件导致 hydration 崩溃）
// 进入后台 /admin 时不渲染页头页尾，让后台占满全屏
export function SiteChrome({ children, header, footer }: { children: React.ReactNode; header: React.ReactNode; footer: React.ReactNode }) {
    const pathname = usePathname() ?? '';
    const isAdmin = pathname.includes('/admin');

    if (isAdmin) return <>{children}</>;

    return (
        <>
            {header}
            <div className="min-h-[60vh] bg-[#f8f8f8]">{children}</div>
            {footer}
            <FloatingHelp />
        </>
    );
}
