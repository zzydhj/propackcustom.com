// AI/PDF 单文件取证报告（spike 的延续，但不再自带一份解析逻辑）。
//
// 提取在 src/lib/pdf-facts.ts、判定在 src/lib/ai-template.ts —— 这里只负责打印与落盘，
// 所以报告里的数字与批量导入器（scripts/import-ai.mts）看到的完全一致。
//
// 用法：node --experimental-strip-types scripts/ai-pdf-spike.mts ["Test file/包装盒.ai"]
// 输出：控制台只打 ASCII（PowerShell 中文会乱码，见 HANDOFF §5），完整报告写 scripts/out/

import { mkdirSync, writeFileSync } from 'node:fs';
import { readPdfFacts } from '../src/lib/pdf-facts.ts';
import { mapPdfToTemplate } from '../src/lib/ai-template.ts';

const target = process.argv[2] ?? 'Test file/包装盒.ai';
/** 非 ASCII 一律转义：JSON.stringify 只转控制字符，中文会原样输出并被终端重编码 */
const ascii = (s: unknown) =>
    '"' + String(s).replace(/[^\x20-\x7e]/g, (c) => `\\u${(c.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`) + '"';

const facts = await readPdfFacts(target);
const draft = mapPdfToTemplate(facts, { productType: 'label' });

mkdirSync('scripts/out', { recursive: true });
const outFile = `scripts/out/${facts.sha12}-ai-report.json`;
writeFileSync(outFile, JSON.stringify({ facts, draft }, null, 2), 'utf8');

console.log(`FILE            ${ascii(target.split(/[\\/]/).pop())} sizeMB=${(facts.sizeBytes / 1024 / 1024).toFixed(2)} sha12=${facts.sha12} pages=${facts.pageCount}`);
console.log(`PDF             version=%PDF-${facts.pdfVersion} rotate=${facts.rotate}`);
console.log(`CREATOR         ${ascii(facts.creator)}`);
console.log(`PRODUCER        ${ascii(facts.producer)}`);
console.log(`BOX pt          trim=${JSON.stringify(facts.boxes.trim)} bleed=${JSON.stringify(facts.boxes.bleed)}`);
console.log(`BOX pt          crop=${JSON.stringify(facts.boxes.crop)} media=${JSON.stringify(facts.boxes.media)}`);
console.log(`DERIVED         ${draft.widthMm}x${draft.heightMm}mm bleed=${draft.bleedMm}mm origin=${JSON.stringify(facts.trimOriginMm)}`);
console.log(`OC GROUPS       ${facts.ocgNames.length}`);
for (const n of facts.ocgNames) console.log(`  - ${ascii(n)}`);
console.log(`FONTS           ${facts.fonts.length}`);
for (const f of facts.fonts) console.log(`  - ${ascii(f)}`);
console.log(`TEXT            runs=${facts.runs.length} garbled=${facts.garbledRuns} slots=${draft.slots.length}`);
for (const r of facts.runs.slice(0, 20)) console.log(`  [${ascii(r.layer)}] ${ascii(r.text)} @${r.xMm},${r.topMm} w=${r.widthMm} size=${r.sizeMm}mm`);
console.log(`PATHS           ops=${facts.vectorPathOps} (坐标未做 CTM 累加，本期不导入)`);
console.log(`LAYERS          markedContent=${facts.markedContentTagged} count=${facts.layers.length}`);
for (const l of facts.layers) console.log(`  ${ascii(l.name)} texts=${l.texts} paths=${l.paths} sample=${ascii(l.sample.slice(0, 24))}`);
console.log(`ISSUES          error=${draft.issues.filter((i) => i.level === 'error').length} warning=${draft.issues.filter((i) => i.level === 'warning').length}`);
for (const i of draft.issues) console.log(`  ${i.level === 'error' ? 'ERR ' : 'WARN'} ${i.code}: ${ascii(i.message)}`);
console.log(`PUBLISHABLE     ${draft.publishable}  slug=${ascii(draft.slug)}`);
console.log(`REPORT          ${outFile}`);
