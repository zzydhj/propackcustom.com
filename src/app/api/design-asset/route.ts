import { NextRequest, NextResponse } from 'next/server';
import { allowedFor, clientIp } from '@/lib/rate-limit';
import { assetProxyUrl, objectKey, putObjectBytes, r2Enabled } from '@/lib/r2';

// 设计器的「有界工作图」写桶入口。
//
// 为什么不走 /api/upload 的预签名直传：那条路要浏览器 PUT 到 r2.cloudflarestorage.com，
// 依赖桶上配 CORS（没配就是静默失败）。工作图已经被客户端压到 ≤1.2MB，
// 远小于 Vercel 4.5MB 请求体上限 —— 小文件经本站写桶换来的是「不依赖任何桶配置」，值得。
// 客户原稿/付款凭证（几十上百 MB）仍然走预签名直传，那条路不动。
//
// sceneJson 里存的是这里返回的**同源代理地址**（/api/asset/…），不是 R2 直链：
// R2 公共域名不带 CORS 头，直链丢进 Fabric 会污染画布 → 导出直接 SecurityError。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 客户端上限 1.2MB，这里留 2MB 兜一道（防绕过前端的调用） */
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const LIMIT_PER_HOUR = 120;

/** 只收这两种：导出时会被原样内联进交给印厂的 SVG/PDF，格式必须确定 */
const EXT_BY_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
};

export async function POST(req: NextRequest) {
    if (!r2Enabled()) return NextResponse.json({ ok: false, error: 'r2-disabled' }, { status: 503 });
    if (!(await allowedFor(clientIp(req), LIMIT_PER_HOUR, 'design-asset'))) {
        return NextResponse.json({ ok: false, error: 'rate-limited' }, { status: 429 });
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
        return NextResponse.json({ ok: false, error: 'missing-file' }, { status: 400 });
    }

    const ext = EXT_BY_MIME[file.type];
    if (!ext) {
        // 明确告诉调用方为什么被拒：客户端会因此退回 dataURL，客户仍能继续编辑
        return NextResponse.json({ ok: false, error: 'unsupported-image-type' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BODY_BYTES) {
        return NextResponse.json({ ok: false, error: 'file-too-large' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    // 扩展名按真实 MIME 重写：客户端可能带来 .jpg 但其实有透明通道（我们按 PNG 存）
    const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
    const key = objectKey('design-asset', `${stem}.${ext}`);

    if (!(await putObjectBytes(key, bytes, file.type))) {
        return NextResponse.json({ ok: false, error: 'store-failed' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, key, url: assetProxyUrl(key), bytes: file.size });
}
