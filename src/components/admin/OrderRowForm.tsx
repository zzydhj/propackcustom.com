'use client';

import { useEffect, useState } from 'react';
import { useActionState } from 'react';
import { updateOrder } from '@/features/admin/actions';
import { ORDER_STATUS_ZH } from '@/lib/orders';

const STATUSES = ['SUBMITTED', 'AWAITING_PAYMENT', 'PENDING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'EXPIRED'];

type Props = { id: string; status: string; trackingNo: string; carrier: string };

// 状态与物流：单一数据源 + 显式临时编辑态。
// 只读态直接展示服务端值（软刷新即对齐）；点「编辑」才挂载一个临时受控表单，
// 保存成功或取消即卸载。本地 state 从不与服务端长期共存，从根本上避免
// 「下拉/输入框与服务端漂移、必须硬刷新才对齐」这一整类问题。
export function OrderRowForm(props: Props) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <EditForm {...props} onDone={() => setEditing(false)} />
  ) : (
    <ReadOnlyView {...props} onEdit={() => setEditing(true)} />
  );
}

function ReadOnlyView({ status, trackingNo, carrier, onEdit }: Props & { onEdit: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-800">
        {ORDER_STATUS_ZH[status] ?? status}
      </span>
      {carrier && <span className="text-neutral-600">{carrier}</span>}
      {trackingNo && <span className="font-mono text-neutral-700">{trackingNo}</span>}
      <button
        type="button"
        onClick={onEdit}
        className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:border-neutral-900 hover:text-neutral-900"
      >
        编辑
      </button>
    </div>
  );
}

// 临时编辑态：mount 时以当前服务端值为初始值，受控编辑；保存成功即卸载回到只读。
function EditForm({ id, status, trackingNo, carrier, onDone }: Props & { onDone: () => void }) {
  const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(updateOrder, null);
  const [statusVal, setStatusVal] = useState(status);
  const [trackingVal, setTrackingVal] = useState(trackingNo);
  const [carrierVal, setCarrierVal] = useState(carrier);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        value={statusVal}
        onChange={(e) => setStatusVal(e.target.value)}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>{ORDER_STATUS_ZH[s] ?? s}</option>
        ))}
      </select>
      <input
        name="carrier"
        value={carrierVal}
        onChange={(e) => setCarrierVal(e.target.value)}
        placeholder="承运商"
        className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
      />
      <input
        name="trackingNo"
        value={trackingVal}
        onChange={(e) => setTrackingVal(e.target.value)}
        placeholder="物流单号"
        className="w-36 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
      />
      <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
        {pending ? '…' : '保存'}
      </button>
      <button type="button" onClick={onDone} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-neutral-900 hover:text-neutral-900">
        取消
      </button>
      {state?.error && <span className="text-xs text-red-600">保存失败</span>}
    </form>
  );
}
