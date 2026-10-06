'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/navigation';
import { signOutAction } from '@/features/auth/actions';

type IconName = 'dashboard' | 'quotes' | 'orders' | 'products' | 'categories' | 'wallet' | 'logout' | 'globe';

function Icon({ name }: { name: IconName }) {
    const paths: Record<IconName, React.ReactNode> = {
        dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
        quotes: <><path d="M9 7h6M9 11h6M9 15h4" /><rect x="4" y="3" width="16" height="18" rx="2" /></>,
        orders: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" /></>,
        products: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></>,
        categories: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
        wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>,
        logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
        globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" /></>,
    };
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {paths[name]}
        </svg>
    );
}

const NAV: { href: string; label: string; icon: IconName }[] = [
    { href: '/admin', label: '仪表盘', icon: 'dashboard' },
    { href: '/admin/quotes', label: '报价管理', icon: 'quotes' },
    { href: '/admin/orders', label: '订单管理', icon: 'orders' },
    { href: '/admin/products', label: '商品管理', icon: 'products' },
    { href: '/admin/categories', label: '分类管理', icon: 'categories' },
    { href: '/admin/wallet', label: '钱包管理', icon: 'wallet' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const t = useTranslations('Admin');

    const isActive = (href: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href));

    return (
        <div className="min-h-screen bg-[#f5f6f8]">
            {/* 贴左、固定、整屏高的深色竖排菜单 */}
            <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-[#1b1f3b] text-white">
                <div className="flex items-center gap-2 px-6 py-5">
                    <span className="grid h-9 w-9 place-items-center rounded-md bg-[#ffec5a] font-black text-neutral-900">P</span>
                    <div className="leading-tight">
                        <p className="text-sm font-bold">ProPack 管理后台</p>
                        <p className="text-[11px] text-white/50">运营控制中心</p>
                    </div>
                </div>
                <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3">
                    {NAV.map((item) => {
                        const active = isActive(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href as never}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-white/10 text-[#ffec5a]' : 'text-white/70 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <Icon name={item.icon} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
                <div className="border-t border-white/10 p-3">
                    <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white">
                        <Icon name="globe" /> 查看前台
                    </Link>
                    <form action={signOutAction}>
                        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white">
                            <Icon name="logout" /> 退出登录
                        </button>
                    </form>
                </div>
            </aside>

            {/* 右侧内容区 */}
            <div className="pl-64">
                <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white px-8 py-4">
                    <h1 className="text-lg font-bold text-neutral-900">{t('title')} · {NAV.find((n) => isActive(n.href))?.label ?? '仪表盘'}</h1>
                    <span className="text-sm text-neutral-500">中文</span>
                </header>
                <main className="mx-auto max-w-[1440px] p-8">{children}</main>
            </div>
        </div>
    );
}
