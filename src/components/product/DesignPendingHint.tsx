'use client';

import { useSyncExternalStore, useState } from 'react';

// 设计→下单的桥（localStorage key: pp_order_design）只有产品详情页会消费。
// 客户从设计器/定制页落到列表页时必须显式告诉他「作品已就绪，选个产品就自动挂上」，
// 否则这个 key 会残留，之后任意一次详情页访问都莫名挂上旧作品。
const BRIDGE_KEY = 'pp_order_design';

// 用 external store 订阅而不是 effect 里 setState：SSR 返回 null，客户端读出真值，不会 hydration 不一致
function subscribe(callback: () => void) {
    window.addEventListener('storage', callback);
    return () => window.removeEventListener('storage', callback);
}
const getSnapshot = () => localStorage.getItem(BRIDGE_KEY);
const getServerSnapshot = () => null;

export default function DesignPendingHint() {
    const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    // 同标签页里自己 removeItem 不会触发 storage 事件，所以丢弃要另用一个标记
    const [discarded, setDiscarded] = useState(false);

    if (!stored || discarded) return null;

    return (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#ffec5a] px-4 py-3 text-sm text-neutral-900">
            <span>
                <b>Your design is ready.</b> Pick a product below and it will be attached automatically.
            </span>
            <button
                type="button"
                className="rounded-lg border border-neutral-900 px-3 py-1.5 font-semibold transition hover:bg-neutral-900 hover:text-white"
                onClick={() => {
                    try {
                        localStorage.removeItem(BRIDGE_KEY);
                    } catch { /* 隐私模式忽略 */ }
                    setDiscarded(true);
                }}
            >
                Discard design
            </button>
        </div>
    );
}
