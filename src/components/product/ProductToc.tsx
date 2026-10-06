'use client';

import { useEffect, useState } from 'react';

export type TocItem = { id: string; label: string };

// 固定（position: fixed）在内容左侧沟槽、贴内容左缘；滚动时始终钉住不动。
// 仅当视口 ≥1930px（沟槽放得下）时渲染，否则什么都不显示。
export function ProductToc({ items }: { items: TocItem[] }) {
    const [active, setActive] = useState(items[0]?.id ?? '');

    useEffect(() => {
        const obs = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) setActive(e.target.id);
                });
            },
            { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
        );
        items.forEach((i) => {
            const el = document.getElementById(i.id);
            if (el) obs.observe(el);
        });
        return () => obs.disconnect();
    }, [items]);

    return (
        <div className="fixed top-1/2 z-30 hidden w-[220px] -translate-y-1/2 min-[1930px]:block" style={{ right: 'calc(50% + 688px)' }}>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="mb-3 px-1 text-xs font-bold uppercase tracking-wide text-neutral-400">On this page</p>
                <nav className="space-y-1">
                    {items.map((it) => {
                        const on = active === it.id;
                        return (
                            <a
                                key={it.id}
                                href={`#${it.id}`}
                                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${on ? 'bg-neutral-900 font-semibold text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
                                    }`}
                            >
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-[#ffec5a]' : 'bg-neutral-300'}`} />
                                {it.label}
                            </a>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
