import { Link } from '@/navigation';

// Design Studio 的「免费设计服务」引导卡。文案与视觉只在这里维护一份，四个版面共用：
//   banner —— 模板库顶部横条（文案 + 右侧 CTA，窄屏自动堆叠）
//   rail   —— 快速定制页左栏的竖卡（与产品详情页那张 expert-help 卡同一套语言）
//   strip  —— 全屏编辑器左工具栏里的紧凑条（不能挤掉画布高度）
// 承诺口径：设计服务对**下单客户**免费，所以文案一律写 "with any order"，不写成无条件免费打样。

const CARD = 'rounded-2xl border-2 border-[#ffec5a] bg-gradient-to-b from-[#fff7bd] to-white shadow-sm';
const EYEBROW = 'text-xs font-bold uppercase tracking-wide text-neutral-500';
const TITLE = 'text-lg font-black text-neutral-900';
const BODY = 'text-sm leading-relaxed text-neutral-600';
const CTA = 'rounded-lg bg-neutral-900 py-3 text-center text-sm font-bold text-white transition hover:bg-neutral-800';
const NOTE = 'text-xs text-neutral-500';

const COPY = {
    eyebrow: 'No design skills? No problem',
    title: 'We’ll design it for you — free',
    body: 'Our in-house studio prepares the artwork and dieline for you at no charge: send a logo, a photo of your product, or just the idea — we’ll get the file print-ready before production starts.',
    cta: 'Get free design help',
    note: 'Free with any order · No obligation · Reply in 1 business day',
};

function HelpIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" />
            <path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z" />
        </svg>
    );
}

export function FreeDesignCallout({
    variant = 'banner',
    className = '',
}: {
    variant?: 'banner' | 'rail' | 'strip';
    className?: string;
}) {
    if (variant === 'strip') {
        return (
            <div className={`rounded-xl border-2 border-[#ffec5a] bg-[#fff7bd] p-3 ${className}`}>
                <p className="flex items-center gap-1.5 text-xs font-bold text-neutral-900">
                    <HelpIcon className="h-4 w-4 shrink-0 text-[#b58a00]" />
                    No design skills? We’ll do it free
                </p>
                <p className="mt-1 text-[11px] leading-snug text-neutral-600">
                    Our studio preps your artwork and dieline at no charge with any order.
                </p>
                <Link href="/quote" className="mt-2 block rounded-md bg-neutral-900 py-2 text-center text-[11px] font-bold text-white transition hover:bg-neutral-800">
                    {COPY.cta}
                </Link>
            </div>
        );
    }

    if (variant === 'rail') {
        return (
            <div className={`${CARD} p-5 ${className}`}>
                <p className={EYEBROW}>{COPY.eyebrow}</p>
                <h3 className={`mt-1 ${TITLE}`}>{COPY.title}</h3>
                <p className={`mt-2 ${BODY}`}>{COPY.body}</p>
                <Link href="/quote" className={`mt-4 block ${CTA}`}>
                    {COPY.cta}
                </Link>
                <p className={`mt-2 text-center ${NOTE}`}>{COPY.note}</p>
            </div>
        );
    }

    return (
        <div className={`${CARD} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 ${className}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ffec5a] text-neutral-900">
                <HelpIcon className="h-6 w-6" />
            </span>
            <div className="flex-1">
                <p className={EYEBROW}>{COPY.eyebrow}</p>
                <h3 className={`mt-0.5 ${TITLE}`}>{COPY.title}</h3>
                <p className={`mt-1.5 max-w-3xl ${BODY}`}>{COPY.body}</p>
            </div>
            <div className="shrink-0 sm:w-60">
                <Link href="/quote" className={`block ${CTA}`}>
                    {COPY.cta}
                </Link>
                <p className={`mt-2 text-center ${NOTE}`}>{COPY.note}</p>
            </div>
        </div>
    );
}
