// 模板生成器：按「版式骨架 × 配色 × 图案 × 字体搭配」组合出可编辑的设计模板，写入 DesignTemplate。
// 目的是让模板库"有东西可逛"（定位①：模板是转化道具），全部矢量原语 + 自有文案，无版权风险。
//
// 用法：
//   node scripts/generate-templates.mjs --dry-run --count=200   # 只算不写
//   node scripts/generate-templates.mjs --count=200             # 重建这一批（先删后写，幂等）
//   node scripts/generate-templates.mjs --clean                 # 只删本脚本生成的（sourceKey 标记）
//
// 约定：场景坐标 = 成品(px)，PX=8px/mm（与设计器一致）；所有对象 originX/originY 一律 left/top，
// 文字一律落在安全区内（否则引导页一打开就吃 Pre-flight 警告），装饰要么铺满成品线、要么整块在内。

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const env = Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;

const PX = 8;
const SOURCE = 'generated@template-kit';
const px = (v) => Math.round(v * PX * 1000) / 1000;

const prisma = new PrismaClient();

// ── 素材轴 ────────────────────────────────────────────────────────────────
const PALETTES = [
    { name: 'Kraft', bg: '#d8c3a5', ink: '#3f3222', accent: '#9c6b28', soft: '#efe3cf' },
    { name: 'Mono', bg: '#ffffff', ink: '#141414', accent: '#b4262a', soft: '#f1f1f1' },
    { name: 'Sage', bg: '#eef2e6', ink: '#26351f', accent: '#63855a', soft: '#dbe6cc' },
    { name: 'Ocean', bg: '#eaf2f7', ink: '#10283b', accent: '#276e88', soft: '#cfe3ee' },
    { name: 'Blush', bg: '#fbeef0', ink: '#4a1f2a', accent: '#b85f74', soft: '#f4d7dd' },
    { name: 'Graphite', bg: '#23262b', ink: '#f5f5f4', accent: '#c8973f', soft: '#3a3f47' },
    { name: 'Honey', bg: '#fff6da', ink: '#4a3607', accent: '#b8860b', soft: '#f7e2a8' },
    { name: 'Plum', bg: '#f3ecf7', ink: '#351d45', accent: '#6f4488', soft: '#e2d3ec' },
    { name: 'Mint', bg: '#e8f6f1', ink: '#143a30', accent: '#2c8871', soft: '#c9e9dd' },
    { name: 'Clay', bg: '#f9ece5', ink: '#4a2317', accent: '#ad5734', soft: '#f0d5c6' },
];

const TYPE_PAIRS = [
    { name: 'Editorial', display: 'Georgia', body: 'Arial' },
    { name: 'Modern', display: 'Arial', body: 'Arial' },
    { name: 'Typewriter', display: 'Courier New', body: 'Arial' },
    { name: 'Humanist', display: 'Verdana', body: 'Georgia' },
    { name: 'Industrial', display: 'Impact', body: 'Tahoma' },
];

const MOTIFS = ['none', 'dots', 'rings', 'bars', 'frame', 'corner', 'underline'];

