# 项目交接记忆（HANDOFF）

> 更新：2026-10-09 · 分支 `main` @ `5385d94` 再加本文所在的 docs 提交（全部已 push 到 origin，GitHub: zzydhj/propackcustom.com）
> **新会话续接方法：打开本目录 → 让 AI 读完本文件 → 说「按 HANDOFF 继续，做第 N 项」。**

## 1. 项目是什么

B2B 定制包装/印刷站（面向海外采购商，主语言 en，7 语言 i18n 框架但 es/fr/de/pt/ar 仅核心段翻译、其余 fallback en）。
**定位**：后台=内部销售的中文工具；前台=海外 B 端采购。个人用户看不懂是预期行为。
**语言策略（2026-10-09 定）**：前台就做全英文为主，新文案**只写 `messages/en.json`**；中文和其它语言包**暂不碰**，缺失 key 由 `request.ts` 的 deepMerge 自动回退英文 → 非英文页面看到英文是预期，不是缺陷，不要再花时间补翻译。

技术栈：Next.js 16.3.5（App Router/Turbopack/Server Actions）· React 19 · Prisma 6.19 + **Neon PostgreSQL** · next-intl（`localePrefix:'as-needed'`）· NextAuth · Tailwind v4 · **Fabric.js 7.4**（自研设计器引擎）· R2（未配置）· Resend（未配置实发）· Stripe（未配 key，降级 T/T）。devDependency 里的 **ag-psd** 只服务于 PSD 导入 spike（`scripts/psd-spike.mjs`），应用运行时不引用。

## 2. 功能全景（全部已实测通过）

**前台**：产品列表/详情（配置器即时算价+阶梯折扣+附加费+父子选项树）· RFQ 报价 `/quote` · 免登录订单 `/order/[token]`（人工对接：SUBMITTED 锁价72h → 销售确认 → AWAITING_PAYMENT → 付款）· 钱包余额支付 · blog/videos SEO 模块（JSON-LD/sitemap/robots）· **Design Studio 在线设计**（详见 §3）· mega menu（左分类列+右产品图网格，悬停区模型）· **首页 Design Studio 深色转化横幅**（`page.tsx` 的 `DesignStudioBand`+`DesignStudioMock`，命名空间 `DesignStudio`，纯 CSS 示意不查库，保持首页静态可渲染）。

