// AI / PDF 批量导入器：把源文件抽成「可审核的设计模板草稿」写入 DesignTemplate。
//
// 用法（必须带 --experimental-strip-types，因为要 import 应用内的 TS 模块）：
//   node --experimental-strip-types scripts/import-ai.mjs --dir="Test file" --dry-run
//   node --experimental-strip-types scripts/import-ai.mjs "Test file/广耀眼镜标.ai" --type=tag
//   node --experimental-strip-types scripts/import-ai.mjs --dir="Test file" --publish
//
// 为什么是命令行而不是后台上传页：
//   1) Vercel serverless 请求体上限 4.5MB，而真实 AI/PDF 动辄 3–10MB（实测样本 1.2–10.1MB）；
//   2) pdf.js 在 Node 里要读 cmaps/standard_fonts 目录，塞进 serverless 打包很脆；
//   3) 几百上千个文件是**离线批处理**场景，不是客户交互场景。
//   映射与判定都在 src/lib/ai-template.ts（纯函数），以后做后台审核台直接复用同一份规则。
//
// 行为约定：
//   · 默认 active=false（草稿）。只有 --publish 且映射器判定 publishable（无 error 级问题）才上架。
//   · 按 sourceHash 去重：同一个文件重复跑不会产生第二行。
//   · 源文件归档进 R2 的 templates/source/<yyyy>/<mm>/<sha12>-<原名>（桶没配就跳过并提示）。
//   · 结尾跑一次 ANALYZE（批量写库后统计信息是旧的，见 HANDOFF §5-14）。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import { readPdfFacts, type PdfFacts } from '../src/lib/pdf-facts.ts';
import { mapPdfToTemplate, type ImportIssue } from '../src/lib/ai-template.ts';
import { sceneToSvg } from '../src/lib/scene-svg.ts';
import { ensureUniqueSlug } from '../src/lib/template-query.ts';
import { prisma } from '../src/lib/prisma.ts';
import { objectKey, presignPut, publicUrl, r2Enabled } from '../src/lib/r2.ts';

// ── 环境与参数 ────────────────────────────────────────────
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i <= 0 || line.startsWith('#')) continue;
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const argv = process.argv.slice(2);
const flag = (name: string) => argv.some((a) => a === `--${name}`);
const opt = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const DRY = flag('dry-run');
const PUBLISH = flag('publish');
const PRODUCT_TYPE = opt('type') ?? 'label';
const LIMIT = Number(opt('limit') ?? '0');
const EXT = ['.ai', '.pdf'];

const files: string[] = [];
for (const a of argv) {
    if (a.startsWith('--')) continue;
    files.push(a);
}
const dir = opt('dir');
if (dir && existsSync(dir)) {
    for (const f of readdirSync(dir)) {
        if (EXT.some((e) => f.toLowerCase().endsWith(e))) files.push(join(dir, f));
    }
}
if (!files.length) {
    console.log('NO_INPUT  用法: node --experimental-strip-types scripts/import-ai.mts <file.ai> ... | --dir=<目录> [--type=label] [--dry-run] [--publish]');
    process.exit(1);
}
if (LIMIT > 0) files.length = Math.min(files.length, LIMIT);

/** 全 ASCII 输出：PowerShell 会把中文打乱，结论读错比难看更糟（HANDOFF §5） */
const a = (v: unknown) => JSON.stringify(String(v ?? ''));
const issueLine = (i: ImportIssue) => `      ${i.level === 'error' ? 'ERR ' : 'WARN'} ${i.code}: ${a(i.message)}`;

let created = 0;
let updated = 0;
let blocked = 0;
let failed = 0;