// 每个 family：两种尺寸 + 若干版式骨架（骨架决定文字块位置）+ 文案槽位
const FAMILIES = [
    {
        productType: 'card',
        category: 'Business Cards',
        word: 'Business Card',
        sizes: [{ w: 90, h: 54, bleed: 2, safe: 4 }, { w: 85, h: 55, bleed: 2, safe: 4 }],
        shape: 'rect',
        slots: [
            { key: 'fullName', label: 'Name', sample: 'Your Name' },
            { key: 'role', label: 'Role', sample: 'Founder · Creative Director' },
            { key: 'contact', label: 'Contact', sample: '+1 555 0100 · hello@studio.com' },
        ],
        archetypes: [
            { name: 'Centered', layout: 'center-stack' },
            { name: 'Left Block', layout: 'left-block' },
            { name: 'Top Band', layout: 'top-band' },
            { name: 'Framed', layout: 'framed' },
            { name: 'Corner Mark', layout: 'corner-mark' },
        ],
    },
    {
        productType: 'label',
        category: 'Labels',
        word: 'Product Label',
        sizes: [{ w: 100, h: 50, bleed: 3, safe: 4 }, { w: 60, h: 40, bleed: 3, safe: 3.5 }],
        shape: 'rect',
        slots: [
            { key: 'brand', label: 'Brand', sample: 'STUDIO NAME' },
            { key: 'product', label: 'Product', sample: 'Cold Brew Blend' },
            { key: 'note', label: 'Detail', sample: 'Roasted 2026 · 250 g' },
        ],
        archetypes: [
            { name: 'Split', layout: 'left-block' },
            { name: 'Stacked', layout: 'center-stack' },
            { name: 'Framed', layout: 'framed' },
            { name: 'Top Band', layout: 'top-band' },
        ],
    },
    {
        // 圆形贴纸单独一类（不混在 label 里）：/design/sticker，模板库 chip 自动出现
        productType: 'sticker',
        category: 'Stickers',
        word: 'Round Sticker',
        sizes: [{ w: 80, h: 80, bleed: 3, safe: 6 }, { w: 50, h: 50, bleed: 2, safe: 4 }],
        shape: 'circle',
        slots: [
            { key: 'brand', label: 'Brand', sample: 'STUDIO' },
            { key: 'tagline', label: 'Tagline', sample: 'handmade with care' },
            { key: 'note', label: 'Detail', sample: 'since 2026' },
        ],
        archetypes: [
            { name: 'Ring Type', layout: 'badge' },
            { name: 'Centered', layout: 'center-stack' },
            { name: 'Underline', layout: 'underline-mark' },
        ],
    },
    {
        productType: 'tag',
        category: 'Cards & Tags',
        word: 'Hang Tag',
        sizes: [{ w: 40, h: 80, bleed: 3, safe: 4 }, { w: 50, h: 90, bleed: 3, safe: 5 }],
        shape: 'tag',
        slots: [
            { key: 'brand', label: 'Brand', sample: 'STUDIO' },
            { key: 'detail', label: 'Material', sample: '100% organic cotton' },
            { key: 'care', label: 'Care', sample: 'Wash cold · Do not bleach' },
        ],
        archetypes: [
            { name: 'Punch Top', layout: 'badge' },
            { name: 'Mid Band', layout: 'top-band' },
            { name: 'Stacked', layout: 'center-stack' },
        ],
    },
    {
        productType: 'box',
        category: 'Boxes & Packaging',
        word: 'Mailer Panel',
        sizes: [{ w: 200, h: 150, bleed: 3, safe: 8 }, { w: 120, h: 80, bleed: 3, safe: 6 }],
        shape: 'rect',
        slots: [
            { key: 'brand', label: 'Brand', sample: 'STUDIO NAME' },
            { key: 'subline', label: 'Line', sample: 'Handle with care' },
            { key: 'legal', label: 'Footer', sample: 'Made in China · www.studio.com' },
        ],
        archetypes: [
            { name: 'Hero', layout: 'center-stack' },
            { name: 'Left Block', layout: 'left-block' },
            { name: 'Top Band', layout: 'top-band' },
            { name: 'Framed Plate', layout: 'framed' },
        ],
    },
];

// ── 确定性随机（同 seed 同结果，重跑不产生新行）────────────────────────────
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 行序号驱动的小随机源：不依赖 Math.random，重跑得到同一批图案分配
function rndAt(i) {
    return mulberry32(1000 + i)();
}

const cut = '#e11d48'; // 刀版线颜色（与现有种子一致；它只是参考层，不参与印刷）

