'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { submitRfq, type RfqState } from '@/features/quote/actions';
import { useDesignBridge } from '@/lib/design-bridge';
import { AttachedDesignNote } from '@/components/ui/AttachedDesignNote';
import { QUOTE_INTENTS, type QuoteIntent } from '@/lib/quote-intent';

export function QuoteForm({ intent }: { intent?: QuoteIntent }) {
  const t = useTranslations('QuoteForm');
  const [state, formAction, pending] = useActionState<RfqState | null, FormData>(submitRfq, null);
  const designId = useDesignBridge();

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-green-600 text-white">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h3 className="text-lg font-bold text-neutral-900">{t('successTitle')}</h3>
        <p className="mt-1 text-neutral-600">{t('successBody')}</p>
        {state.quoteId && <p className="mt-3 text-xs text-neutral-400">#{state.quoteId}</p>}
      </div>
    );
  }

  const err = (k: string) => state?.errors?.[k as keyof RfqState['errors']];

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {designId && <input type="hidden" name="designId" value={designId} />}
      <AttachedDesignNote designId={designId} />
      <Field label={t('product')} error={err('productName')}>
        <input name="productName" required className={inputCls} placeholder={t('productPlaceholder')} />
      </Field>
      <Field label={t('quantity')} error={err('quantity')}>
        <input name="quantity" type="number" min={1} required className={inputCls} placeholder="1000" />
      </Field>
      <Field label={t('material')} error={err('material')}>
        <input name="material" className={inputCls} placeholder={t('materialPlaceholder')} />
      </Field>
      <Field label={t('size')} error={err('size')}>
        <input name="size" className={inputCls} placeholder={t('sizePlaceholder')} />
      </Field>
      <Field label={t('country')} error={err('country')}>
        <input name="country" required className={inputCls} placeholder={t('countryPlaceholder')} />
      </Field>
      <Field label={t('contact')} error={err('contactName')}>
        <input name="contactName" required className={inputCls} placeholder={t('contactPlaceholder')} />
      </Field>
      <Field label={t('email')} error={err('email')} className="sm:col-span-2">
        <input name="email" type="email" required className={inputCls} placeholder="you@company.com" />
      </Field>
      <Field label={t('notes')} error={err('notes')} className="sm:col-span-2">
        <textarea name="notes" rows={5} className={inputCls} placeholder={t('notesPlaceholder')} defaultValue={intent ? QUOTE_INTENTS[intent].note : undefined} />
      </Field>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-neutral-900 px-6 py-3.5 font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  'w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-[#ffec5a]/50';

function Field({
  label,
  error,
  className = '',
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-[#ff4d4f]">{error}</span>}
    </label>
  );
}
