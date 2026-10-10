'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { signOutAction } from '@/features/auth/actions';
import { LocaleSwitcher } from './LocaleSwitcher';
import type { NavGroup } from '@/lib/megaMenu';

// 顶部导航 + 产品 Mega Menu（左侧主分类竖列 + 右侧子分类分组的小方块）
//
// ── 交互全部走 CSS，不依赖 React 状态（也不依赖水合） ──
// 1) 面板弹出：Products 按钮与面板同属一个 group/mega 悬停区（self-stretch 撑满 header 高度，
//    消除按钮与面板间的空隙）。面板是该 div 的 DOM 后代，所以鼠标从按钮移到面板不会误关；
//    移到 Home / Logo / Quote 等任何其它头部元素都会离开触发区 → 自动关闭。
//    以前靠 onMouseEnter + setState：脚本没跑起来（或还没水合）就完全弹不出来，实测踩过。
// 2) 左列切右列：每个分类的面板放在**该分类自己的 <li> 里**，绝对定位投送到右列，靠 `li:hover` 显示。
//    零 JS、零水合依赖；而且鼠标从菜单滑到面板上时 hover 不会断（面板是 li 的后代）。
//    以前两种写法都会“跳内容”：靠 setState 切 → 没 JS 就卡在第一个分类；
//    面板放右列 → 鼠标穿过列间隙时没有任何 li 被 hover，面板当场跳回第一块。
// 3) 没悬停任何分类时的静止态 = 右列那块默认面板（第一个分类）；左列一有项被 hover 就把它收掉。
//    左列项之间的间隙走 li 自己的 padding（不用 space-y-1）—— 外边距会造出不属于任何 li 的空域，
//    鼠标经过时没人被 hover，静止态会闪一下（看起来就是“内容跳”）。
//
// 左列不给内部滚动条（11 个分类全部展开）；面板总高写死，内容高的分类由右列自己滚动（见 globals.css）。

// 面板显隐：base 隐藏 → 悬停/聚焦显示；open（点击态）直接显示。三组互斥类，不叠加同优先级冲突
// 面板自身不滚动（高度与左右列分工由 globals.css 的 .mega-grid/.mega-left/.mega-right 管）
const PANEL = 'absolute inset-x-0 top-full border-b border-neutral-200 bg-white shadow-[0_20px_40px_-24px_rgba(0,0,0,0.25)] transition-opacity duration-150 hidden lg:block';
const PANEL_OFF = 'invisible opacity-0';
const PANEL_ON = 'visible opacity-100';
const PANEL_HOVER = 'lg:group-hover/mega:visible lg:group-hover/mega:opacity-100 lg:group-focus-within/mega:visible lg:group-focus-within/mega:opacity-100';

/** 一个分类的面板内容：子分类网格 + 查看全部 */
function CategoryPanel({ g, viewAll }: { g: NavGroup; viewAll: string }) {
    return (
        <div className="space-y-6">
            {g.subgroups.map((sg) => (
                <div key={sg.label}>
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-neutral-900">
                        <span className="h-4 w-1 rounded bg-[#ffec5a]" />
                        {sg.label}
                    </h4>
                    <div className="grid gap-x-3 gap-y-4 [grid-template-columns:repeat(auto-fill,minmax(92px,1fr))]">
                        {sg.items.map((it) => (
                            <Link key={it.label} href={it.href as never} className="group flex flex-col items-center">
                                {/* 放大效果挂在方块本体上：以前只挂在 <img> 上，而 NAV_CATALOG 没有 image 字段，
                                   所以那个分支从不渲染 —— 放大实际上从来没生效过 */}
                                <div className="aspect-square w-full overflow-hidden rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200 ring-1 ring-neutral-200 transition duration-200 group-hover:scale-[1.04] group-hover:ring-[#ffec5a]">
                                    {it.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={it.image} alt={it.label} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="grid h-full w-full place-items-center font-display text-lg font-black text-neutral-300">
                                            {it.label.trim().slice(0, 1)}
                                        </div>
                                    )}
                                </div>
                                <p className="mt-1.5 w-full text-center text-[11px] leading-tight text-neutral-600 group-hover:text-neutral-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                                    {it.label}
                                </p>
                            </Link>
                        ))}
                    </div>
                </div>
            ))}
            <div className="border-t border-neutral-100 pt-4">
                <Link href="/products" className="text-sm font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">
                    {viewAll} →
                </Link>
            </div>
        </div>
    );
}

