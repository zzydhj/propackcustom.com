# 项目交接记忆（HANDOFF）

> 更新：2026-10-08 · 分支 `main` @ `4614eed`（已全部 push 到 origin，GitHub: zzydhj/propackcustom.com）
> **新会话续接方法：打开本目录 → 让 AI 读完本文件 → 说「按 HANDOFF 继续，做第 N 项」。**

## 1. 项目是什么

B2B 定制包装/印刷站（面向海外采购商，主语言 en，7 语言 i18n 框架但 es/fr/de/pt/ar 仅核心段翻译、其余 fallback en）。
**定位**：后台=内部销售的中文工具；前台=海外 B 端采购。个人用户看不懂是预期行为。

技术栈：Next.js 16.3.5（App Router/Turbopack/Server Actions）· React 19 · Prisma 6.19 + **Neon PostgreSQL** · next-intl（`localePrefix:'as-needed'`）· NextAuth · Tailwind v4 · **Fabric.js 7.4**（自研设计器引擎）· R2（未配置）· Resend（未配置实发）· Stripe（未配 key，降级 T/T）。

## 2. 功能全景（全部已实测通过）

**前台**：产品列表/详情（配置器即时算价+阶梯折扣+附加费+父子选项树）· RFQ 报价 `/quote` · 免登录订单 `/order/[token]`（人工对接：SUBMITTED 锁价72h → 销售确认 → AWAITING_PAYMENT → 付款）· 钱包余额支付 · blog/videos SEO 模块（JSON-LD/sitemap/robots）· **Design Studio 在线设计**（详见 §3）· mega menu（左分类列+右产品图网格，悬停区模型）。

**后台（中文内部工具）**：订单（筛选/人工调价/确认收款/发货）、报价（可转订单）、产品（配置器 Builder：属性组/选项树/价格规则/依赖规则）、分类、钱包调账、**模板/博客/视频 CRUD**。

## 3. Design Studio（本期重心，M0→M3 + 矢量导出全部完成）

- **模板系统**：`DesignTemplate`（slug/productType/dielineSvg/widthMm?/heightMm?/bleedMm/safeAreaMm/sceneTemplate JSON 预置场景/active/sort）。seed：`prisma/seed-templates.mjs`（5 个跨类型模板，upsert 幂等）。`/design` 模板库按类型分组；`/design/[productType]` 四态分支：`?design=` 载入作品 → `?template=` 套模板新建 → 模板选择网格 → 空白画布。
- **编辑器**：全屏左右工作台（`fixed inset-0 z-[60]` 覆盖站点导航/页脚 + 挂载时锁 `html overflow`）；左 aside 288px（命名/Save/文字/图片/删除/撤销重做/导入导出/导引线开关/两条出单 CTA）；右画布工作区，`PX_PER_MM=8`（≈200dpi 预览，80mm→640px）。三层结构：`DesignStudio`（client，`dynamic ssr:false` 容器）→ `DesignCanvas`（工具与 CTA）→ `useFabricCanvas`（引擎 hook，历史栈 undo/redo 用 `restoring` 标志防污染）。
- **刀版/出血/安全区**：独立 HTML `pointer-events-none` overlay，**绝不进 Fabric 对象树** → sceneJson 与导出产物干净（刀版线不印刷）；值从模板流转，可开关。
- **保存闭环**：`saveDesign`（`src/features/design/actions.ts`）upsert `UserDesign`（sceneJson=canvas.toJSON 序列化、归属 userId+email 软引用、templateId、productType、status DRAFT/SUBMITTED）；保存后 URL `?design=id` 可续改。
- **双出单路径**（localStorage 一次性桥 `pp_order_design`，读取即清）：
  - **Get expert quote →** `/quote`：`QuoteForm` hidden `designId` → `submitRfq` 落 `Quote.designId`（人工对接报价，无需选产品——`Quote.productId` 可空）。
  - **Order with a product →** `/products`：`ProductConfigurator` hidden `designId` → `createProductOrder` 落 `Order.designId`（走完整计价链）。
  - 约束记忆点：`OrderItem.productId` **必填** → 设计单必须挂真实产品；`Quote` 无此约束。
- **矢量导出**：
  - `Export SVG (vector)`：`exportSVG()` 把 Fabric toSVG 根节点改写为**物理毫米** `width="100mm" height="50mm" viewBox="0 0 800 400"` → Ai/Inkscape/印厂打开即真实尺寸。
  - `Export PDF (print)`：浏览器端 `jspdf@4.2.1 + svg2pdf.js@2.8.1`（dynamic import 不进首屏）。**关键坑：必须传 `DOMParser` 解析后的 SVGElement，传字符串会炸 `rootSvg.querySelectorAll is not a function`**。实测产出合法 %PDF-1.3、字体嵌入。文案提示印前需转曲。
  - `Export PNG`（toDataURL multiplier=2 ≈400dpi）、`Export/Import JSON`（工程文件）。
- **我的设计**：`/account/designs`（userId OR email 归属查询，模板尺寸批查，卡片回链编辑器）；账户侧栏入口（en/zh key）。
- **后台看稿**：admin/orders 订单卡片「查看设计稿」深链（批量解析 `UserDesign.productType` 构造 `/design/[type]?design=id`）。

## 4. 数据库与迁移状态（⚠️ 有漂移，上线前必处理）

