'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/navigation';
import { useFabricCanvas, PX_PER_MM } from './useFabricCanvas';
import GuideOverlay from './GuideOverlay';
import { FreeDesignCallout } from './FreeDesignCallout';
import { useDesignSave } from './useDesignSave';
import { saveDesignBridge } from '@/lib/design-bridge';

// 引导式工作台：背景/版式由印刷工程预先排好并锁定，客户只填字段。
// 与全屏编辑器共用同一个引擎 hook 与保存流程，差别只在 lockEditing 与没有自由画布工具。
type Props = {
    productType: string;
    templateId: string;
    templateSlug: string;
    templateName: string;
    widthMm: number;
    heightMm: number;
    bleedMm: number;
    safeAreaMm: number;
    dielineSvg?: string;
    /** 满版模板：引导页虽然锁死版式，但客户换图/改长文字同样可能露白底，预检规则不能缺这一环 */
    fullBleed?: boolean;
    initialScene?: string;
};

const field = 'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
const ctaMain = 'w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50';
const ctaGhost = 'w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50';

export default function GuidedWorkspace({
    productType, templateId, templateSlug, templateName, widthMm, heightMm, bleedMm, safeAreaMm, dielineSvg, fullBleed, initialScene,
}: Props) {
    const t = useTranslations('Customize');
    const router = useRouter();
    const {
        canvasElRef, ready, zoom, applyZoom, importJSON,
        fields, setFieldText, setFieldImage, removeObject, addImage,
        exportJSON,
    } = useFabricCanvas({ widthMm, heightMm, bleedMm, safeAreaMm, dielineSvg, fullBleed, lockEditing: true });
    const { savedId, saving, msg, save } = useDesignSave({
        productType, templateId, name: `${templateName} custom`, ready, exportJSON,
    });

    const fileRef = useRef<HTMLInputElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ready && initialScene) importJSON(initialScene);
    }, [ready, initialScene, importJSON]);

    // 模板载入后按容器自适应缩小一次，小屏也能看到整张版面
    useEffect(() => {
        if (!ready) return;
        const el = previewRef.current;
        if (!el) return;
        const pad = 48;
        applyZoom(Math.min(1,
            (el.clientWidth - pad) / (widthMm * PX_PER_MM),
            (el.clientHeight - pad) / (heightMm * PX_PER_MM)));
    }, [ready, widthMm, heightMm, applyZoom]);

    const textFields = fields.filter((f) => f.kind === 'text');
    const imageField = fields.find((f) => f.kind === 'image');

    async function goTo(kind: 'quote' | 'product') {
        const id = await save();
        if (!id) return;
        // 与全屏编辑器用同一个桥 key；消费端（报价/配置器表单）负责展示与清除
        saveDesignBridge(id);
        router.push(kind === 'quote' ? '/quote' : '/products');
    }

    return (
        <main className="mx-auto grid max-w-[1440px] gap-8 px-5 py-10 2xl:px-12 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <section>
                <Link href={`/design/${productType}?template=${templateSlug}`} className="text-sm text-neutral-500 hover:text-neutral-900">
                    ← {templateName}
                </Link>
                <span className="mt-4 inline-flex items-center rounded-full bg-[#ffec5a] px-3 py-1 text-xs font-bold uppercase tracking-wide text-neutral-900">
                    {t('eyebrow')}
                </span>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-neutral-900">{t('title')}</h1>
                <p className="mt-3 leading-relaxed text-neutral-600">{t('subtitle')}</p>

                <div className="mt-8 space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                        {t('fieldsHeading')} · {widthMm}×{heightMm}mm
                    </p>

                    {textFields.length === 0 && (
                        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">{t('noFields')}</p>
                    )}
                    {textFields.map((f, i) => (
                        <label key={f.index} className="grid gap-1 text-sm">
                            <span className="text-neutral-600">{t('fieldLabel', { n: i + 1 })}</span>
                            <input
                                // 输入框直接受控于引擎的 fields 快照：唯一事实源，撤销/还原后自然同步
                                value={f.value}
                                maxLength={60}
                                onChange={(e) => setFieldText(f.index, e.target.value)}
                                className={field}
                            />
                        </label>
                    ))}

                    <div className="grid gap-2 border-t border-neutral-100 pt-4">
                        <span className="text-sm text-neutral-600">{t('logoLabel')}</span>
                        <div className="flex gap-2">
                            <button type="button" className={ctaGhost} onClick={() => fileRef.current?.click()}>
                                {imageField ? t('logoReplace') : t('logoAdd')}
                            </button>
                            {imageField && (
                                <button
                                    type="button"
                                    className="rounded-lg border border-neutral-300 bg-white px-3 py-3 text-sm font-medium text-neutral-500 transition hover:border-[#ff4d4f] hover:text-[#ff4d4f]"
                                    onClick={() => removeObject(imageField.index)}
                                >
                                    {t('logoRemove')}
                                </button>
                            )}
                        </div>
                        <input
                            ref={fileRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) {
                                    // 有图片槽位就原位替换并保持矩形，没有就按引擎规则加一张
                                    if (imageField) void setFieldImage(imageField.index, f);
                                    else void addImage(f);
                                }
                                e.target.value = '';
                            }}
                        />
                        <p className="text-xs text-neutral-400">{t('logoHint')}</p>
                    </div>

                    {msg && <p className="text-xs text-neutral-500">{msg}</p>}

                    <div className="grid gap-2 border-t border-neutral-100 pt-4">
                        <button type="button" className={ctaMain} disabled={saving || !ready} onClick={() => void goTo('quote')}>
                            {saving ? t('saving') : t('quote')}
                        </button>
                        <button type="button" className={ctaGhost} disabled={saving || !ready} onClick={() => void goTo('product')}>
                            {t('product')}
                        </button>
                        <p className="text-[11px] text-neutral-400">
                            {savedId ? `${t('savedHint')} #${savedId.slice(0, 8)}` : t('lockedHint')}
                        </p>
                    </div>
                </div>

                <Link href={`/design/${productType}?template=${templateSlug}`} className="mt-4 inline-block text-sm font-semibold text-neutral-900 underline decoration-[#ffec5a] decoration-2 underline-offset-4">
                    {t('fullEditor')}
                </Link>

                {/* 引导页是最容易“我会不会做坏”的地方：把免费设计服务放在左栏底部 */}
                <FreeDesignCallout variant="rail" className="mt-6" />
            </section>

            {/* 预览：同一个 Fabric 画布，但对象已锁定，客户看不到任何画布工具 */}
            <section ref={previewRef} className="grid min-h-[380px] place-items-center overflow-auto rounded-2xl bg-neutral-100 p-6">
                <div className="relative w-fit rounded bg-white shadow-md">
                    <canvas ref={canvasElRef} />
                    <GuideOverlay dielineSvg={dielineSvg} bleedMm={bleedMm} safeAreaMm={safeAreaMm} zoom={zoom} showGuides />
                    {!ready && (
                        <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">Loading preview…</div>
                    )}
                </div>
            </section>
        </main>
    );
}
