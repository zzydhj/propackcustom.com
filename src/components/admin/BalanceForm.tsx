'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { adjustBalance } from '@/features/admin/actions';

// 交易类型标签（复用 Account 命名空间下的 typeXXX 文案）
export function TxnTypeLabel({ type }: { type: string }) {
    const t = useTranslations('Account');
    return <>{t(`type${type}` as never)}</>;
}

// 管理员针对某个用户调整预充值余额（充值/扣款/退款/调整）
export function BalanceForm({ userId, currency }: { userId: string; currency: string }) {
    const t = useTranslations('Admin');
    const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(adjustBalance, null);
    const types = ['TOPUP', 'CHARGE', 'REFUND', 'ADJUSTMENT'];

    return (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="userId" value={userId} />
            <select name="type" defaultValue="TOPUP" className="rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900">
                {types.map((ty) => (
                    <option key={ty} value={ty}>{t(`type${ty}` as never)}</option>
                ))}
            </select>
            <input name="amount" type="number" step="0.01" required placeholder={t('amount')} className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900" />
            <input name="currency" defaultValue={currency} className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm uppercase outline-none focus:border-neutral-900" />
            <input name="note" placeholder={t('note')} className="w-32 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900" />
            <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
                {pending ? '…' : t('apply')}
            </button>
            {state?.ok && <span className="text-xs text-green-600">✓ {t('saved')}</span>}
            {state?.error && <span className="text-xs text-[#ff4d4f]">{t('errInvalid')}</span>}
        </form>
    );
}