function dielineSvg(shape, w, h) {
    const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">`;
    const stroke = `fill="none" stroke="${cut}" stroke-width="0.3" stroke-dasharray="2 1.6"`;
    if (shape === 'circle') return `${head}<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2}" ${stroke}/></svg>`;
    if (shape === 'tag') {
        return `${head}<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.08}" ${stroke}/>` +
            `<circle cx="${w / 2}" cy="${h * 0.09}" r="${Math.min(w, h) * 0.045}" ${stroke}/></svg>`;
    }
    return `${head}<rect x="0" y="0" width="${w}" height="${h}" ${stroke}/></svg>`;
}

/** 文字块：统一 left/top 原点，宽度用 px，字号按 mm 换算后交给 PX */
function text(sample, opt) {
    return {
        type: 'textbox',
        originX: 'left',
        originY: 'top',
        left: px(opt.xMm),
        top: px(opt.yMm),
        width: px(opt.wMm),
        text: sample,
        fontFamily: opt.font,
        fontSize: px(opt.sizeMm),
        fontWeight: opt.weight ?? 'normal',
        fontStyle: opt.italic ? 'italic' : 'normal',
        fill: opt.color,
        textAlign: opt.align ?? 'left',
        lineHeight: 1.15,
        name: opt.name,
    };
}

function rect(xMm, yMm, wMm, hMm, fill, extra = {}) {
    return {
        type: 'rect', originX: 'left', originY: 'top',
        left: px(xMm), top: px(yMm), width: px(wMm), height: px(hMm),
        fill, locked: true, ...extra,
    };
}

function circle(cXMm, cYMm, rMm, o = {}) {
    return {
        type: 'circle', originX: 'left', originY: 'top',
        left: px(cXMm - rMm), top: px(cYMm - rMm), radius: px(rMm),
        locked: true, ...o,
    };
}

/** 装饰层（要么铺满成品线、要么整块在安全区内，避免开局就吃 Pre-flight 警告） */
function motif(kind, pal, w, h, safe, isCircle) {
    const out = [];
    // 圆形模板不能用四角/边框类装饰：那些东西会被圆刀切掉一半，看着就是做错了
    if (isCircle && !['none', 'dots', 'rings'].includes(kind)) return out;
    if (kind === 'dots') {
        const step = Math.max(w, h) / 7;
        for (let y = step; y < h - step * 0.5; y += step) {
            for (let x = step; x < w - step * 0.5; x += step) {
                if (isCircle && Math.hypot(x - w / 2, y - h / 2) > Math.min(w, h) * 0.42) continue;
                out.push(circle(x, y, Math.min(w, h) * 0.012, { fill: pal.accent, opacity: 0.35 }));
            }
        }
    } else if (kind === 'rings') {
        const cx = w / 2, cy = h / 2;
        for (const k of [0.44, 0.36, 0.28]) {
            out.push({ ...circle(cx, cy, Math.min(w, h) * k), fill: 'none', stroke: pal.accent, strokeWidth: px(0.25), opacity: 0.5 });
        }
    } else if (kind === 'bars') {
        // 右下角三根小色条（全在安全区内）
        const bw = Math.min(w, h) * 0.1, gap = bw * 0.45;
        for (let i = 0; i < 3; i++) {
            out.push(rect(w - safe - (3 - i) * (bw + gap) + gap, h - safe - bw * 0.35, bw, bw * 0.35, pal.accent, { opacity: 0.85 }));
        }
    } else if (kind === 'frame') {
        out.push({ ...rect(safe * 0.7, safe * 0.7, w - safe * 1.4, h - safe * 1.4, 'none'), stroke: pal.ink, strokeWidth: px(0.3), opacity: 0.75 });
    } else if (kind === 'corner') {
        // 圆心往内推一个半径：放在 (safe,safe) 会戳出出血框（实测被自检抓到）
        const r = Math.min(w, h) * 0.16;
        out.push(circle(Math.max(safe + r, r), Math.max(safe + r, r), r, { fill: pal.accent, opacity: 0.22 }));
    }
    return out;
}

