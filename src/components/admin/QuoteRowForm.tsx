'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { convertQuoteToOrder, updateQuote } from '@/features/admin/actions';

// 询价（RFQ）行内操作：改状态/报价，以及关键的「转为订单」。
// 转订单前必须先填报价 —— 没有价格无法生成订单总价。
type ConvState = { ok: boolean; error?: string; orderNo?: string } | null;

const CONV_ERR: Record<string, string> = {
  invalid: '参数有误。',
  'not-found': '询价不存在。',
  'already-converted': '该询价已转过订单。',
  'no-price': '请先填写报价并保存，再转为订单。',
};

export function QuoteRowForm({
  id,
  status,
  quotedPrice,
  currency,
  orderId,
}: {
  id: string;
  status: string;
  quotedPrice: string;
  currency: string;
  orderId: string | null;
}) {
  const t = useTranslations('Admin');
  const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(updateQuote, null);
  const [conv, convAction, converting] = useActionState<ConvState, FormData>(convertQuoteToOrder, null);
  const statuses = ['PENDING', 'QUOTED', 'ACCEPTED', 'EXPIRED'];
  const canConvert = !orderId && Number(quotedPrice) > 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
        <input type="hidden" name="id" value={id} />
        <select name="status" defaultValue={status} className="rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900">
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input name="quotedPrice" type="number" step="0.01" min="0" defaultValue={quotedPrice} placeholder={t('price')} className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900" />
        <input name="currency" defaultValue={currency} className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm uppercase outline-none focus:border-neutral-900" />
        <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
          {pending ? '…' : t('save')}
        </button>
        {state?.ok && <span className="text-xs text-green-600">✓</span>}
      </form>

      {/* 转为订单：生成 SUBMITTED 订单，回到人工对接主流程 */}
      {orderId ? (
        <span className="text-xs font-semibold text-neutral-500">已转为订单</span>
      ) : (
        <form action={convAction} className="flex flex-wrap items-center justify-end gap-2">
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={converting || !canConvert}
            title={canConvert ? '生成订单并进入确认流程' : '请先填写报价并保存'}
            className="rounded-md bg-[#ffec5a] px-3 py-1.5 text-sm font-bold text-neutral-900 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {converting ? '转换中…' : '转为订单'}
          </button>
        </form>
      )}

      {conv?.ok && <span className="text-xs text-green-600">已生成订单 #{conv.orderNo}</span>}
      {conv && !conv.ok && <span className="text-xs text-[#ff4d4f]">{CONV_ERR[conv.error ?? ''] ?? '转换失败'}</span>}
    </div>
  );
}