**后台（中文内部工具）**：订单（筛选/人工调价/确认收款/发货）、报价（可转订单）、产品（配置器 Builder：属性组/选项树/价格规则/依赖规则）、分类、钱包调账、**模板/博客/视频 CRUD**（模板的刀版 SVG 已支持**拖拽/选文件上传 + 实时预览 + 校验**，`src/components/admin/DielineField.tsx`：无 `<svg>`/无 viewBox/viewBox 不可解析/超 200KB 均拒绝写入 textarea，不合法内容永不会入库，因为前台会 `dangerouslySetInnerHTML` 直接渲染它）。

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
- **对象属性面板**（`src/components/design/ObjectPropertiesPanel.tsx`，纯受控展示）：单选才出面板（多选提示 N objects selected），Text 给字体/字号/颜色（取色器+8 色块）/B·I·U·L·C·R，通用给 opacity/rotate/flipX·Y/Layer 4 键/Align to dieline 6 键 + 中心 mm 读数。引擎侧 `useFabricCanvas` 新增 `active/selectionCount/patchActive/alignActive/layerActive`，监听 `selection:created|updated|cleared` 同步选中态；**bold/italic → fontWeight/fontStyle 的字段映射只留在引擎层**，UI 只传语义。对齐用 `getBoundingRect()` 以画布（=刀版）为基准，层级用 `canvas.getObjects()` 索引 + `moveObjectTo`（**Fabric v7 对象上已无 bringToFront/sendBackwards**）；滑块连续改值走 `scheduleRecord` 350ms 合并历史，离散操作（对齐/层级）直接 `record`。历史指针已从 ref 改为 state（同时消掉两处 react-hooks/refs 报错，design 目录 eslint 0 错 0 警）。
- **Fabric v6/7 默认 `originX/originY=center`**：new Textbox/Image 若不显式声明左上角基准，left/top 会被当中心点→新对象左半跑出刀版（已修，addText/addImage 均显式定基准并算居中）。
- **印前自检 Pre-flight**（`src/components/design/PreflightPanel.tsx` + 引擎 `runPreflight/selectObject`）：三条几何规则均在**未缩放的场景坐标**上算（所以 UI 缩放不影响判定，实测 156% 与 100% 条目逐字相同）——超出出血框=error、跟裁切线相交且未铺满成品线=warning（被裁）、文字出安全区=warning；同一对象只报一条（error 优先早返）。触发时机：`record()` 内（涵盖增删改+滑块防抖）、载入/导出/撤销还原后主动重跑（`restoring` 期间 object:added 被抑制，不补跑会漏）。点列表行会选中该对象并把中心滚到工作区中间；注意：中只在**刀版内但因放大出视口**时有效，完全拖到刀版外的对象无法滚达（只能选中+联动属性面板）。已实测：warning/error/安全区三类均正例命中、Delete→条目 0→Undo→条目恢复、改字号后 350ms 自动刷新。
- **模板预置内容必须按各自 safeAreaMm 内缩**：seed 早期统一用 left/top=24px（=3mm），而 Round Sticker(safe 4mm)/Business Card(4)/Hang Tag(4)/Mailer Box(6) 的安全区更大 → 编辑器一打开就被 Pre-flight 判为“文字贴裁切线”，面板并失信任度。现 `prisma/seed-templates.mjs` 的 `scene(label, safeAreaMm)` 按 `safeAreaMm * PX_PER_MM + 8` 内缩（重跑 seed 后 5/5 模板开局全绿）。改完记得 `node prisma/seed-templates.mjs`（按 slug upsert 幂等）。
- **画布文档级缩放**（工具条 `− % + Fit 100%`，另支持 Ctrl/⌘+滚轮（含触控板捏合）以指针为锚点缩放、普通滚轮=外层滚动条平移）：用 `canvas.setZoom(z)` + `setDimensions(base*z)` 实现，**场景坐标与 sceneJson 完全不变**；`ZOOM_MIN=0.2 / ZOOM_MAX=4`。导出用 `withFlatViewport()` 先把尺寸/viewportTransform 拍回 1:1 再取 SVG/PNG（实测 195% 与 100% 两次导出内容 byte 级一致：SVG 根节点恒为 `width="100mm" height="50mm" viewBox="0 0 800 400"`，PNG 恒为 1600×800）；缩放不入历史栈（实测 5 次缩放不占任何 undo 槽）；出血/安全区 overlay 的 mm→px 必须乘当前 zoom；工作区用 `min-h-full min-w-full` + `m-auto` 安全居中（避开 flex 居中溢出时左上角不可达）；大模板首次 ready 自动 Fit（200×150mm → 60%，整张含出血无需滚动）。
- **三个 Fabric v7 血泪坑（本轮实测发现，改设计器必读）**：
  1. `set({ scale })` **无效**！`scale` 是原型方法，会被数字遮蔽且不进 toObject → 大图 1:1 溢到刀版外。必须写 `scaleX/scaleY`。
  2. 默认 `originX/originY=center` → 不显式声明左上角基准的话 left/top 被当中心点，新对象左半跑出刀版。
  3. 对象落点/尺寸计算必须用**未缩放的场景尺寸**（baseW/baseH），绝对不能用 `c.getWidth()/getHeight()` —— 它包含 zoom，放大状态下新建对象会落到刀版外（已修，实测 195%/100% 两次落点场景坐标逐位相同）。
