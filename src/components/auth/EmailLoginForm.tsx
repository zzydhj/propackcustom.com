'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { signInWithEmail, type EmailState } from '@/features/auth/actions';

export function EmailLoginForm() {
  const t = useTranslations('Auth');
  const [state, formAction, pending] = useActionState<EmailState | null, FormData>(signInWithEmail, null);

  if (state?.ok) {
    return (
      <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{t('checkInbox')}</p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder={t('emailPlaceholder')}
          className="flex-1 rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-[#ffec5a]/50"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {t('sendMagicLink')}
        </button>
      </div>
      {state?.error === 'email' && <p className="text-xs text-[#ff4d4f]">{t('invalidEmail')}</p>}
      {state?.error === 'send' && <p className="text-xs text-[#ff4d4f]">{t('sendFailed')}</p>}
    </form>
  );
}
