import type { ReactNode } from 'react';

// Mega Menu 的分类示意图：11 个印刷/包装品类的线性插画。
// 为什么自己画：库里产品目前一张图都没有（实测 5 个产品 imgs=0），
// 而灰色字母块让 mega menu 看起来像没加载完。自有矢量 = 零版权风险、零请求、跟站点配色一致。
//
// 优先级在 SiteNav 里：产品真实图 it.image → 这里的分类示意图 → 字母占位。
// 所以将来后台给产品传了图，这些会自动让位，不用改代码。
//
// 统一约定：viewBox 96×96、strokeWidth 3、round linecap/linejoin、currentColor 描边 +
// 一处 #ffec5a 点缀（保持与站点的黄色语言一致）。新增分类就在这个 map 里加一条。

const S = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
} as const;

const ACCENT = '#ffec5a';

/** 所有图形共用一个外层 svg，保证尺寸/描边风格一致 */
function Art({ children }: { children: ReactNode }) {
    return (
        <svg viewBox="0 0 96 96" className="h-full w-full p-[18%] text-neutral-400 transition-colors group-hover:text-neutral-700" aria-hidden>
            {children}
        </svg>
    );
}

export const NAV_ART: Record<string, ReactNode> = {
    // 名片：两张错开的圆角卡
    'business-cards': (
        <Art>
            <rect x="16" y="38" width="52" height="34" rx="4" {...S} />
            <rect x="30" y="26" width="52" height="34" rx="4" fill={ACCENT} stroke="currentColor" strokeWidth={3} />
            <path d="M40 40h24M40 48h16" {...S} />
        </Art>
    ),
    // 吊牌：带孔 + 挂绳
    'cards-tags': (
        <Art>
            <path d="M34 30h34v46H34z" {...S} />
            <path d="M34 30 44 18h14l10 12" {...S} />
            <circle cx="51" cy="38" r="4" {...S} />
            <path d="M51 34c0-8-10-8-10-14" {...S} stroke={ACCENT} />
            <path d="M42 54h18M42 62h12" {...S} />
        </Art>
    ),
    // 贴纸/标签：圆标 + 方标叠放
    'stickers-labels': (
        <Art>
            <rect x="20" y="46" width="40" height="28" rx="5" {...S} />
            <circle cx="62" cy="40" r="18" fill={ACCENT} stroke="currentColor" strokeWidth={3} />
            <path d="M54 40h16M62 32v16" {...S} />
        </Art>
    ),
    // 盒子：开口纸箱（等轴）
    boxes: (
        <Art>
            <path d="M20 42l28-14 28 14-28 14z" {...S} />
            <path d="M20 42v22l28 14 28-14V42" {...S} />
            <path d="M48 56v22" {...S} stroke={ACCENT} />
        </Art>
    ),
    // 纸袋：带提手
    bags: (
        <Art>
            <path d="M26 36h44l-4 44H30z" {...S} />
            <path d="M26 36h44" {...S} />
            <path d="M38 36V26a10 10 0 0 1 20 0v10" {...S} stroke={ACCENT} />
        </Art>
    ),
    // 传单：A5 单页 + 折角
    'flyers-leaflets': (
        <Art>
            <path d="M30 18h28l14 14v46H30z" {...S} />
            <path d="M58 18v14h14" {...S} />
            <path d="M38 44h26M38 54h26M38 64h16" {...S} stroke={ACCENT} />
        </Art>
    ),
    // 画册：带书脊的对折本
    'brochures-books': (
        <Art>
            <path d="M48 26v48" {...S} />
            <path d="M48 26 22 32v42l26-6 26 6V32z" {...S} />
            <path d="M30 42h10M56 42h10" {...S} stroke={ACCENT} />
        </Art>
    ),
    // 横幅：易拉宝
    'banners-signs': (
        <Art>
            <path d="M30 18h36v44H30z" {...S} />
            <path d="M48 62v14" {...S} />
            <path d="M36 78h24" {...S} />
            <path d="M38 30h20M38 40h14" {...S} stroke={ACCENT} />
        </Art>
    ),
    // 周边：钥匙扣/磁贴（圆 + 挂环）
    'marketing-novelty': (
        <Art>
            <circle cx="48" cy="54" r="22" {...S} />
            <path d="m48 42 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill={ACCENT} stroke="currentColor" strokeWidth={2} />
            <path d="M48 32V22a6 6 0 0 1 12 0" {...S} />
        </Art>
    ),
    // 文具：信封
    'office-stationery': (
        <Art>
            <rect x="20" y="32" width="56" height="38" rx="4" {...S} />
            <path d="m20 36 28 20 28-20" {...S} stroke={ACCENT} />
        </Art>
    ),
    // 样品：色卡网格
    samples: (
        <Art>
            <rect x="22" y="22" width="24" height="24" rx="3" {...S} />
            <rect x="50" y="22" width="24" height="24" rx="3" fill={ACCENT} stroke="currentColor" strokeWidth={3} />
            <rect x="22" y="50" width="24" height="24" rx="3" fill={ACCENT} stroke="currentColor" strokeWidth={3} />
            <rect x="50" y="50" width="24" height="24" rx="3" {...S} />
        </Art>
    ),
};