- **Tailwind 按钮激活态不得叠加同优先级冲突类**（bg-white + bg-neutral-900 会白底白字看不见图标），已拆成 base/off/on 互斥组合。
- **我的设计**：`/account/designs`（userId OR email 归属查询，模板尺寸批查，卡片回链编辑器）；账户侧栏入口（en/zh key）。
- **后台看稿**：admin/orders 订单卡片「查看设计稿」深链（批量解析 `UserDesign.productType` 构造 `/design/[type]?design=id`）。

## 4. 数据库与迁移状态（✅ 漂移已全部收尾，2026-10-09）

- 正式 migrations 共 **12 个**，`prisma migrate status` = `Database schema is up to date!`。
- 本期新增两个收尾迁移（内容均为现网已存在的结构，用 `migrate resolve --applied` 登记，**不要**再 deploy 到现网）：
  - `20261008120000_design_soft_ref_fields`：`Quote.designId` + `UserDesign.productType`（原走 db push 的两个软引用字段）。
  - `20261008130000_configurator_and_fk_catchup`：影子库校验时**额外查出的大漂移** —— 配置器三张表 `AttributeGroup`/`AttributeOption`/`DependencyRule` 当年完全没有任何迁移记录，且 `Artwork.userId`/`Order.userId`/`Order.addressId` 外键 init 里是 RESTRICT、现网已是 SET NULL，一并补齐。
- **双向校验都已通过**：① 现网库 ↔ schema：`migrate diff --from-url <DIRECT_URL> --to-schema-datamodel` = No difference；② migrations 重放 ↔ schema：影子库 `migrate diff --from-migrations --shadow-database-url` = No difference（→ 全新库跑 `migrate deploy` 能还原出现在的结构）。以后每次改 schema 都建议跑一遍②。
- **血泪教训仍成立**：Neon 库结构即时生效而部署滞后 → 旧 client SELECT 新列会 500（读库路由全挂，不读库的没事）。
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
9. **影子库校验迁移基线（本期新增的可靠招）**：`.env` 的值**带双引号**，脚本里必须剥掉引号，否则 Prisma 报 P1013；连接串含 `&`，走 `npx`（cmd 转发）会被截断成 P1000 认证失败 → 用 `execFileSync(process.execPath, ['node_modules/prisma/build/index.js', ...])` 传参绕开 shell；Neon 可 `CREATE DATABASE pp_shadow_check;`（`prisma db execute --stdin`）当影子库，用完 `DROP DATABASE`。任何失败信息里会连带打印完整连接串（**含密码**）→ 输出前先脱敏。
10. **Node 里跑 ag-psd**：读写像素要先 `initializeCanvas(createCanvas)`，本机没 node-canvas（Windows 装它要预编译二进制）→ spike 用全透明假 canvas 只验元数据链路；`writePsd` 返 **ArrayBuffer**（用 `.byteLength`，不是 `.length`）；读真实文件用 `readPsd(buf, { useImageData: false })` 可避开 canvas。PowerShell 下 `[locale]` 路径要走 Read 工具或 -LiteralPath，`Get-Content` 会把方括号当通配。

## 6. 待办（按优先级，用户认可「设计器要做到值得付费」的方向）

> 2026-10-09 已清：首页 Design Studio 入口、迁移漂移收尾、**编辑器对象属性面板**、**后台模板刀版 SVG 拖拽上传**、**画布缩放/平移**、**印前自检出血校验**（后两项含用户临时提出的需求，均 Browser 实测通过，见 §3）、原「正文 i18n 化」（按 §1 语言策略统一英文即可）。另 `page.tsx` 的 `SectionHead` 去掉了遗留 `as any`。

