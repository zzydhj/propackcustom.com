import { NextRequest, NextResponse } from 'next/server';
import { getObjectBytes, isServableKey, serveCacheControl } from '@/lib/r2';

// 同源图片代理：把 R2 对象从本站地址发出去。
//
// 为什么必须有这一层（实测）：R2 公共域名 file.propackcustom.com 不带 CORS 头
// （GET 无 access-control-allow-origin、预检 OPTIONS 直接 403）。把直链丢进 Fabric：
// 带 crossOrigin 会加载失败，不带则 canvas 被污染 → toDataURL() / 导出 PNG 直接 SecurityError。
// 走同源代理就不需要 CORS：浏览器按同源处理，画布干净，PNG/SVG/PDF 导出全部正常。
//
// 顺带三个好处：桶可以是私有的（不必公开域名）、服务端凭证统一在 env、以后加尺寸裁剪也在这里。
//
// 安全边界（三道）：① 目录前缀白名单（付款凭证 uploads/proofs、源文件 templates/source、
// 生产包 production 一律不代理）；② 只回 image/*；③ 拒掉含 .. 的键 + 12MB 上限。
// 未命中一律 404，不区分「不存在」与「无权读」，避免变成对象枚举器。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
    const { key: segments } = await ctx.params;
    // Next 已按段解码，这里再拼回对象键（键里的中文原名会走到这条路径）
    const key = (segments ?? []).join('/');
    if (!isServableKey(key)) return notFound();

    const obj = await getObjectBytes(key);
    if (!obj) return notFound();
    if (!obj.contentType.startsWith('image/')) return notFound();

    return new NextResponse(Buffer.from(obj.bytes), {
        status: 200,
        headers: {
            'Content-Type': obj.contentType,
            'Content-Length': String(obj.size),
            'Cache-Control': serveCacheControl(key),
            'X-Content-Type-Options': 'nosniff',
            // 画布要把它画进 canvas：同源即可，但显式声明同源策略，防被别站直接引用当图床
            'Cross-Origin-Resource-Policy': 'same-origin',
        },
    });
}

function notFound(): NextResponse {
    return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
}
