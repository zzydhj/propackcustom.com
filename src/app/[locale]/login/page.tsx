import { useTranslations } from 'next-intl';

// 说明：Google / Apple 走服务端 signIn action；邮箱 Magic Link 由 Auth.js Resend provider 处理
import { signIn } from '@/lib/auth';

async function googleSignIn() {
  'use server';
  await signIn('google', { redirectTo: '/account' });
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">
        <LoginTitle />
      </h1>
      <form action={googleSignIn}>
        <button className="w-full rounded-md border border-neutral-300 py-3 font-medium hover:bg-neutral-50">
          <GoogleLabel />
        </button>
      </form>
      {/* Apple / 邮箱 Magic Link 按钮同理，二期加微信/QQ */}
    </main>
  );
}

function LoginTitle() {
  const t = useTranslations('Nav');
  return <>{t('login')}</>;
}
function GoogleLabel() {
  const t = useTranslations('Auth');
  return <>{t('continueWithGoogle')}</>;
}
