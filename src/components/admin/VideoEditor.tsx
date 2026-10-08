'use client';

import { useActionState } from 'react';
import { saveVideo } from '@/features/admin/actions';

const input = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

type Vid = {
    id: string; slug: string; title: string; description: string | null; provider: string;
    embedId: string | null; videoUrl: string | null; coverImage: string | null; durationSec: number | null;
    transcript: string | null; seoTitle: string | null; seoDescription: string | null; status: string; publishedAt: Date | null;
};

export function VideoEditor({ item }: { item?: Vid }) {
    const [state, action, pending] = useActionState(saveVideo, null);

    return (
        <form action={action} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
            {item && <input type="hidden" name="id" value={item.id} />}
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">Slug</span>
                    <input name="slug" defaultValue={item?.slug} className={input} required /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">标题</span>
                    <input name="title" defaultValue={item?.title} className={input} required /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">来源</span>
                    <select name="provider" defaultValue={item?.provider ?? 'youtube'} className={input}>
                        <option value="youtube">YouTube</option>
                        <option value="vimeo">Vimeo</option>
                        <option value="self">自托管 / R2</option>
                    </select></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">视频 ID（YouTube/Vimeo）</span>
                    <input name="embedId" defaultValue={item?.embedId ?? ''} className={input} /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">自托管 URL（provider=self 时）</span>
                    <input name="videoUrl" defaultValue={item?.videoUrl ?? ''} className={input} /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">封面图 URL</span>
                    <input name="coverImage" defaultValue={item?.coverImage ?? ''} className={input} /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">时长（秒）</span>
                    <input name="durationSec" type="number" defaultValue={item?.durationSec ?? ''} className={input} /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">状态</span>
                    <select name="status" defaultValue={item?.status ?? 'DRAFT'} className={input}>
                        <option value="DRAFT">草稿</option>
                        <option value="PUBLISHED">已发布</option>
                    </select></label>
            </div>
            <label className="grid gap-1 text-sm"><span className="text-neutral-600">描述</span>
                <textarea name="description" rows={2} defaultValue={item?.description ?? ''} className={input} /></label>
            <label className="grid gap-1 text-sm"><span className="text-neutral-600">字幕稿 / Transcript（利于 SEO）</span>
                <textarea name="transcript" rows={3} defaultValue={item?.transcript ?? ''} className={input} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">SEO 标题（可选）</span>
                    <input name="seoTitle" defaultValue={item?.seoTitle ?? ''} className={input} /></label>
                <label className="grid gap-1 text-sm"><span className="text-neutral-600">SEO 描述（可选）</span>
                    <input name="seoDescription" defaultValue={item?.seoDescription ?? ''} className={input} /></label>
            </div>
            <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publishNow" defaultChecked={!item?.publishedAt} /> 设为当前发布时间</label>
                <button className="ml-auto rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60" disabled={pending}>
                    {pending ? '保存中…' : item ? '更新视频' : '新建视频'}
                </button>
            </div>
            {state?.ok && <span className="text-xs text-green-600">已保存 ✓</span>}
            {state && !state.ok && <span className="text-xs text-[#ff4d4f]">保存失败：{state.error}</span>}
        </form>
    );
}
