'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { attachPaymentProof } from '@/features/order/actions';
import { R2FileUpload } from '@/components/ui/R2FileUpload';

// T/T 银行转账的付款凭证上传：客户传水单/截图，销售在后台核对后手动标记已付款
export function ProofUpload({
    viewToken,
    salesEmail,
    existing,
}: {
    viewToken: string;
    salesEmail: string;
    existing?: { fileName: string; url: string | null } | null;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [saved, setSaved] = useState(existing?.fileName ?? '');
    const [fallback, setFallback] = useState(false);
    const [error, setError] = useState('');

    if (fallback) {
        return (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                <p>File upload isn&rsquo;t available right now. Please email your payment receipt to{' '}
                    <a className="font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2" href={`mailto:${salesEmail}?subject=Payment%20receipt%20for%20order`}>
                        {salesEmail}
                    </a>{' '}
                    and include your order number.</p>
            </div>
        );
    }

    return (
        <div>
            <R2FileUpload
                kind="proof"
                compact
                accept=".pdf,.png,.jpg,.jpeg"
                label={saved ? `Receipt: ${saved} (click to replace)` : 'Upload payment receipt (PDF / PNG / JPG)'}
                onUnavailable={() => setFallback(true)}
                onUploaded={(f) => {
                    setError('');
                    startTransition(async () => {
                        const fd = new FormData();
                        fd.set('viewToken', viewToken);
                        fd.set('proofFileName', f.fileName);
                        fd.set('proofUrl', f.url ?? '');
                        const res = await attachPaymentProof(fd);
                        if (res.ok) {
                            setSaved(f.fileName);
                            router.refresh();
                        } else {
                            setError(res.error === 'invalid-status' ? 'This order is not awaiting payment.' : 'Could not save the receipt.');
                        }
                    });
                }}
            />
            {pending && <p className="mt-2 text-xs text-neutral-400">Saving…</p>}
            {saved && !pending && !error && (
                <p className="mt-2 text-xs text-green-700">
                    Receipt received — our team will verify it and mark your order paid, usually within one business day.
                </p>
            )}
            {error && <p className="mt-2 text-xs text-[#ff4d4f]">{error}</p>}
        </div>
    );
}
