import { Link } from '@/navigation';
import type { TemplateListItem } from '@/lib/template-query';
import { sceneToSvg } from '@/lib/scene-svg';

// 模板库卡片：/design 与 /design/[productType] 共用。
// 预览图三级回退：previewImage（导入/渲染管线产的真缩略图）→ 场景编译出的 SVG 预览
// → 只剩刀版框（空模板）。第二级不依赖 R2、不跑浏览器，所以现在库里已经有设计预览可看。
export function TemplateCard({ tpl }: { tpl: TemplateListItem }) {
    const preview = sceneToSvg(tpl.sceneTemplate, { widthMm: tpl.widthMm, heightMm: tpl.heightMm });
    return (
        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-900">
            {tpl.previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={tpl.previewImage}
                    alt={tpl.name}
                    loading="lazy"
                    className="mb-3 aspect-square w-full rounded-lg bg-neutral-50 object-cover ring-1 ring-neutral-100"
                />
            ) : (
                <div
                    className="mb-3 grid w-full place-items-center overflow-hidden rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-100 [&>svg]:h-auto [&>svg]:w-full"
                    style={{ aspectRatio: `${tpl.widthMm ?? 1} / ${tpl.heightMm ?? 1}` }}
                    dangerouslySetInnerHTML={{
                        __html: preview ?? tpl.dielineSvg ?? '<svg viewBox="0 0 1 1"></svg>',
                    }}
                />
            )}
            <p className="font-semibold text-neutral-900">{tpl.name}</p>
            <p className="mt-0.5 text-xs text-neutral-500">
                {tpl.widthMm ?? '—'} × {tpl.heightMm ?? '—'} mm · bleed {tpl.bleedMm}mm
            </p>
            {/* 两条路径：引导式只填字段，全屏编辑器自由摆 */}
            <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href={`/customize/${tpl.slug}`} className="rounded-lg bg-neutral-900 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-neutral-700">
                    Quick customize
                </Link>
                <Link href={`/design/${tpl.productType}?template=${tpl.slug}`} className="rounded-lg border border-neutral-300 px-3 py-2 text-center text-xs font-medium text-neutral-700 transition hover:border-neutral-900">
                    Open editor
                </Link>
            </div>
        </div>
    );
}
