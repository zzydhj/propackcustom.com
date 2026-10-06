'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { createProduct, deleteProduct } from '@/features/admin/actions';

type Row = { id: string; slug: string; name: string; basePrice: number; currency: string };

export function ProductAdmin({ products }: { products: Row[] }) {
  const t = useTranslations('Admin');
  const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(createProduct, null);

  return (
    <div className="space-y-8">
      <form action={formAction} className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="mb-3 font-semibold text-neutral-900">{t('addProduct')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <input name="name" required placeholder={t('colName')} className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
          <input name="slug" required placeholder="标识(slug)" className="w-40 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
          <input name="basePrice" type="number" step="0.01" min="0" required placeholder="0.00" className="w-28 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
          <input name="currency" defaultValue="USD" className="w-20 rounded-md border border-neutral-300 px-3 py-2 text-sm uppercase outline-none focus:border-neutral-900" />
          <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
            {t('add')}
          </button>
        </div>
        {state?.error && <p className="mt-2 text-xs text-[#ff4d4f]">{state.error === 'no-category' ? t('errNoCategory') : t('errInvalid')}</p>}
      </form>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t('colName')}</th>
              <th className="px-4 py-3 font-medium">标识</th>
              <th className="px-4 py-3 font-medium">{t('colPrice')}</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-neutral-900">{p.name}</td>
                <td className="px-4 py-3 font-mono text-neutral-500">{p.slug}</td>
                <td className="px-4 py-3 text-neutral-600">{p.currency} {p.basePrice.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <form action={deleteProduct}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="text-xs font-semibold text-[#ff4d4f] hover:underline">{t('delete')}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
