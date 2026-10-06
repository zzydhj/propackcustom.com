import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { signInWithGoogle, signInWithApple } from '@/features/auth/actions';
import { EmailLoginForm } from '@/components/auth/EmailLoginForm';
import { DevLoginForm } from '@/components/auth/DevLoginForm';

export default function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  return <Login params={params} />;
}

async function Login({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LoginView />;
}

function LoginView() {
  const t = useTranslations('Auth');
  const brand = useTranslations('Brand');
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <div className="mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-[#ffec5a] font-black text-neutral-900">P</span>
          <span className="text-lg font-extrabold text-neutral-900">{brand('name')}</span>
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-neutral-900">{t('title')}</h1>
        <p className="mt-1 text-neutral-500">{t('subtitle')}</p>
      </div>

      <div className="space-y-3">
        <form action={signInWithGoogle}>
          <button className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white py-3 font-medium text-neutral-800 transition hover:bg-neutral-50">
            <GoogleIcon /> {t('continueWithGoogle')}
          </button>
        </form>
        <form action={signInWithApple}>
          <button className="flex w-full items-center justify-center gap-3 rounded-lg bg-neutral-900 py-3 font-medium text-white transition hover:bg-neutral-700">
            <AppleIcon /> {t('continueWithApple')}
          </button>
        </form>
      </div>

      <div className="my-6 flex items-center gap-4 text-xs uppercase text-neutral-400">
        <span className="h-px flex-1 bg-neutral-200" /> {t('divider')} <span className="h-px flex-1 bg-neutral-200" />
      </div>

      <EmailLoginForm />

      {process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_LOGIN === 'true' ? (
        <div className="mt-6">
          <DevLoginForm
            presets={[
              { email: 'admin@propackcustom.com', label: '超管', redirectTo: '/admin' },
              { email: 'customer@propackcustom.com', label: '客户', redirectTo: '/account' },
            ]}
          />
        </div>
      ) : null}

      <p className="mt-8 text-center text-sm text-neutral-500">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">
          {t('register')}
        </Link>
      </p>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.4 12.9c0-2.5 2-3.7 2.1-3.8-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.8 0-1.9-.9-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.4 1.2 0 1.6-.8 3-.8s1.8.8 3 .7c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.4-1-2.4-3.6zM14.2 5.6c.6-.8 1.1-1.9 1-3-.9.1-2.1.7-2.8 1.5-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.4z" />
    </svg>
  );
}
