import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ── Cloudflare R2（S3 兼容）素材与凭证存储 ─────────────────
// 两条上传路径，各有理由：
//  · 客户原稿/付款凭证（动辄几十上百 MB）→ 预签名 URL 由浏览器**直传 R2**。
//    Vercel Serverless 请求体上限 4.5MB，这类文件绝不能经过本站服务器。
//  · 设计器里的「有界工作图」（客户端已压到 ≤1.2MB）→ **经本站 PUT**。
//    刻意不走预签名：那样要依赖桶的 CORS 规则（浏览器 PUT 到 r2.cloudflarestorage.com），
//    而公共域名的 CORS 实测是缺的；小文件走自己服务器换的是「不依赖任何桶配置」。

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

export function r2Enabled(): boolean {
    return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);
}

let client: S3Client | null = null;
function s3(): S3Client {
    if (!client) {
        client = new S3Client({
            region: 'auto',
            endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! },
        });
    }
    return client;
}

const safeName = (n: string) =>
    (n || 'file')
        // 去掉路径分隔符与会破坏 URL/签名的字符；**保留中文**：桶是给人逛的，
        // 中文名比一串下划线有用（AWS SDK 会对 key 做 percent-encoding）
        .replace(/[\\/:*?"<>|#%&{}$!'`~+=^\[\]]+/g, ' ')
        .trim()
        .replace(/\s+/g, '-')
        .slice(-70) || 'file';

/**
 * 桶内目录规范（人在 Cloudflare 控制台也能一眼看懂，不会滚成一堆乱文件）：
 *
 *   uploads/artwork/<yyyy>/<mm>/<dd>-<rand>-<原名>    客户上传的设计原稿
 *   uploads/proofs /<yyyy>/<mm>/…                   客户上传的付款凭证
 *   assets/design /<yyyy>/<mm>/…                    设计器里的有界工作图（压缩后的客户图）
 *   exports/designs/<designId>/<name>              系统导出的成品（按作品归组）
 *   templates/source/<yyyy>/<mm>/<sha12>-<原名>    模板导入的源文件归档（PSD/AI）
 *   templates/preview/<slug>.<ext>                 模板预览图（稳定键，可覆盖）
 *   production/orders/<orderNo>/<name>             交给印厂的生产文件包（按订单归组）
 *   tmp/<yyyy>/<mm>/…                              临时件，建议配 7 天生命周期规则自动清
 *
 * 两条原则：上传类按「年/月」分片（单目录不致上万文件）；产物类按「实体 id」归组（找哪个作品/订单一目了然）。
 */
export type R2Kind =
    | 'artwork'
    | 'proof'
    | 'design-asset'
    | 'design-export'
    | 'template-source'
    | 'template-preview'
    | 'production'
    | 'tmp';

type Shard = 'date' | 'entity' | 'none';
const LAYOUT: Record<R2Kind, { dir: string; shard: Shard }> = {
    artwork: { dir: 'uploads/artwork', shard: 'date' },
    proof: { dir: 'uploads/proofs', shard: 'date' },
    'design-asset': { dir: 'assets/design', shard: 'date' },
    'design-export': { dir: 'exports/designs', shard: 'entity' },
    'template-source': { dir: 'templates/source', shard: 'date' },
    'template-preview': { dir: 'templates/preview', shard: 'none' },
    production: { dir: 'production/orders', shard: 'entity' },
    tmp: { dir: 'tmp', shard: 'date' },
};

// 对象键：按用途分目录，便于生命周期规则与后台检索
export function objectKey(
    kind: R2Kind,
    fileName: string,
    opts: { entityId?: string; hash?: string } = {},
): string {
    const { dir, shard } = LAYOUT[kind];
    const day = new Date().toISOString().slice(0, 10);
    const name = safeName(fileName);

    if (shard === 'entity') {
        const entity = safeName(opts.entityId ?? 'unknown');
        return `${dir}/${entity}/${name}`;
    }
    if (shard === 'none') return `${dir}/${name}`;

    const [y, m] = day.split('-');
    const prefix = opts.hash ? `${opts.hash.slice(0, 12)}-` : `${Math.random().toString(36).slice(2, 10)}-`;
    return `${dir}/${y}/${m}/${day.slice(8)}-${prefix}${name}`;
}

export async function presignPut(key: string, contentType: string, expiresInSeconds = 900): Promise<string> {
    const cmd = new PutObjectCommand({ Bucket: BUCKET!, Key: key, ContentType: contentType });
    return getSignedUrl(s3(), cmd, { expiresIn: expiresInSeconds });
}

// 未配置 R2_PUBLIC_URL（私有桶）时，用预签名 GET 让后台临时查看
export async function presignGet(key: string, expiresInSeconds = 900): Promise<string | null> {
    if (!r2Enabled()) return null;
    try {
        const cmd = new GetObjectCommand({ Bucket: BUCKET!, Key: key });
        return await getSignedUrl(s3(), cmd, { expiresIn: expiresInSeconds });
    } catch {
        return null;
    }
}

// 公开访问地址：配了公共域名就用它，否则回退预签名 GET
export function publicUrl(key: string): string | null {
    if (!key) return null;
    if (PUBLIC_URL) return `${PUBLIC_URL}/${key}`;
    return null;
}

// ── 同源代理（设计器给画布用的图）───────────────────────
// 为什么不能直接把 publicUrl() 丢进 Fabric：R2 公共域名实测不带
// access-control-allow-origin（预检 OPTIONS 直接 403）→ 带 crossOrigin 会加载失败，
// 不带则 canvas 被污染，toDataURL()/导出直接 SecurityError。所以图一律走本站 /api/asset/…。

/** 允许通过本站代理出去的目录。没列在这里的一律不读（凭证/源文件/生产包都是隐私） */
export const SERVED_PREFIXES = ['uploads/artwork/', 'assets/design/', 'templates/preview/', 'exports/designs/'];

/** 可变对象（预览图会被覆盖）不能上长期缓存 */
const MUTABLE_PREFIXES = ['templates/preview/'];

/** 代理入口的硬上限：防着有人拿它去拉几十上百 MB 的原稿/zip 打爆函数内存 */
export const MAX_SERVE_BYTES = 12 * 1024 * 1024;

/** 对象键是否允许对外提供（标准化 + 拒 '..' + 前缀白名单） */
export function isServableKey(key: string): boolean {
    const k = key.replace(/^\/+/, '');
    if (!k || k.includes('..') || k.includes('//')) return false;
    return SERVED_PREFIXES.some((p) => k.startsWith(p));
}

export function serveCacheControl(key: string): string {
    // 上传/导出类的键写入后不再变（名里带日期+随机前缀），而 undo/redo 会反复取同一张 → 交给浏览器长缓存
    return MUTABLE_PREFIXES.some((p) => key.startsWith(p))
        ? 'public, max-age=60'
        : 'public, max-age=31536000, immutable';
}

/** 同源代理地址（逐段 percent-encode：键里可能有中文与非 ASCII 原名） */
export function assetProxyUrl(key: string): string {
    return `/api/asset/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export type StoredObject = { bytes: Uint8Array; contentType: string; size: number };

/** 读对象字节（不存在/未配置/超限都返回 null，不区分——代理统一回 404，不泄露存在性） */
export async function getObjectBytes(key: string): Promise<StoredObject | null> {
    if (!r2Enabled()) return null;
    try {
        const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET!, Key: key }));
        const stream = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
        const bytes = (await stream?.transformToByteArray?.()) ?? new Uint8Array();
        if (!bytes.byteLength || bytes.byteLength > MAX_SERVE_BYTES) return null;
        return { bytes, contentType: res.ContentType ?? 'application/octet-stream', size: bytes.byteLength };
    } catch {
        return null;
    }
}

/** 服务端直接写小文件（只有有界工作图走这条路，大文件仍走预签名直传） */
export async function putObjectBytes(key: string, body: Uint8Array, contentType: string): Promise<boolean> {
    if (!r2Enabled()) return false;
    try {
        await s3().send(new PutObjectCommand({ Bucket: BUCKET!, Key: key, Body: body, ContentType: contentType }));
        return true;
    } catch {
        return false;
    }
}

export const MAX_UPLOAD_BYTES = 1000 * 1024 * 1024; // 与前端文案一致：up to 1000MB
export const ALLOWED_EXT = ['pdf', 'ai', 'psd', 'png', 'jpg', 'jpeg', 'svg', 'cdr', 'zip', 'tif', 'tiff', 'eps'];

export function isAllowedFileName(fileName: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return ALLOWED_EXT.includes(ext);
}
