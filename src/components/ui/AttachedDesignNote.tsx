'use client';

import { clearDesignBridge } from '@/lib/design-bridge';

// 报价/下单表单上明示「现在挂着哪份作品」并给一键不挂。
// 桥不再自动清（自动清会与 external store 的快照复核打架，把 designId 从提交里抹掉），
// 所以透明化就靠这一行：客户看得见挂了什么，也能立刻撤掉。
export function AttachedDesignNote({ designId }: { designId: string }) {
    if (!designId) return null;
    return (
        <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span>
                Attaching your saved design <b className="font-semibold text-neutral-900">#{designId.slice(0, 8)}</b>
            </span>
            <button
                type="button"
                onClick={clearDesignBridge}
                className="underline decoration-neutral-300 underline-offset-2 transition hover:text-neutral-900"
            >
                don’t attach
            </button>
        </p>
    );
}
