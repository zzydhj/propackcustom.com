import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { signInWithGoogle, signInWithApple } from '@/features/auth/actions';
import { EmailLoginForm } from '@/components/auth/EmailLoginForm';

export default function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  return <Register params={params} />;
}

async function Register({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = useTranslations('Auth');
  const brand = useTranslations('Brand');
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <div className="mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-[#ffec5a] font-black text-neutral-900">P</span>
          <span className="text-lg font-extrabold text-neutral-900">{brand('name')}</span>
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-neutral-900">{t('register')}</h1>
        <p className="mt-1 text-neutral-500">{t('subtitle')}</p>
      </div>

      <div className="space-y-3">
        <form action={signInWithGoogle}>
          <button className="w-full rounded-lg border border-neutral-300 bg-white py-3 font-medium text-neutral-800 transition hover:bg-neutral-50">
            {t('continueWithGoogle')}
          </button>
        </form>
        <form action={signInWithApple}>
          <button className="w-full rounded-lg bg-neutral-900 py-3 font-medium text-white transition hover:bg-neutral-700">
            {t('continueWithApple')}
          </button>
        </form>
      </div>

      <div className="my-6 flex items-center gap-4 text-xs uppercase text-neutral-400">
        <span className="h-px flex-1 bg-neutral-200" /> {t('divider')} <span className="h-px flex-1 bg-neutral-200" />
      </div>

      <EmailLoginForm />

      <p className="mt-8 text-center text-sm text-neutral-500">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">
          {t('signIn')}
        </Link>
      </p>
    </main>
  );
}
