'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// 保存/更新用户在线设计作品（UserDesign）。用 plain object 入参（server action 可直接被客户端调用）。
const schema = z.object({
    id: z.string().optional(),
    sceneJson: z.string().min(2),
    name: z.string().min(1).max(120),
    templateId: z.string().optional(),
    productType: z.string().optional(),
});

export type SaveDesignResult = { ok: boolean; id?: string; error?: string };

export async function saveDesign(args: {
    id?: string; sceneJson: string; name?: string; templateId?: string; productType?: string;
}): Promise<SaveDesignResult> {
    const session = await auth().catch(() => null);
    const userId = session?.user?.id;
    const email = session?.user?.email ?? undefined;

    const parsed = schema.safeParse({
        id: args.id || undefined,
        sceneJson: args.sceneJson,
        name: (args.name || '').trim() || 'Untitled design',
        templateId: args.templateId || undefined,
        productType: args.productType || undefined,
    });
    if (!parsed.success) return { ok: false, error: 'invalid' };
    const d = parsed.data;

    let scene: unknown;
    try {
        scene = JSON.parse(d.sceneJson);
    } catch {
        return { ok: false, error: 'invalid-scene' };
    }

    if (d.id) {
        const existing = await prisma.userDesign.findUnique({ where: { id: d.id } });
        if (!existing) return { ok: false, error: 'not-found' };
        // 归属校验：本人已登录作品，或未认领的匿名作品（凭 id 不可枚举 + email 匹配）
        const mine =
            (userId && existing.userId === userId) ||
            (!existing.userId && (!email || (existing.email ?? '').toLowerCase() === email.toLowerCase()));
        if (!mine) return { ok: false, error: 'forbidden' };
        await prisma.userDesign.update({ where: { id: d.id }, data: { sceneJson: scene as never, name: d.name } });
        revalidatePath('/design');
        return { ok: true, id: d.id };
    }

    const created = await prisma.userDesign.create({
        data: {
            userId: userId ?? null,
            email: email ?? null,
            templateId: d.templateId ?? null,
            productType: d.productType ?? null,
            name: d.name,
            sceneJson: scene as never,
            status: 'DRAFT',
        },
    });
    revalidatePath('/design');
    return { ok: true, id: created.id };
}