try {
    // 存 hash → id，而不只是一个 Set：更新时要把自己的 id 传给 ensureUniqueSlug 排除，
    // 否则它会撞上自己那一行 → 每重跑一次 slug 就多一个 -2/-3 后缀（实测踩过）
    const byHash = new Map<string, string>();
    for (const r of await prisma.designTemplate.findMany({
        where: { sourceHash: { not: null } },
        select: { id: true, sourceHash: true },
    })) {
        if (r.sourceHash) byHash.set(r.sourceHash, r.id);
    }

    for (const file of files) {
        console.log(`--- ${a(file)}`);
        let facts: PdfFacts | undefined;
        try {
            facts = await readPdfFacts(file);
        } catch (e) {
            failed++;
            console.log(`      FAIL ${a((e as Error).message)}`);
            continue;
        }

        const draft = mapPdfToTemplate(facts, { productType: PRODUCT_TYPE });
        console.log(`      size=${draft.widthMm}x${draft.heightMm}mm bleed=${draft.bleedMm}mm slots=${draft.slots.length} paths=${facts.vectorPathOps} fonts=${facts.fonts.length} sha=${facts.sha12}`);
        for (const i of draft.issues) console.log(issueLine(i));

        // 写库前先确认这份场景能被渲染 —— sceneToSvg 就是模板卡片出图用的同一函数，
        // 它对不上数就说明导进去的是坏模板（卡片空白 / 设计器报错）
        const preview = sceneToSvg(draft.sceneTemplate, { widthMm: draft.widthMm, heightMm: draft.heightMm });
        const textNodes = preview ? (preview.match(/<text/g) ?? []).length : -1;
        const previewBroken = draft.slots.length > 0 && textNodes !== draft.slots.length;
        console.log(`      PREVIEW ${preview ? `svg=${preview.length}B text=${textNodes}/${draft.slots.length}` : 'NO-SVG'} ${previewBroken ? 'BROKEN' : ''}`);

        if (DRY) {
            console.log(`      DRY-RUN publishable=${draft.publishable} previewOk=${!previewBroken} name=${a(draft.name)}`);
            if (!draft.publishable || previewBroken) blocked++;
            continue;
        }
        if ((!draft.publishable && !PUBLISH) || previewBroken) {
            blocked++;
            console.log(`      BLOCKED ${previewBroken ? '场景无法渲染（previewBroken）' : '有 error 级问题；要强行入库加 --publish'}`);
            continue;
        }

        // 源文件归档：桶可用才传，键名带内容指纹前 12 位，重复导入自然落到同一个键
        let sourceKey: string | undefined;
        if (r2Enabled()) {
            sourceKey = objectKey('template-source', file.split(/[\\/]/).pop() ?? 'source.ai', { hash: facts.sha12 });
            const put = await fetch(await presignPut(sourceKey, 'application/pdf'), {
                method: 'PUT',
                body: readFileSync(file),
                headers: { 'content-type': 'application/pdf' },
            });
            console.log(`      R2 ${put.status} ${a(sourceKey)} preview=${a(publicUrl(sourceKey) ?? '(no public url)')}`);
            if (!put.ok) sourceKey = undefined;
        } else {
            console.log('      R2 disabled (skip archive)');
        }

        // slug 由映射器算（已处理中文名被 slugify 剥空的情况）；excludeId 避开自己那一行
        const existingId = byHash.get(facts.sha12);
        const slug = await ensureUniqueSlug(draft.slug, existingId);
        const data: Prisma.DesignTemplateUncheckedCreateInput = {
            slug,
            name: draft.name,
            productType: draft.productType,
            category: 'Imported',
            widthMm: draft.widthMm,
            heightMm: draft.heightMm,
            bleedMm: draft.bleedMm,
            safeAreaMm: draft.safeAreaMm,
            fullBleed: draft.fullBleed,
            sceneTemplate: draft.sceneTemplate,
            slots: draft.slots,
            tags: draft.tags,
            sourceHash: facts.sha12,
            sourceKey,
            widthPx: draft.widthPx,
            heightPx: draft.heightPx,
            dpi: draft.dpi,
            // 只有 --publish 且映射器认为没问题才上架
            active: PUBLISH && draft.publishable,
            sort: 0,
        };

        if (existingId) {
            await prisma.designTemplate.updateMany({ where: { sourceHash: facts.sha12 }, data });
            updated++;
            console.log(`      UPDATED slug=${a(slug)} active=${data.active}`);
        } else {
            const row = await prisma.designTemplate.create({ data, select: { id: true } });
            byHash.set(facts.sha12, row.id); // 同一批里重复出现的文件走更新分支，不建第二行
            created++;
            console.log(`      CREATED slug=${a(slug)} active=${data.active}`);
        }
    }

    if (!DRY && created + updated > 0) {
        await prisma.$executeRawUnsafe('ANALYZE "DesignTemplate"');
    }
    console.log(`TOTAL files=${files.length} created=${created} updated=${updated} blocked=${blocked} failed=${failed} dryRun=${DRY} publish=${PUBLISH}`);
    console.log(`TEMPLATES now=${await prisma.designTemplate.count()} imported=${await prisma.designTemplate.count({ where: { tags: { has: 'imported:pdf' } } })}`);
} finally {
    await prisma.$disconnect();
}