/** 版式骨架：返回 objects；坐标全部以 mm 表达，保证文字在安全区内 */
function buildScene({ size, shape, pal, pair, motifKind, arch, slots }) {
    const { w, h, safe } = size;
    const isCircle = shape === 'circle';
    const objects = [];
    // 背景：铺满成品线（预检规则里"整块覆盖成品线"不算跨裁切）
    objects.push(rect(0, 0, w, h, pal.bg));
    objects.push(...motif(motifKind, pal, w, h, safe, isCircle));
    // 圆形模板加一个靠内的细环：不然预览看上去是正方形，客户不知道成品是圆的
    if (isCircle && arch.layout !== 'badge') {
        objects.push({ ...circle(w / 2, h / 2, Math.min(w, h) / 2 - 0.8), fill: 'none', stroke: pal.ink, strokeWidth: px(0.25), opacity: 0.55 });
    }

    // 圆形的内接方框：四角会被圆刀切掉，文字/分隔线必须落在里面
    const inner = isCircle
        ? { x: w * 0.15, y: h * 0.15, w: w * 0.7, h: h * 0.7 }
        : { x: safe, y: safe, w: w - safe * 2, h: h - safe * 2 };
    const name = slots[0], role = slots[1], note = slots[2];
    const bigMm = Math.min(inner.h * 0.22, 8);
    const midMm = Math.min(inner.h * 0.13, 4.4);
    const smallMm = Math.min(inner.h * 0.1, 3);

    if (arch.layout === 'center-stack') {
        objects.push(text(name.sample.toUpperCase(), { xMm: inner.x, yMm: inner.y + inner.h * 0.18, wMm: inner.w, sizeMm: bigMm, font: pair.display, weight: 'bold', color: pal.ink, align: 'center', name: name.key }));
        objects.push(rect(inner.x + inner.w * 0.38, inner.y + inner.h * 0.46, inner.w * 0.24, 0.4, pal.accent));
        objects.push(text(role.sample, { xMm: inner.x, yMm: inner.y + inner.h * 0.52, wMm: inner.w, sizeMm: midMm, font: pair.body, color: pal.ink, align: 'center', name: role.key }));
        objects.push(text(note.sample, { xMm: inner.x, yMm: inner.y + inner.h * 0.74, wMm: inner.w, sizeMm: smallMm, font: pair.body, color: pal.ink, align: 'center', name: note.key }));
    } else if (arch.layout === 'left-block') {
        const blockW = inner.w * 0.16;
        objects.push(rect(inner.x, inner.y, blockW, inner.h, pal.accent, { opacity: 0.9 }));
        const tx = inner.x + blockW * 1.6;
        const tw = inner.w - blockW * 1.6;
        objects.push(text(name.sample, { xMm: tx, yMm: inner.y + inner.h * 0.14, wMm: tw, sizeMm: bigMm, font: pair.display, weight: 'bold', color: pal.ink, name: name.key }));
        objects.push(text(role.sample, { xMm: tx, yMm: inner.y + inner.h * 0.48, wMm: tw, sizeMm: midMm, font: pair.body, color: pal.ink, name: role.key }));
        objects.push(text(note.sample, { xMm: tx, yMm: inner.y + inner.h * 0.72, wMm: tw, sizeMm: smallMm, font: pair.body, color: pal.ink, name: note.key }));
    } else if (arch.layout === 'top-band') {
        const bandH = inner.h * 0.34;
        // 品牌字落在色带里，但不能贴到裁切边：小尺寸上色带不够高时必须顶到安全区以下
        const nameY = Math.max(safe * 1.05, bandH * 0.28);
        objects.push(rect(0, 0, w, Math.max(bandH + safe, nameY + bigMm * 1.4), pal.accent));
        objects.push(text(name.sample, { xMm: inner.x, yMm: nameY, wMm: inner.w, sizeMm: bigMm, font: pair.display, weight: 'bold', color: pal.bg === '#ffffff' ? pal.ink : '#ffffff', align: 'center', name: name.key }));
        objects.push(text(role.sample, { xMm: inner.x, yMm: bandH + inner.h * 0.16, wMm: inner.w, sizeMm: midMm, font: pair.body, color: pal.ink, align: 'center', name: role.key }));
        objects.push(text(note.sample, { xMm: inner.x, yMm: bandH + inner.h * 0.42, wMm: inner.w, sizeMm: smallMm, font: pair.body, color: pal.ink, align: 'center', name: note.key }));
    } else if (arch.layout === 'framed') {
        objects.push({ ...rect(inner.x, inner.y, inner.w, inner.h, pal.soft), stroke: pal.ink, strokeWidth: px(0.3) });
        objects.push(text(name.sample, { xMm: inner.x, yMm: inner.y + inner.h * 0.16, wMm: inner.w, sizeMm: bigMm, font: pair.display, weight: 'bold', color: pal.ink, align: 'center', name: name.key }));
        objects.push(rect(inner.x + inner.w * 0.3, inner.y + inner.h * 0.44, inner.w * 0.4, 0.35, pal.accent));
        objects.push(text(role.sample, { xMm: inner.x + inner.w * 0.06, yMm: inner.y + inner.h * 0.52, wMm: inner.w * 0.88, sizeMm: midMm, font: pair.body, color: pal.ink, align: 'center', name: role.key }));
        objects.push(text(note.sample, { xMm: inner.x + inner.w * 0.06, yMm: inner.y + inner.h * 0.74, wMm: inner.w * 0.88, sizeMm: smallMm, font: pair.body, color: pal.ink, align: 'center', name: note.key }));
    } else if (arch.layout === 'corner-mark') {
        objects.push(circle(inner.x + inner.w * 0.12, inner.y + inner.h * 0.18, Math.min(w, h) * 0.09, { fill: pal.accent }));
        objects.push(text(name.sample, { xMm: inner.x, yMm: inner.y + inner.h * 0.52, wMm: inner.w, sizeMm: bigMm, font: pair.display, weight: 'bold', color: pal.ink, name: name.key }));
        objects.push(text(role.sample, { xMm: inner.x, yMm: inner.y + inner.h * 0.74, wMm: inner.w, sizeMm: midMm, font: pair.body, color: pal.ink, name: role.key }));
        objects.push(text(note.sample, { xMm: inner.x, yMm: inner.y + inner.h * 0.88, wMm: inner.w, sizeMm: smallMm, font: pair.body, color: pal.ink, name: note.key }));
    } else if (arch.layout === 'badge') {
        const r = Math.min(w, h) * 0.42;
        objects.push({ ...circle(w / 2, h / 2, r), fill: 'none', stroke: pal.ink, strokeWidth: px(0.35) });
        objects.push({ ...circle(w / 2, h / 2, r * 0.9), fill: pal.soft, opacity: 0.9 });
        objects.push(text(name.sample, { xMm: w * 0.18, yMm: h * 0.3, wMm: w * 0.64, sizeMm: bigMm, font: pair.display, weight: 'bold', color: pal.ink, align: 'center', name: name.key }));
        objects.push(text(role.sample, { xMm: w * 0.18, yMm: h * 0.52, wMm: w * 0.64, sizeMm: smallMm, font: pair.body, color: pal.ink, align: 'center', name: role.key }));
        objects.push(text(note.sample, { xMm: w * 0.18, yMm: h * 0.66, wMm: w * 0.64, sizeMm: smallMm, font: pair.body, color: pal.ink, align: 'center', name: note.key }));
    } else if (arch.layout === 'underline-mark') {
        objects.push(text(name.sample, { xMm: inner.x, yMm: inner.y + inner.h * 0.28, wMm: inner.w, sizeMm: bigMm, font: pair.display, weight: 'bold', color: pal.ink, align: 'center', name: name.key }));
        objects.push(rect(inner.x + inner.w * 0.32, inner.y + inner.h * 0.52, inner.w * 0.36, 0.45, pal.accent));
        objects.push(text(role.sample, { xMm: inner.x, yMm: inner.y + inner.h * 0.58, wMm: inner.w, sizeMm: midMm, font: pair.body, color: pal.ink, align: 'center', name: role.key }));
        objects.push(text(note.sample, { xMm: inner.x, yMm: inner.y + inner.h * 0.76, wMm: inner.w, sizeMm: smallMm, font: pair.body, color: pal.ink, align: 'center', name: note.key }));
    }

    if (motifKind === 'underline' && !isCircle) {
        objects.push(rect(inner.x + inner.w * 0.42, inner.y + inner.h * 0.9, inner.w * 0.16, 0.5, pal.accent));
    }
    return objects;
}