export function SiteNav({ groups, signedIn }: { groups: NavGroup[]; signedIn: boolean }) {
    const t = useTranslations('Nav');
    const brand = useTranslations('Brand');
    // 点击展开态：只服务触屏/键盘（悬停不经过它）
    const [open, setOpen] = useState(false);
    // 移动端菜单：lg 以下整条桌面导航不渲染，必须有个收纳入口，
    // 否则手机上只剩 Logo + 账户按钮（右侧那组在 390px 还会撑出横向滚动条）
    const [menu, setMenu] = useState(false);
    // 移动端没有 hover 概念，所以 Products 在抽屉里给成可展开的分类列表，
    // 不能只留一条死链接（窄视口下想逛分类却无路可走）
    const [mProd, setMProd] = useState(false);

    const links = [
        { href: '/quote', label: t('quote') },
        { href: '/design/label', label: t('design') },
        { href: '/about', label: t('about') },
    ];

    return (
        <header className="sticky top-0 z-50 w-full border-b border-neutral-100 bg-white">
            <div className="container-site flex h-[72px] items-center gap-4 lg:gap-8">
                {/* Logo */}
                <Link href="/" className="flex shrink-0 items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-md bg-[#ffec5a] font-black text-neutral-900">P</span>
                    <span className="font-display text-lg font-extrabold tracking-tight text-neutral-900">{brand('name')}</span>
                </Link>

                {/* Desktop nav */}
                <nav className="hidden items-center self-stretch gap-7 lg:flex">
                    <Link href="/" className="flex items-center text-[15px] font-medium text-neutral-600 transition-colors hover:text-neutral-900">
                        {t('home')}
                    </Link>

                    {/* Products 悬停触发区：按钮 + mega 面板同属一个 group/mega */}
                    <div className="group/mega flex items-center self-stretch">
                        <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => setOpen((v) => !v)}
                            className={`flex items-center gap-1 text-[15px] font-medium transition-colors group-hover/mega:text-neutral-900 ${open ? 'text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
                                }`}
                        >
                            {t('products')}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition-transform group-hover/mega:rotate-180 ${open ? 'rotate-180' : ''}`}>
                                <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>

                        {/* Mega Menu 面板（常驻 DOM，靠 visibility 切换 → 没水合也能悬停弹出） */}
                        <div className={`${PANEL} ${open ? PANEL_ON : `${PANEL_OFF} ${PANEL_HOVER}`}`}>
                            <div className="h-1 w-full bg-[#ffec5a]" />
                            <div className="mega-grid container-site relative grid grid-cols-[220px_minmax(0,1fr)] gap-8 py-8">
                                {/* Left: 分类列表。全部展开，不参与面板高度计算 */}
                                <div className="mega-left">
                                    <p className="mb-3 px-3 text-xs font-bold uppercase tracking-wide text-neutral-400">{t('products')}</p>
                                    <ul>
                                        {groups.map((g) => (
                                            // 间隙放进 li 自己的 padding（而不是 space-y-1 的外边距）：
                                            // 外边距会在两项之间留出不属于任何 li 的空域，鼠标经过时没人被 hover
                                            // → 静止态面板闪一下，看起来就是“内容跳”（用户报的正是这个）
                                            // 这里**不能**给 li 加 relative：面板的 left/right 是按整块网格算的，
                                            // 一旦 li 自己成为定位基准（只有 220px 宽），left:240px + right:20px
                                            // 会算出负宽度→面板被压成 0 宽，高亮在但内容完全看不见（实测踩过）。
                                            <li key={g.id} className="mega-cat group/cat py-0.5">
                                                <span className="flex w-full cursor-default items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-neutral-600 transition group-hover/cat:bg-[#ffec5a] group-hover/cat:text-neutral-900">
                                                    {g.label}
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-neutral-300 group-hover/cat:text-neutral-900">
                                                        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </span>

                                                {/* 该分类的面板：绝对定位到右列（位置由 globals.css 的变量算），
                                                    只有自己的 li 被 hover 时出现；鼠标从菜单滑进面板不会断 hover */}
                                                <div className="mega-panel">
                                                    <CategoryPanel g={g} viewAll={t('viewAll')} />
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Right: 静止态（没悬停任何分类时）显示第一个分类；
                                    内容高过面板时自己滚，不会顶高整块面板 */}
                                <div className="mega-default">
                                    {groups[0] && <CategoryPanel g={groups[0]} viewAll={t('viewAll')} />}
                                </div>
                            </div>
                        </div>
                    </div>

                    {links.map((l) => (
                        <Link
                            key={l.href}
                            href={l.href as never}
                            className="flex items-center text-[15px] font-medium text-neutral-600 transition-colors hover:text-neutral-900"
                        >
                            {l.label}
                        </Link>
                    ))}
                </nav>

                {/* Right tools */}
                <div className="ml-auto flex items-center gap-3">
                    {/* 搜索框是装饰性入口（无提交逻辑），只到 xl+ 才占位：
                        否则 lg 断点带（1024～1174）右组会把头部撑出横向滚动条 */}
                    <div className="hidden items-center rounded-full border border-neutral-200 px-3 focus-within:border-neutral-900 xl:flex">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-neutral-400" aria-hidden>
                            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                            <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        <input
                            className="w-44 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-neutral-400"
                            placeholder={t('searchPlaceholder')}
                        />
                    </div>

                    <div className="hidden sm:block">
                        <LocaleSwitcher />
                    </div>

                    {signedIn ? (
                        <div className="hidden items-center gap-2 lg:flex">
                            <Link href="/account" className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
                                {t('account')}
                            </Link>
                            <form action={signOutAction}>
                                <button className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-neutral-700">
                                    {t('signOut')}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <>
                            <Link href="/login" className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 lg:block">
                                {t('login')}
                            </Link>
                            <Link href="/register" className="hidden rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-neutral-700 lg:block">
                                {t('register')}
                            </Link>
                        </>
                    )}

                    {/* 移动端汉堡开关（lg 以上隐藏） */}
                    <button
                        type="button"
                        aria-label={t('menu')} aria-expanded={menu}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-neutral-200 text-neutral-700 transition hover:border-neutral-900 lg:hidden"
                        onClick={() => { setMenu((v) => !v); setOpen(false); }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                            {menu
                                ? <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                : <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
                        </svg>
                    </button>
                </div>
            </div>

            {/* 移动端面板：导航与账户动作全部收在这里，不再挤在一行 */}
            {menu && (
                <div className="border-t border-neutral-100 bg-white lg:hidden">
                    <nav className="container-site grid gap-1 py-3">
                        <Link href="/" onClick={() => setMenu(false)} className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-neutral-700 hover:bg-neutral-50">
                            {t('home')}
                        </Link>

                        {/* Products 在窄视口没有 hover，给成可展开的分类列表（与桌面 mega 同一份 NAV_CATALOG） */}
                        <div className="rounded-lg border border-neutral-200">
                            <button
                                type="button"
                                aria-expanded={mProd}
                                onClick={() => setMProd((v) => !v)}
                                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[15px] font-medium text-neutral-700"
                            >
                                {t('products')}
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`transition-transform ${mProd ? 'rotate-180' : ''}`} aria-hidden>
                                    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            {mProd && (
                                <div className="grid gap-0.5 border-t border-neutral-100 p-2">
                                    {groups.map((g) => (
                                        <Link key={g.id} href="/products" onClick={() => setMenu(false)} className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900">
                                            {g.label}
                                        </Link>
                                    ))}
                                    <Link href="/products" onClick={() => setMenu(false)} className="mt-1 rounded-md px-3 py-2 text-sm font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">
                                        {t('viewAll')} →
                                    </Link>
                                </div>
                            )}
                        </div>

                        {links.map((l) => (
                            <Link key={l.href} href={l.href as never} onClick={() => setMenu(false)} className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-neutral-700 hover:bg-neutral-50">
                                {l.label}
                            </Link>
                        ))}
                        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                            {signedIn ? (
                                <>
                                    <Link href="/account" onClick={() => setMenu(false)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700">
                                        {t('account')}
                                    </Link>
                                    <form action={signOutAction}>
                                        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700">
                                            {t('signOut')}
                                        </button>
                                    </form>
                                </>
                            ) : (
                                <>
                                    <Link href="/login" onClick={() => setMenu(false)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700">
                                        {t('login')}
                                    </Link>
                                    <Link href="/register" onClick={() => setMenu(false)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
                                        {t('register')}
                                    </Link>
                                </>
                            )}
                            {/* 语言切换在头部是 sm 以上才显示，移动端靠这里拿到 */}
                            <div className="ml-auto">
                                <LocaleSwitcher />
                            </div>
                        </div>
                    </nav>
                </div>
            )}
        </header>
    );
}