| # | 项 | 说明 | 难度 |
|---|---|---|---|
| 1 | 导出成品入 R2（`UserDesign.exportKey/thumbKey` 已留） | **阻塞：`.env` 里 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY 全为空**（只 R2_BUCKET 有值），`r2Enabled()`=false。需先去 Cloudflare 建桶 + 建 R2 API Token | 中 |
| 2 | CMYK 色彩路线选型（**待定，未开工**） | 真转色需 ICC profile（coated/uncoated FOGRA、GRACoL），浏览器里拿不到 profile 时做 naive RGB→CMYK 属于伪科学，会误导印厂。候选：a) 只做色域告警（列出 CMYK 难还原的高饱和 RGB 色）；b) 导出时保留 RGB 并在订单里附“由印厂 RIP 转色”说明；c) 服务端接 ICC 库真转 | 选 a/c 易～难 |
| 3 | 属性面板二期：锁定/分组/等比缩放链/多对象对齐 | 一期已上颜色字号层级对齐 | 中 |
| 4 | 文字转曲导出（outlines） | PDF 提示已有；真转曲需字体解析 | 难 |
| 5 | 移动端登录态横向溢出 | 390px 下 SiteNav 右侧组（My Account + Sign out）撑出 scrollWidth>clientWidth | 易 |
| 6 | 遗留 lint 债清理 | `npx eslint src` 仍有 22 个历史 `no-explicit-any`（admin/products/account 列表页）+ ProductEditor 三个未使用组件（SpecForm/SpecAddForm/specs） | 易 |
| 7 | 测试数据清理 | UserDesign 残留 E2E-Save-Test-Label / Untitled design×N / **QA-Props-Panel-Test**（id `cmv07mmz00000ns2cn748nz4l`）+ PPMUW… 测试订单（本轮测试的两个模板 qa-dieline-test / qa-dieline-reset 已删净） | 易 |
| 8 | PSD 批量导入 P1+ | 见 §6A：P0 spike 已跑完，卡在“需要真实 PSD 文件 + 5 个未决问题”；P1 还要 DesignTemplate 加 slots/sourceKey/dpi 与列表分页改造 | 中大 |

## 6A. PSD 批量导入（新需求：P0 Spike 已跑完，等真实文件才能定 P1）

需求：几百上千个 PSD（名片/贴纸/吊牌…）→ 自动变成云端可二次编辑的模板。**产品形态已定：背景锁定 + 少量命名槽位**（Printful/Canva 式），不是全图层可编辑。

- 契约与验证：`src/lib/psd-template.ts`（纯函数，不依赖 ag-psd、不碰像素）+ `scripts/psd-spike.mjs`（19 项断言全绿，`node scripts/psd-spike.mjs a.psd` 可直接跑真实文件）。
- **图层命名规范（没这套规范自动化必翻车）**：`__text:key__` 文字槽位 / `__slot:key__` 图片槽位 / `__dieline__` / `__bleed__`（含出血外扩矩形）/ `__safe__`（安全区内缩矩形）；其余图层归背景。画布尺寸 = 成品（trim）尺寸，文字层不开图层样式。
- **Spike 查出的两条硬约束**：
  1. **PSD 图层包围盒依附像素**：空图层读回来 `right===left`、`bottom===top`。所以标记层必须有实体像素（哪怕 1px 占位矩形）；映射器现在对退化几何直接报 `layer-no-geometry` error 并停止上架（以前会静默算出 bleed=0mm / safe=27mm 这种看起正常的错值）。
  2. **mm 只能反算**：像素是整数，1063px@300dpi=90.002mm → 映射器统一吸到 0.5mm（`snapMm`），模板尺寸以吸附后的标准规格入库。
