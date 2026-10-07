import { ORDER_STATUS_LABEL } from '@/lib/orders';

const MAP: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  QUOTED: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-neutral-200 text-neutral-600',
};

export function QuoteStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${MAP[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {status}
    </span>
  );
}

const ORDER_MAP: Record<string, string> = {
  SUBMITTED: 'bg-[#ffec5a]/40 text-neutral-900',
  AWAITING_PAYMENT: 'bg-amber-100 text-amber-700',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-700',
  PAID: 'bg-blue-100 text-blue-700',
  IN_PRODUCTION: 'bg-purple-100 text-purple-700',
  SHIPPED: 'bg-cyan-100 text-cyan-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-neutral-200 text-neutral-600',
  EXPIRED: 'bg-neutral-200 text-neutral-600',
};

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ORDER_MAP[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </span>
  );
}

// 订单进度条：人工对接流程下客户最关心「现在到哪一步了」
const STEPS = ['SUBMITTED', 'AWAITING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'COMPLETED'];

export function OrderTimeline({ status }: { status: string }) {
  if (status === 'CANCELLED' || status === 'EXPIRED') return null;
  const idx = STEPS.indexOf(status);
  // 旧的 PENDING_PAYMENT 等同「已确认待付款」
  const current = idx >= 0 ? idx : status === 'PENDING_PAYMENT' ? 1 : 0;
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
      {STEPS.map((s, i) => {
        const done = i <= current;
        return (
          <li key={s} className="flex items-center gap-2">
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${done ? 'bg-neutral-900 text-[#ffec5a]' : 'bg-neutral-200 text-neutral-500'}`}>
              {i + 1}
            </span>
            <span className={done ? 'font-semibold text-neutral-900' : 'text-neutral-400'}>{ORDER_STATUS_LABEL[s]}</span>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-neutral-200" />}
          </li>
        );
      })}
    </ol>
  );
}
