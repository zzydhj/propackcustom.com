import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ── Cloudflare R2（S3 兼容）素材与凭证存储 ─────────────────
// 关键点：Vercel Serverless 请求体上限 4.5MB，印刷源文件动辄几百 MB，
// 所以文件绝不经过本站服务器 —— 一律用预签名 URL 让浏览器直传 R2。

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
    n.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, '-').slice(-120);

// 对象键：按用途分目录，便于生命周期规则与后台检索
export function objectKey(kind: 'artwork' | 'proof', fileName: string): string {
    const day = new Date().toISOString().slice(0, 10);
    const rand = Math.random().toString(36).slice(2, 10);
    return `${kind}/${day}/${rand}-${safeName(fileName || 'file')}`;
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

export const MAX_UPLOAD_BYTES = 1000 * 1024 * 1024; // 与前端文案一致：up to 1000MB
export const ALLOWED_EXT = ['pdf', 'ai', 'psd', 'png', 'jpg', 'jpeg', 'svg', 'cdr', 'zip', 'tif', 'tiff', 'eps'];

export function isAllowedFileName(fileName: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return ALLOWED_EXT.includes(ext);
}
