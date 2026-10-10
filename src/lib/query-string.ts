// 在现有查询串上覆盖若干参数拼出新 URL —— 分页/搜索/编辑态都放 URL，不用客户端 state。
// /design、/design/[productType]、/admin/templates 三个列表页都要做同一件事，
// 之前各自抄了一份 6 行的 qs()，改一处忘两处的风险没有意义。

/** 合并并拼接查询串：值为 undefined/空串的键会被丢掉；返回带前导 ? 的形式（无参数则空串） */
export function withQuery(
    base: Record<string, string | undefined>,
    over: Record<string, string | undefined>,
): string {
    const merged = { ...base, ...over };
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : '';
}
