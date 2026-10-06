'use client';

import { Link } from '@/navigation';

const svg = 'h-5 w-5';

function QuoteIcon() {
    return (
        <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}
function OrdersIcon() {
    return (
        <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="2" width="8" height="4" rx="1" />
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <path d="M9 12h6M9 16h6" />
        </svg>
    );
}
function AccountIcon() {
    return (
        <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
    );
}
function TopIcon() {
    return (
        <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
    );
}

const itemBase = 'flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition';

// 贴浏览器右下角的竖排悬浮工具条（后台不显示，由 SiteChrome 控制）
export function FloatingHelp() {
    const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

    return (
        <div className="fixed top-1/2 right-0 z-40 hidden -translate-y-1/2 sm:flex">
            <div className="flex w-16 flex-col overflow-hidden rounded-l-2xl border border-neutral-200 bg-white shadow-[-2px_0_20px_rgba(0,0,0,0.10)]">
                <Link href="/quote" className={`${itemBase} bg-[#ffec5a] font-bold text-neutral-900 hover:brightness-90`}>
                    <QuoteIcon />
                    Quote
                </Link>
                <Link href="/account/orders" className={`${itemBase} border-t border-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900`}>
                    <OrdersIcon />
                    Orders
                </Link>
                <Link href="/account" className={`${itemBase} border-t border-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900`}>
                    <AccountIcon />
                    Account
                </Link>
                <button type="button" onClick={toTop} className={`${itemBase} border-t border-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900`}>
                    <TopIcon />
                    Top
                </button>
            </div>
        </div>
    );
}