// ── 组合表：family × size × archetype × palette（去重后洗牌取前 N）──────────
function slugify(input) {
    return String(input).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72).replace(/-+$/g, '');
}

function buildCombos() {
    const list = [];
    for (const fam of FAMILIES) {
        for (const size of fam.sizes) {
            for (const arch of fam.archetypes) {
                for (const pal of PALETTES) {
                    list.push({ fam, size, arch, pal });
                }
            }
        }
    }
    // 确定性洗牌（seed 固定 → 重跑得到同一批，不会今天 200 个明天换 200 个）
    const rnd = mulberry32(20261010);
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

/**
 * 几何自检：用与设计器 runPreflight 相同的三条规则（超出血=error、跨裁切=warning、文字出安全区=warning）
 * 预查每个对象。不这么做的话，生成一批开局就吃黄条的模板，客户一进页面就看到警告。
 */
function checkScene(row) {
    const bad = [];
    const W = row.widthMm * PX, H = row.heightMm * PX;
    const bleed = row.bleedMm * PX, safe = row.safeAreaMm * PX;
    const trim = { l: 0, t: 0, r: W, b: H };
    const bleedBox = { l: -bleed, t: -bleed, r: W + bleed, b: H + bleed };
    const safeBox = { l: safe, t: safe, r: W - safe, b: H - safe };
    const has = (b) => b.l < b.r && b.t < b.b;
    // eps 是“宽容方向”：允许超出 eps 以内（四舍五入/字宽估算），不是往外张望
    const covers = (outer, inner, eps = 0) =>
        inner.l >= outer.l - eps && inner.t >= outer.t - eps && inner.r <= outer.r + eps && inner.b <= outer.b + eps;
    const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

    for (const o of row.sceneTemplate.objects) {
        if (o.visible === false) continue;
        const label = String(o.text ?? o.type).slice(0, 14);
        let box;
        if (o.type === 'circle') {
            const r = o.radius ?? 0;
            box = { l: o.left, t: o.top, r: o.left + r * 2, b: o.top + r * 2 };
        } else {
            const h = o.type === 'textbox'
                ? o.fontSize * (o.lineHeight ?? 1.16) * String(o.text ?? '').split('\n').length
                : o.height ?? 0;
            box = { l: o.left, t: o.top, r: o.left + (o.width ?? 0), b: o.top + h };
        }
        if (!has(box)) continue;
        const eps = 1; // px，约 0.13mm
        if (!covers(bleedBox, box, eps)) bad.push(`outside-bleed “${label}” [${(box.l / PX).toFixed(1)},${(box.t / PX).toFixed(1)} → ${(box.r / PX).toFixed(1)},${(box.b / PX).toFixed(1)}]mm`);
        // 与设计器同逻辑：整块覆盖成品线的背景不算跨裁切
        else if (!covers(trim, box) && overlaps(box, trim) && !covers(box, trim)) bad.push(`crossing-trim “${label}”`);
        else if (o.type === 'textbox' && !covers(safeBox, box, eps)) bad.push(`text-outside-safe “${label}”`);
    }
    return bad;
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const clean = args.includes('--clean');
    const count = Number((args.find((a) => a.startsWith('--count=')) ?? '').split('=')[1] || 200);

    if (clean) {
        const del = await prisma.designTemplate.deleteMany({ where: { sourceKey: SOURCE } });
        console.log(`cleaned generated templates: ${del.count}`);
        console.log(`templates_total_now=${await prisma.designTemplate.count()}`);
        await prisma.$disconnect();
        return;
    }

    const combos = buildCombos().slice(0, count);
    const rows = [];
    const seen = new Set();
    combos.forEach((c, i) => {
        const { fam, size, arch, pal } = c;
        const pair = TYPE_PAIRS[i % TYPE_PAIRS.length];
        const motifKind = MOTIFS[Math.floor(rndAt(i) * MOTIFS.length)];
        const nameStr = `${pal.name} ${arch.name} ${fam.word} · ${size.w}×${size.h}mm`;
        let slug = slugify(`${pal.name} ${arch.name} ${fam.word} ${size.w}x${size.h}mm`);
        while (seen.has(slug)) slug = `${slug}-x`;
        seen.add(slug);

        const objects = buildScene({
            size: { ...size },
            shape: fam.shape,
            pal,
            pair,
            motifKind,
            arch,
            slots: fam.slots,
        });
        const scene = { version: '7.4.0', objects };
        rows.push({
            slug,
            name: nameStr,
            productType: fam.productType,
            category: fam.category,
            dielineSvg: dielineSvg(fam.shape, size.w, size.h),
            widthMm: size.w,
            heightMm: size.h,
            bleedMm: size.bleed,
            safeAreaMm: size.safe,
            sceneTemplate: scene,
            slots: fam.slots.map((s) => ({ key: s.key, kind: 'text', label: s.label, maxLength: 40 })),
            active: true,
            sort: 100 + i,
            tags: ['generated', fam.word.toLowerCase().replace(/\s+/g, '-'), pal.name.toLowerCase(), motifKind],
            sourceKey: SOURCE,
            sourceHash: createHash('sha256').update(JSON.stringify(scene)).digest('hex'),
        });
    });

    // 说明：rndAt 已提到模块层定义（行序号→稳定伪随机）

    const byType = {};
    for (const r of rows) byType[r.productType] = (byType[r.productType] ?? 0) + 1;
    console.log(`planned=${rows.length} byType=${JSON.stringify(byType)} uniqueSlugs=${seen.size}`);
    console.log(`sample: ${rows[0]?.name} → /${rows[0]?.slug}`);

    const bad = [];
    for (const r of rows) for (const v of checkScene(r)) bad.push(`${r.slug} ${v}`);
    console.log(bad.length ? `preflight-geometry: ${bad.length} VIOLATIONS\n  ${bad.slice(0, 8).join('\n  ')}` : 'preflight-geometry: 0 violations (bleed/trim/safe all OK)');

    if (dryRun) {
        await prisma.$disconnect();
        return;
    }

    let created = 0;
    // 重跑 = 整批重建：一删一写两个往返，幂等且保证库里与当前生成器版本一致。
    // （以前按 sourceHash 跳过 + createMany.skipDuplicates：版式改了就 slug 撞车静默丢弃，实测坑过）
    await prisma.designTemplate.deleteMany({ where: { sourceKey: SOURCE } });
    if (rows.length) {
        const res = await prisma.designTemplate.createMany({ data: rows });
        created = res.count ?? rows.length;
    }
    await prisma.$executeRawUnsafe('ANALYZE "DesignTemplate"'); // 灌完必须更新统计信息，否则 planner 选错计划
    console.log(`rebuilt=${created} total=${await prisma.designTemplate.count()} generated=${await prisma.designTemplate.count({ where: { sourceKey: SOURCE } })}`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(String(e?.message ?? e).slice(0, 400));
    await prisma.$disconnect();
    process.exit(1);
});
