'use client';

import { useRef, useState } from 'react';

// ── R2 预签名直传组件（素材 / 付款凭证共用）──────────────
// 文件不经过本站服务器：先向 /api/upload 换预签名 URL，再由浏览器直接 PUT 到 R2。
// R2 未配置时接口返回 r2-disabled，组件降级为「仅记录文件名 + 提示改用邮件发送」。

export type UploadedFile = {
    fileName: string;
    size: number;
    url: string | null;
    key: string | null;
    artworkId: string | null;
};

type PresignResponse =
    | { ok: true; uploadUrl: string; key: string; publicUrl: string | null; artworkId: string | null }
    | { ok: false; error: string };

export function R2FileUpload({
    kind,
    label,
    hint,
    accept,
    onUploaded,
    onUnavailable,
    compact,
}: {
    kind: 'artwork' | 'proof';
    label: string;
    hint?: string;
    accept?: string;
    onUploaded: (f: UploadedFile) => void;
    onUnavailable?: (reason: string) => void;
    compact?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState('');
    const [progress, setProgress] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function pick(file: File) {
        setBusy(true);
        setError('');
        setProgress(0);
        setFileName(file.name);
        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, fileName: file.name, contentType: file.type || 'application/octet-stream', size: file.size }),
            });
            const data = (await res.json()) as PresignResponse;
            if (!data.ok) {
                // r2-disabled / rate-limited / unsupported-file-type / file-too-large
                setFileName('');
                onUnavailable?.(data.error);
                setError(data.error === 'r2-disabled' ? '' : `Upload rejected (${data.error}).`);
                return;
            }

            // 直传 R2：用 XHR 才能拿到上传进度
            await putWithProgress(data.uploadUrl, file, setProgress);

            setFileName(file.name);
            onUploaded({ fileName: file.name, size: file.size, url: data.publicUrl, key: data.key, artworkId: data.artworkId });
        } catch (e) {
            setFileName('');
            setError(e instanceof Error ? e.message : 'Upload failed.');
            onUnavailable?.('network');
        } finally {
            setBusy(false);
        }
    }

    const boxCls = compact
        ? 'flex items-center gap-3 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5'
        : 'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-8 text-center transition hover:border-neutral-900';

    return (
        <div>
            <label className={boxCls}>
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    disabled={busy}
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void pick(f);
                        e.target.value = ''; // 允许重复选同一文件
                    }}
                />
                {!compact && (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-neutral-400" aria-hidden>
                        <path d="M12 16V4m0 0 4 4m-4-4L8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                )}
                <span className={`font-medium text-neutral-700 ${compact ? 'text-sm' : 'text-sm'}`}>
                    {busy ? `Uploading… ${progress}%` : fileName || label}
                </span>
                {hint && !compact && <span className="text-xs text-neutral-400">{hint}</span>}
            </label>
            {busy && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded bg-neutral-100">
                    <div className="h-full bg-[#ffec5a] transition-all" style={{ width: `${progress}%` }} />
                </div>
            )}
            {error && <p className="mt-1.5 text-xs text-[#ff4d4f]">{error}</p>}
        </div>
    );
}

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage rejected the file (${xhr.status}).`)));
        xhr.onerror = () => reject(new Error('Network error while uploading.'));
        xhr.send(file);
    });
}
