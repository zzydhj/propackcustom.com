'use client';

import { useEffect, useRef, useState } from 'react';

const input = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';

// 刀版 SVG 字段：拖拽/选择 .svg 文件读成文本 → 即时预览 → 校验 viewBox 与体积。
// 只负责这一个字段，模板表单的其它字段仍归 TemplateEditor。
// 刀版是「文本进 DB、渲染时内联」，因此不依赖 R2。
const MAX_KB = 200; // 刀版矢量本该很小；超限通常是内嵌了位图

type Parsed = { ok: boolean; message: string };

function inspect(text: string): Parsed {
    const t = text.trim();
    if (!t) return { ok: true, message: '' };
    if (!t.includes('<svg')) return { ok: false, message: '文件里没有 <svg> 根节点，请确认导出的是刀版矢量' };
    const vb = /viewBox="([^"]+)"/.exec(t);
    if (!vb) return { ok: false, message: '缺 viewBox：编辑器按 mm 铺满画布会失真，请从 AI 导出带 viewBox 的 SVG' };
    const parts = vb[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return { ok: false, message: `viewBox 格式不可解析：${vb[1]}` };
    const [, , w, h] = parts;
    if (w <= 0 || h <= 0) return { ok: false, message: `viewBox 宽高必须为正（当前 ${w}×${h}）` };
    return { ok: true, message: `viewBox ${w}×${h} · 渲染时等比铺满模板画布` };
}

export function DielineField({ name, defaultSvg }: { name: string; defaultSvg?: string | null }) {
    const [text, setText] = useState(defaultSvg ?? '');
    const [note, setNote] = useState<Parsed>(() => inspect(defaultSvg ?? ''));
    const [dragging, setDragging] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const taRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // server action 提交成功后浏览器会原生 reset 表单（非受控 textarea 被清空），
    // 但本组件的 text/note 不会跟着走 → 不监听 reset 就会残留上一次的预览与文件名
    useEffect(() => {
        const form = wrapRef.current?.closest('form');
        if (!form) return;
        const onReset = () => {
            if (taRef.current) taRef.current.value = '';
            setText('');
            setNote({ ok: true, message: '' });
        };
        form.addEventListener('reset', onReset);
        return () => form.removeEventListener('reset', onReset);
    }, []);

    // textarea 保持非受控（随 form 原生提交），所以外部写入要同时改 DOM 值与预览状态
    const applyText = (next: string, msg?: Parsed) => {
        if (taRef.current) taRef.current.value = next;
        setText(next);
        setNote(msg ?? inspect(next));
    };

    async function ingest(file: File) {
        if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
            setNote({ ok: false, message: `「${file.name}」不是 .svg，刀版只接受矢量文本文件` });
            return;
        }
        if (file.size > MAX_KB * 1024) {
            setNote({ ok: false, message: `SVG 体积 ${(file.size / 1024).toFixed(0)}KB 超过 ${MAX_KB}KB，多半内嵌了位图，请先在 AI 里清理` });
            return;
        }
        const content = await file.text();
        const parsed = inspect(content);
        // 校验不过就不写进 textarea：否则前台会直接 dangerouslySetInnerHTML 渲染这些垃圾
        if (!parsed.ok) {
            setNote({ ok: false, message: `${file.name}：${parsed.message}` });
            return;
        }
        applyText(content, { ok: true, message: `${file.name} 已读入 · ${(content.length / 1024).toFixed(1)}KB · ${parsed.message}` });
    }

    const preview = note.ok && text.trim().includes('<svg');

    return (
        <div ref={wrapRef} className="grid gap-2 text-sm">
            <span className="text-neutral-600">刀版 SVG（dieline，可选）</span>

            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void ingest(f);
                }}
                className={`flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs transition ${dragging ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-300 bg-white'}`}
            >
                <span className="text-neutral-500">把 .svg 刀版拖进来</span>
                <button type="button" onClick={() => fileRef.current?.click()}
                    className="rounded border border-neutral-300 px-2 py-1 font-medium text-neutral-700 transition hover:border-neutral-900">
                    选择文件
                </button>
                {text.trim() && (
                    <button type="button" onClick={() => applyText('')}
                        className="rounded border border-neutral-300 px-2 py-1 font-medium text-neutral-500 transition hover:border-[#ff4d4f] hover:text-[#ff4d4f]">
                        清空
                    </button>
                )}
                <input
                    ref={fileRef} type="file" accept=".svg,image/svg+xml" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void ingest(f); e.target.value = ''; }}
                />
            </div>

            {note.message && (
                <p className={`text-xs ${note.ok ? 'text-neutral-500' : 'text-[#ff4d4f]'}`}>{note.message}</p>
            )}

            {preview && (
                <div className="grid place-items-center rounded-md bg-neutral-50 p-3 ring-1 ring-neutral-100 [&>svg]:max-h-40 [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: text }} />
            )}

            <textarea
                ref={taRef} name={name} rows={2} defaultValue={defaultSvg ?? ''}
                onChange={(e) => { setText(e.target.value); setNote(inspect(e.target.value)); }}
                placeholder="<svg viewBox=…> 或直接粘文本"
                className={`${input} font-mono text-xs`}
            />
        </div>
    );
}
