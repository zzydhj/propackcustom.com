'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { updateOrder } from '@/features/admin/actions';
import { ORDER_STATUS_ZH } from '@/lib/orders';

export function OrderRowForm({ id, status, trackingNo, carrier }: { id: string; status: string; trackingNo: string; carrier: string }) {
  const t = useTranslations('Admin');
  const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(updateOrder, null);
  const statuses = ['SUBMITTED', 'AWAITING_PAYMENT', 'PENDING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'EXPIRED'];

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select name="status" defaultValue={status} className="rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900">
        {statuses.map((s) => (
          <option key={s} value={s}>{ORDER_STATUS_ZH[s] ?? s}</option>
        ))}
      </select>
      <input name="carrier" defaultValue={carrier} placeholder={t('carrier')} className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900" />
      <input name="trackingNo" defaultValue={trackingNo} placeholder={t('tracking')} className="w-36 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900" />
      <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
        {pending ? '…' : t('save')}
      </button>
      {state?.ok && <span className="text-xs text-green-600">✓</span>}
    </form>
  );
}
