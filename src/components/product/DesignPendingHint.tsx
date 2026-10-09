'use client';

import { useSyncExternalStore } from 'react';
import { clearDesignBridge, getBridgeServerSnapshot, getBridgeSnapshot, subscribeBridge } from '@/lib/design-bridge';

// 设计→下单的桥只有产品详情页会消费。
// 客户从设计器/定制页落到列表页时必须显式告诉他「作品已就绪，选个产品就自动挂上」，
// 否则这个 key 会残留，之后任意一次详情页访问都莫名挂上旧作品。
export default function DesignPendingHint() {
    // clearDesignBridge 会自己广播，同标签页的丢弃也能立即重绘，不需额外的本地标记
    const stored = useSyncExternalStore(subscribeBridge, getBridgeSnapshot, getBridgeServerSnapshot);

    if (!stored) return null;

    return (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#ffec5a] px-4 py-3 text-sm text-neutral-900">
            <span>
                <b>Your design is ready.</b> Pick a product below and it will be attached automatically.
            </span>
            <button
                type="button"
                className="rounded-lg border border-neutral-900 px-3 py-1.5 font-semibold transition hover:bg-neutral-900 hover:text-white"
                onClick={clearDesignBridge}
            >
                Discard design
            </button>
        </div>
    );
}
