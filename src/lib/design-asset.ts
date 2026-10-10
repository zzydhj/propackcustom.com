// 设计器图片的客户端 IO（只在浏览器里跑；不 import src/lib/r2，那个带 AWS SDK 是服务端专用）。
//
// 两个动作凑成一个模块，因为它们讲的是同一件事：**图不进 sceneJson，进对象存储**。
//  · storeWorkingImage()：把压好的有界工作图交本站写进 R2，换回同源代理地址（/api/asset/…）
//  · assetAsDataUrl()：导出矢量/PDF 前把代理地址换回 dataURL —— 交给印厂的文件必须自包含

/**
 * 存工作图，返回同源代理地址。
 * 任何失败（R2 未配置 / 存储被拒 / 网络断）都返回 null，**不抛**：
 * 调用方拿到 null 就退回 dataURL 路径，客户不该因为存储没配好而不能编辑。
 */
export async function storeWorkingImage(blob: Blob, nameHint: string): Promise<string | null> {
    try {
        const form = new FormData();
        form.set('file', new File([blob], nameHint, { type: blob.type }));
        const res = await fetch('/api/design-asset', { method: 'POST', body: form });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; url?: string } | null;
        return data?.ok && data.url ? data.url : null;
    } catch {
        return null;
    }
}

/** 把本站代理地址读成 dataURL（同源，不受 R2 缺 CORS 的影响） */
export async function assetAsDataUrl(url: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(r.error);
            r.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

/** 是不是需要内联的地址（data:/blob: 本来就已自包含） */
export function isRemoteAsset(url: string): boolean {
    return Boolean(url) && !url.startsWith('data:') && !url.startsWith('blob:');
}
