import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { presignGet, publicUrl } from '@/lib/r2';

// 后台按需读取客户文件（付款凭证 / 设计素材）：点击时才预签名并 302 跳转，
// 避免把短期直链写进 HTML 源码，也避免页面停留过久链接过期。
// 未配 R2 或文件缺失时返回友好提示而非死链。
export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
    if (session.user.role !== 'ADMIN') return new NextResponse('Forbidden', { status: 403 });

    const order = req.nextUrl.searchParams.get('order');
    const kind = req.nextUrl.searchParams.get('kind');
    if (!order || (kind !== 'proof' && kind !== 'artwork')) {
        return new NextResponse('Bad request', { status: 400 });
    }

    const o = await prisma.order.findUnique({
        where: { id: order },
        select: { proofKey: true, proofUrl: true, artworkId: true },
    });
    if (!o) return new NextResponse('Order not found', { status: 404 });

    let key: string | null = null;
    let direct: string | null = null;
    if (kind === 'proof') {
        key = o.proofKey;
        direct = o.proofUrl;
    } else if (o.artworkId) {
        const art = await prisma.artwork.findUnique({ where: { id: o.artworkId }, select: { r2Key: true } });
        key = art?.r2Key ?? null;
    }

    const url = direct || (key ? publicUrl(key) : null) || (key ? await presignGet(key) : null);
    if (!url) {
        return new NextResponse('File not available (R2 not configured or file missing)', { status: 404 });
    }
    return NextResponse.redirect(url);
}
