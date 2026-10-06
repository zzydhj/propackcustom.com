'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { createCategory, deleteCategory } from '@/features/admin/actions';

type Row = { id: string; slug: string; name: string; productCount: number };

export function CategoryAdmin({ categories }: { categories: Row[] }) {
    const t = useTranslations('Admin');
    const [state, formAction, pending] = useActionState<{ ok: boolean; error?: string } | null, FormData>(createCategory, null);

    return (
        <div className="space-y-8">
            <form action={formAction} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <p className="mb-3 font-semibold text-neutral-900">{t('addCategory')}</p>
                <div className="flex flex-wrap items-end gap-3">
                    <input name="name" required placeholder={t('colName')} className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
                    <input name="slug" required placeholder={t('colSlug')} className="w-48 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
                    <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
                        {t('add')}
                    </button>
                </div>
                {state?.error && <p className="mt-2 text-xs text-[#ff4d4f]">{state.error === 'exists' ? t('colSlug') : t('errInvalid')}</p>}
            </form>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-left text-neutral-500">
                        <tr>
                            <th className="px-4 py-3 font-medium">{t('colName')}</th>
                            <th className="px-4 py-3 font-medium">{t('colSlug')}</th>
                            <th className="px-4 py-3 font-medium">{t('products')}</th>
                            <th className="px-4 py-3 font-medium"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {categories.map((c) => (
                            <tr key={c.id}>
                                <td className="px-4 py-3 font-medium text-neutral-900">{c.name}</td>
                                <td className="px-4 py-3 font-mono text-neutral-500">{c.slug}</td>
                                <td className="px-4 py-3 text-neutral-600">{c.productCount}</td>
                                <td className="px-4 py-3 text-right">
                                    <form action={deleteCategory}>
                                        <input type="hidden" name="id" value={c.id} />
                                        <button type="submit" disabled={c.productCount > 0} className="text-xs font-semibold text-[#ff4d4f] hover:underline disabled:opacity-40 disabled:no-underline">
                                            {t('deleteCategory')}
                                        </button>
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
