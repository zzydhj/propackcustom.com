'use client';

import { useSyncExternalStore } from 'react';

// 设计→下单/报价的一次性桥：localStorage 里放一个 UserDesign id。
// 之前每个消费端各自 useEffect + setState 读一遍，既重复又踩 React 的
// 「effect 里同步 setState」规则；统一收到这里，用 external store 订阅读值。
export const DESIGN_BRIDGE_KEY = 'pp_order_design';

// 关键：同标签页里 setItem/removeItem 不会触发 storage 事件（HTML5 语义），
// 所以自己的写入必须手动广播，否则 UI 与提交载荷还停在旧值上。
const BRIDGE_EVENT = 'pp-design-bridge-changed';

export function subscribeBridge(callback: () => void) {
    window.addEventListener('storage', callback);
    window.addEventListener(BRIDGE_EVENT, callback);
    return () => {
        window.removeEventListener('storage', callback);
        window.removeEventListener(BRIDGE_EVENT, callback);
    };
}
export const getBridgeSnapshot = () => localStorage.getItem(DESIGN_BRIDGE_KEY);
/** SSR 一律 null：不把作品 id 烘进 HTML，避免 hydration 不一致 */
export const getBridgeServerSnapshot = () => null;

/**
 * 读桥里的作品 id。
 *
 * 注意：**不在挂载时 removeItem**。上一版这么做，与 useSyncExternalStore 挂载后的
 * 快照复核冲突（值被清 → 快照变了 → 重渲染 → hidden input 约 10ms 后被卸掉），
 * designId 根本提交不出去。现在的语义：写覆盖、显式清除（客户点“don’t attach”或列表页 Discard）。
 */
export function useDesignBridge(): string {
    return useSyncExternalStore(subscribeBridge, getBridgeSnapshot, getBridgeServerSnapshot) ?? '';
}

/** 写入端：保存作品后把 id 放进桥，并通知本页的订阅者 */
export function saveDesignBridge(id: string): void {
    try {
        localStorage.setItem(DESIGN_BRIDGE_KEY, id);
    } catch { /* 隐私模式忽略 */ }
    window.dispatchEvent(new Event(BRIDGE_EVENT));
}

/** 清除桥（消费完成或客户主动不挂），同样要广播，否则表单里的 hidden input 不会消失 */
export function clearDesignBridge(): void {
    try {
        localStorage.removeItem(DESIGN_BRIDGE_KEY);
    } catch { /* 隐私模式忽略 */ }
    window.dispatchEvent(new Event(BRIDGE_EVENT));
}