- 正式 migrations：`20260919150910_init` … `20261008000000_order_proof_key_email_index`、`20261008100000_content_blog_video`、`20261008110000_design_studio`（均 applied）。
- **之后两个字段走了 `db push`，没有 migration 目录**：`Quote.designId`、`UserDesign.productType`。上线前需 `prisma migrate diff` 生成 migration.sql 并 `migrate resolve`，或统一走 db push 流程。**血泪教训**：Neon 库结构即时生效而部署滞后 → 旧 client SELECT 新列会 500（读库路由全挂，不读库的没事）。
- 测试数据：库里残留 ≥4 条 `UserDesign`（E2E-Save-Test-Label、Untitled design×N）+ 若干测试订单（PPMUW…），可清。
- 模型新增：`Post`/`Video`（PublishStatus）· `DesignTemplate`/`UserDesign`（DesignStatus）· `Order.designId` · `Quote.designId`。

## 5. 环境与操作要点（踩坑记录，务必读）

1. **IDE 的 Prisma 类型报错几乎全是缓存假报**（新 model/字段 IDE 不认）→ 唯一权威：`node node_modules/typescript/bin/tsc --noEmit`（当前 0 错）。
2. **新 Prisma 模型/字段后**：必须 停 dev server → `prisma generate`（EPERM=被跑着的 dev server 锁 dll）→ `db push` 或迁移 → **重启 dev server**（内存旧 client 不认新表，访问即 500）。
3. 沙箱内 `Get-Process node | Stop-Process` 会连沙箱 node 一起杀 → 下一条命令报「node.exe 拒绝访问」；再发一条 `node --version` 即恢复。
4. PowerShell：不支持 `&&`（用 `;`）；`node -e "$VAR"` 会被插值，写 .mjs 文件跑。
5. dev server：`npm run dev` → :3000，通常由 AI 在 IDE 后台终端跑着。Neon 冷启动偶发 P1001 连不上，等 10s 刷新即恢复。
6. push GitHub 偶发 500 → 重试即可。删除文件用 `git rm`（DeleteFile 工具曾虚报成功）。
7. 临时截图不进仓库：`.gitignore` 已含 `_qa_*.png`/`_verify_*.png`/`.qoder-*.png`。
8. R2 未配置：设计器图片 dataURL、上传走文件名降级（逻辑已容错）；配 `R2_*` env 后启用直传。

## 6. 待办（按优先级，用户认可「设计器要做到值得付费」的方向）

| # | 项 | 说明 | 难度 |
|---|---|---|---|
| 1 | 首页加 Design Studio 入口 | 现在只有导航有，转化路径浪费 | 易 |
| 2 | 迁移漂移收尾 | §4 两个 db push 字段补 migration | 易 |
| 3 | 编辑器对象属性面板 | 颜色/字号/层级/对齐 → 付费可用性关键 | 中 |
| 4 | 导出成品入 R2（`UserDesign.exportKey/thumbKey` 已留） | 依赖 R2 env；上传 SVG/PDF 随订单 | 中 |
| 5 | 后台模板上传图/拖拽刀版 SVG | 现在贴文本 | 易 |
| 6 | 出血校验（对象超出画布告警）+ CMYK 色彩管理 | 印刷专业度（M4 护城河） | 中大 |
| 7 | 文字转曲导出（outlines） | PDF 提示已有；真转曲需字体解析 | 难 |
| 8 | 测试数据清理 + `/account/designs` 正文 i18n 化 | 杂项 | 易 |

## 7. 关键文件速查

- 设计器：`src/components/design/{useFabricCanvas,DesignCanvas,DesignStudio}.tsx` · `src/features/design/actions.ts` · `src/app/[locale]/design/{page,[productType]/page}.tsx` · `src/app/[locale]/account/designs/page.tsx`
- 桥接：`src/components/quote/{ProductConfigurator,QuoteForm}.tsx`（localStorage `pp_order_design`）· `src/features/{order,quote}/actions.ts`（designId 落库）
- 导航：`src/components/site/SiteNav.tsx`（悬停区模型+mega menu）· `src/lib/megaMenu.ts`（NavGroup 数据）
- 后台：`src/components/admin/{TemplateEditor,PostEditor,VideoEditor,OrderReviewPanel}.tsx` · `src/features/admin/actions.ts` · `src/app/[locale]/admin/{templates,blog,videos,orders}/page.tsx`
- 计价引擎：`src/lib/config-engine.ts` · 订单领域：`src/lib/orders.ts`
- schema：`prisma/schema.prisma`（Order.designId L277、Quote.designId、DesignTemplate/UserDesign L~360-400、Post/Video）

## 8. 提交链（origin/main 已同步至 4614eed）

`4614eed` 矢量导出 SVG+PDF · `26236e7` M3 刀版/出血 overlay · `d049008` 我的设计+后台看稿链+productType 持久化 · `ba152ba` 专家报价路径 · `e0b5bdf` M2a 设计→下单桥 · `14e4603` 画布放大+满宽 · `9f6edee` 前台文案英文化 · `025d4ce` M1b 作品入库 · `ab40b9e` 模板系统+后台CRUD+宽度 · `6f26735` mega menu 修复+设计入口 · `aff24c4` B端化+SEO+M0/M1。
