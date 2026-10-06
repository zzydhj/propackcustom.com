'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { signOutAction } from '@/features/auth/actions';
import { LocaleSwitcher } from './LocaleSwitcher';
import type { NavGroup } from '@/lib/megaMenu';

// 顶部导航 + 产品 Mega Menu（左侧主分类竖列 + 右侧子分类分组的小方块）
export function SiteNav({ groups, signedIn }: { groups: NavGroup[]; signedIn: boolean }) {
    const t = useTranslations('Nav');
    const brand = useTranslations('Brand');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    const links = [
        { href: '/quote', label: t('quote') },
        { href: '/about', label: t('about') },
    ];

    const current = groups[active];

    return (
        <header
            className="sticky top-0 z-50 w-full border-b border-neutral-100 bg-white"
            onMouseLeave={() => setOpen(false)}
        >
            <div className="container-site flex h-[72px] items-center gap-8">
                {/* Logo */}
                <Link href="/" className="flex shrink-0 items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-md bg-[#ffec5a] font-black text-neutral-900">P</span>
                    <span className="font-display text-lg font-extrabold tracking-tight text-neutral-900">{brand('name')}</span>
                </Link>

                {/* Desktop nav */}
                <nav className="hidden items-center gap-7 lg:flex">
                    <Link href="/" className="text-[15px] font-medium text-neutral-600 transition-colors hover:text-neutral-900">
                        {t('home')}
                    </Link>

                    {/* Products trigger */}
                    <button
                        type="button"
                        onMouseEnter={() => setOpen(true)}
                        onClick={() => setOpen((v) => !v)}
                        className={`flex items-center gap-1 text-[15px] font-medium transition-colors ${open ? 'text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
                            }`}
                    >
                        {t('products')}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
                            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    {links.map((l) => (
                        <Link
                            key={l.href}
                            href={l.href as never}
                            onMouseEnter={() => setOpen(false)}
                            className="text-[15px] font-medium text-neutral-600 transition-colors hover:text-neutral-900"
                        >
                            {l.label}
                        </Link>
                    ))}
                </nav>

                {/* Right tools */}
                <div className="ml-auto flex items-center gap-3">
                    <div className="hidden items-center rounded-full border border-neutral-200 px-3 focus-within:border-neutral-900 md:flex">
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
                        <div className="flex items-center gap-2">
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
                            <Link href="/login" className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
                                {t('login')}
                            </Link>
                            <Link href="/register" className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-neutral-700">
                                {t('register')}
                            </Link>
                        </>
                    )}
                </div>
            </div>

            {/* Mega Menu panel */}
            {open && (
                <div className="absolute inset-x-0 top-full hidden border-b border-neutral-200 bg-white shadow-[0_20px_40px_-24px_rgba(0,0,0,0.25)] lg:block">
                    <div className="h-1 w-full bg-[#ffec5a]" />
                    <div className="container-site grid grid-cols-[220px_minmax(0,1fr)] gap-8 py-8">
                        {/* Left: main category column */}
                        <div>
                            <p className="mb-3 px-3 text-xs font-bold uppercase tracking-wide text-neutral-400">{t('products')}</p>
                            <ul className="max-h-[62vh] space-y-1 overflow-auto pr-1">
                                {groups.map((g, i) => (
                                    <li key={g.id}>
                                        <button
                                            type="button"
                                            onMouseEnter={() => setActive(i)}
                                            onClick={() => setActive(i)}
                                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${i === active ? 'bg-[#ffec5a] text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'
                                                }`}
                                        >
                                            {g.label}
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={i === active ? 'text-neutral-900' : 'text-neutral-300'}>
                                                <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Right: subgroups of the active category */}
                        <div className="max-h-[62vh] space-y-6 overflow-auto pr-2">
                            {current?.subgroups.map((sg) => (
                                <div key={sg.label}>
                                    <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-neutral-900">
                                        <span className="h-4 w-1 rounded bg-[#ffec5a]" />
                                        {sg.label}
                                    </h4>
                                    <div className="grid gap-x-3 gap-y-4 [grid-template-columns:repeat(auto-fill,minmax(92px,1fr))]">
                                        {sg.items.map((it) => (
                                            <Link key={it.label} href={it.href as never} className="group flex flex-col items-center">
                                                <div className="aspect-square w-full overflow-hidden rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200 ring-1 ring-neutral-200 transition group-hover:ring-[#ffec5a]">
                                                    {it.image ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={it.image} alt={it.label} className="h-full w-full object-cover transition group-hover:scale-105" />
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

                            {current && (
                                <div className="border-t border-neutral-100 pt-4">
                                    <Link href="/products" className="text-sm font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">
                                        {t('viewAll')} →
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}
