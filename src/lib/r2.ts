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
 *   uploads/artwork/<yyyy>/<mm>/<dd>-<id8>-<原名>   客户上传的设计原稿
 *   uploads/proofs /<yyyy>/<mm>/…                  客户上传的付款凭证
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
    | 'design-export'
    | 'template-source'
    | 'template-preview'
    | 'production'
    | 'tmp';

type Shard = 'date' | 'entity' | 'none';
const LAYOUT: Record<R2Kind, { dir: string; shard: Shard }> = {
    artwork: { dir: 'uploads/artwork', shard: 'date' },
    proof: { dir: 'uploads/proofs', shard: 'date' },
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

export const MAX_UPLOAD_BYTES = 1000 * 1024 * 1024; // 与前端文案一致：up to 1000MB
export const ALLOWED_EXT = ['pdf', 'ai', 'psd', 'png', 'jpg', 'jpeg', 'svg', 'cdr', 'zip', 'tif', 'tiff', 'eps'];

export function isAllowedFileName(fileName: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return ALLOWED_EXT.includes(ext);
}
