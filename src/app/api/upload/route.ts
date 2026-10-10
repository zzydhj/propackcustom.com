import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { allowedFor, clientIp } from '@/lib/rate-limit';
import {
    MAX_UPLOAD_BYTES, isAllowedFileName, objectKey, presignPut, publicUrl, r2Enabled,
} from '@/lib/r2';

// 预签名直传：本站只发凭证，文件由浏览器直传 R2（绕开 Vercel 4.5MB 请求体上限）。
// 该接口对匿名用户开放（免登录下单也要能传素材），因此带 IP 级限流。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMIT_PER_HOUR = 20;

export async function POST(req: NextRequest) {
    if (!r2Enabled()) {
        return NextResponse.json({ ok: false, error: 'r2-disabled' }, { status: 503 });
    }

    if (!(await allowedFor(clientIp(req), LIMIT_PER_HOUR, 'upload'))) {
        return NextResponse.json({ ok: false, error: 'rate-limited' }, { status: 429 });
    }

    let body: { kind?: string; fileName?: string; contentType?: string; size?: number };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 });
    }

    const kind = body.kind === 'proof' ? 'proof' : 'artwork';
    const fileName = String(body.fileName || '').trim();
    const contentType = String(body.contentType || 'application/octet-stream');
    const size = Number(body.size) || 0;

    if (!fileName || !isAllowedFileName(fileName)) {
        return NextResponse.json({ ok: false, error: 'unsupported-file-type' }, { status: 400 });
    }
    if (size <= 0 || size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ ok: false, error: 'file-too-large' }, { status: 400 });
    }

    const key = objectKey(kind, fileName);
    const uploadUrl = await presignPut(key, contentType);

    // 素材登记入库（匿名订单 userId 为空）；凭证不建 Artwork 记录
    let artworkId: string | null = null;
    if (kind === 'artwork') {
        const session = await auth().catch(() => null);
        const data: Prisma.ArtworkUncheckedCreateInput = {
            userId: session?.user?.id ?? null,
            fileName,
            r2Key: key,
            size,
            mime: contentType,
        };
        const created = await prisma.artwork.create({ data });
        artworkId = created.id;
    }

    return NextResponse.json({ ok: true, uploadUrl, key, publicUrl: publicUrl(key), artworkId });
}