- 已覆盖的映射：pt→场景px（1pt=2.822px）、`{r,g,b}`→hex、段落对齐、未托管字体→强制回退 Arial 并报警、隐藏层跳过、零槽位=死图不可发布、文字带图层样式=不可发布。
- **还没验证（必须拿设计产线的真实 PSD）**：Photoshop 存的引擎数据/智能对象/矢量蒙版/CMYK/专色承刀版；以及背景合成图切片（需 worker：带 canvas 的 Node / headless Chrome / Python psd-tools）。
- **未决问题（阻塞 P1 开工）**：① PSD 由谁产、能否定规范；② 客户要改什么（只文字+logo？有无产品实拍图）；③ 字体策略（只用托管集 / 买授权子集化 / 允许上传）；④ 模板页要不要做 SEO；⑤ 先内部上架还是公开市场。
- **语义缺口（开工前必须定）**：当前设计器画布尺寸=trim，而带出血的 PSD 背景比 trim 大；Fabric 导出只覆盖画布本身 → 要么把导出改成覆盖含出血的矩形，要么让 PSD 画布=trim 并接受“背景无出血”。选错会导致印厂拒收。

## 7. 关键文件速查

- 设计器：`src/components/design/{useFabricCanvas,DesignCanvas,DesignStudio}.tsx` · `src/features/design/actions.ts` · `src/app/[locale]/design/{page,[productType]/page}.tsx` · `src/app/[locale]/account/designs/page.tsx`
- 桥接：`src/components/quote/{ProductConfigurator,QuoteForm}.tsx`（localStorage `pp_order_design`）· `src/features/{order,quote}/actions.ts`（designId 落库）
- 导航：`src/components/site/SiteNav.tsx`（悬停区模型+mega menu）· `src/lib/megaMenu.ts`（NavGroup 数据）
- 后台：`src/components/admin/{TemplateEditor,PostEditor,VideoEditor,OrderReviewPanel}.tsx` · `src/features/admin/actions.ts` · `src/app/[locale]/admin/{templates,blog,videos,orders}/page.tsx`
- 计价引擎：`src/lib/config-engine.ts` · 订单领域：`src/lib/orders.ts`
- schema：`prisma/schema.prisma`（Order.designId L277、Quote.designId、DesignTemplate/UserDesign L~360-400、Post/Video）
- 首页：`src/app/[locale]/page.tsx`（各段都是本文件内的展示型函数；新横幅 `DesignStudioBand` 在 `Categories` 后）· 文案 `messages/en.json`
- 色彩：`src/lib/color-gamut.ts`（sRGB→Lab + CMYK 色域近似上限，**只预警不换算**）
- PSD 导入 spike：`src/lib/psd-template.ts`（纯映射契约）· `scripts/psd-spike.mjs`（自检 + 跑真实 PSD）· 详见 §6b

## 8. 提交链（origin/main 已同步）

2026-10-09 本轮已提交并 push（按功能分组，每个都单独可回滚）：

| commit | 内容 |
|---|---|
| `dcb760d` | `fix(db)` 两个漂移迁移（配置器三表 + 外键 SET NULL + 两个软引用字段） |
| `ce3b617` | `feat(home)` 首页 Design Studio 横幅 + `DesignStudio` 英文文案 |
| `4b035d5` | `feat(design-studio)` 对象属性面板 + 画布缩放/平移 + 印前自检（含 CMYK 色域预警）+ 种子预置文字按安全区内缩 |
| `5709fbb` | `feat(admin)` 刀版 SVG 拖拽上传/预览/校验（DielineField） |
| `5385d94` | `fix(auth)` register 页 `useTranslations` 移入同步子组件（**早前会话遗留未提交**，非本期改动） |
| docs | 本文 + `.gitignore`（排除 `verify-*` 验收产物） |

历史：`3e56f5d` HANDOFF 文档 · `4614eed` 矢量导出 SVG+PDF · `26236e7` M3 刀版/出血 overlay · `d049008` 我的设计+后台看稿链+productType 持久化 · `ba152ba` 专家报价路径 · `e0b5bdf` M2a 设计→下单桥 · `14e4603` 画布放大+满宽 · `9f6edee` 前台文案英文化 · `025d4ce` M1b 作品入库 · `ab40b9e` 模板系统+后台CRUD+宽度 · `6f26735` mega menu 修复+设计入口 · `aff24c4` B端化+SEO+M0/M1。
