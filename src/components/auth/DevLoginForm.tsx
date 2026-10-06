'use client';

import { useRef } from 'react';
import { useActionState } from 'react';
import { signInWithDev } from '@/features/auth/actions';

// 仅开发环境显示的邮箱+密码快速登录
export function DevLoginForm({ presets }: { presets: { email: string; label: string; redirectTo: string }[] }) {
    const [state, formAction, pending] = useActionState<
        { ok: boolean; error?: 'invalid' | 'notfound' | 'disabled' } | null,
        FormData
    >(signInWithDev, null);
    const emailRef = useRef<HTMLInputElement>(null);
    const redirectRef = useRef<HTMLInputElement>(null);

    const applyPreset = (p: { email: string; redirectTo: string }) => {
        if (emailRef.current) emailRef.current.value = p.email;
        if (redirectRef.current) redirectRef.current.value = p.redirectTo;
    };

    return (
        <div className="rounded-2xl border border-dashed border-amber-400 bg-amber-50 p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-700">邮箱+密码登录</p>
            <p className="mb-3 text-xs text-amber-700/80">本地默认密码 propack123；线上需设置 DEV_PASSWORD。</p>
            <form action={formAction} className="space-y-2">
                <input ref={emailRef} name="email" type="email" placeholder="Email" defaultValue={presets[0]?.email} className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900" />
                <input name="password" type="password" placeholder="Password" className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900" />
                <input ref={redirectRef} type="hidden" name="redirectTo" defaultValue={presets[0]?.redirectTo ?? '/account'} />
                <button type="submit" disabled={pending} className="w-full rounded-md bg-amber-500 py-2 text-sm font-semibold text-neutral-900 hover:bg-amber-400 disabled:opacity-60">
                    {pending ? '登录中…' : '使用邮箱+密码登录'}
                </button>
                <div className="flex flex-wrap gap-2">
                    {presets.map((p) => (
                        <button
                            key={p.email}
                            type="button"
                            onClick={() => applyPreset(p)}
                            className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                {state?.error && (
                    <p className="text-xs text-[#ff4d4f]">
                        {state.error === 'notfound' ? '该邮箱账号不存在' : state.error === 'disabled' ? '登录未启用（需 ENABLE_DEV_LOGIN=true）' : '密码错误'}
                    </p>
                )}
            </form>
        </div>
    );
}
