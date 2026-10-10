# 项目交接记忆（HANDOFF）

> 更新：2026-10-09 · 分支 `main` @ `5385d94` 再加本文所在的 docs 提交（全部已 push 到 origin，GitHub: zzydhj/propackcustom.com）
> **新会话续接方法：打开本目录 → 让 AI 读完本文件 → 说「按 HANDOFF 继续，做第 N 项」。**

## 1. 项目是什么

B2B 定制包装/印刷站（面向海外采购商，**只做英文**；next-intl 框架保留但 `locales` 只开放 `en`，`messages/` 里其余 6 个语言包暂不启用也不删）。
**定位**：后台=内部销售的中文工具；前台=海外 B 端采购。个人用户看不懂是预期行为。
**定位（2026-10-09 用户选定）**：① **包装/标签厂的接单工具** —— 模板是转化道具（200 个精品 + 免费设计服务），不做稿定/Canva 式海量模板站。客户要的是“你帮我把东西做对”。
**语言策略（2026-10-09 定，同日收紧）**：
- 新文案**只写 `messages/en.json`**；缺失 key 由 `request.ts` 的 deepMerge 自动回退英文。不要再花时间补翻译。
- **URL 不带语言前缀**：`routing.ts` 里 `locales:['en']` + `localePrefix:'as-needed'` + **`localeDetection:false`**。最后一条是关键：默认行为会按 `Accept-Language`/`NEXT_LOCALE` cookie 把 `/design` 跳到 `/zh/design`（实测中文浏览器必现），关掉后不带前缀永远服务英文。
- 旧前缀链接由 `src/proxy.ts` **301** 到无前缀地址（`/zh/design?q=x` → `/design?q=x`）；`LocaleSwitcher` 在 `locales.length < 2` 时自动渲染 null，加回语言时自动出现。

技术栈：Next.js 16.3.5（App Router/Turbopack/Server Actions）· React 19 · Prisma 6.19 + **Neon PostgreSQL** · next-intl（**单语 en**，`localePrefix:'as-needed'` + `localeDetection:false`）· NextAuth · Tailwind v4 · **Fabric.js 7.4**（自研设计器引擎）· R2（未配置）· Resend（未配置实发）· Stripe（未配 key，降级 T/T）。devDependency 里的 **ag-psd** 只服务于 PSD 导入 spike（`scripts/psd-spike.mjs`），应用运行时不引用。

## 2. 功能全景（全部已实测通过）

**前台**：产品列表/详情（配置器即时算价+阶梯折扣+附加费+父子选项树）· RFQ 报价 `/quote` · 免登录订单 `/order/[token]`（人工对接：SUBMITTED 锁价72h → 销售确认 → AWAITING_PAYMENT → 付款）· 钱包余额支付 · blog/videos SEO 模块（JSON-LD/sitemap/robots）· **Design Studio 在线设计**（详见 §3）· **快速定制页 `/customize/[templateSlug]`**（详见 §3A）· mega menu（左分类列+右产品图网格，悬停区模型）· **首页 Design Studio 深色转化横幅**（`page.tsx` 的 `DesignStudioBand`+`DesignStudioMock`，命名空间 `DesignStudio`，纯 CSS 示意不查库，保持首页静态可渲染）。

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
- **图层列表 LayerList**（`src/components/design/LayerList.tsx`，只管名字/显隐/锁定/叠放次序，属性面板继续只管外观，两边不重叠）：引擎新增 `layers/activeIndex/patchLayer/selectLayer/moveLayer/removeLayer`。锁定是**双通道推导**（`lockEditing || o.locked`）并同时设 `selectable/evented/lockMovement*/lockScaling*/lockRotation`（只设 selectable 不够，键盘与手柄仍能动）；改名用非受控 input + 失焦才提交（不进无谓历史），且名字会联动 Pre-flight 文案。多选时面板只给对齐（ActiveSelection 整体移动有意义，层级/外观无意义）。缩放强制等比：`uniformScaling:true, uniScaleKey:null`（v7 里 `uniScaleKey:''` 类型不对，要 null）。
- **导出/序列化三个必踩的坑（本轮实测发现）**：
  1. **v7 的 `canvas.toJSON()` 不收参数**（官方注释“不支持附加属性”），自定义字段（name/locked）必须用 `canvas.toObject(['name','locked'])`；且历史快照、resetHistory、exportJSON 三处都要用同一个包含列表，否则 save/undo 会静默丢字段。
  2. **`c.remove(o)` 会同步触发 `object:removed` → 已经 `record()` 了**，封装的删除入口（removeActive/removeObject/removeLayer）再记一次就变成两条相同快照，删一个对象要按两次 Undo。
  3. **`toSVG()` 不跳过 `visible:false` 对象**，只写 `style="visibility: hidden"` → 客户“删掉”的内容仍会出现在交给印厂的矢量文件里。现在 `withExportScene()` 导出前暂时摘掉隐藏对象、按原索引放回（包在 `restoring` 里，不产生历史、不打乱 z-order，已实测逐位一致）。
- **我的设计**：`/account/designs`（userId OR email 归属查询，模板尺寸批查，卡片回链编辑器）；账户侧栏入口（en/zh key）。
- **后台看稿**：admin/orders 订单卡片「查看设计稿」深链（批量解析 `UserDesign.productType` 构造 `/design/[type]?design=id`）。

## 3A. 快速定制页（引导式编辑，PSD 批量导入的同一条槽位模型）

`/customize/[templateSlug]`（服务端页，每模板一个可分享 URL + metadata）→ `GuidedStudio`（dynamic ssr:false 容器）→ `GuidedWorkspace`（表单+预览）。与全屏编辑器共用同一个 `useFabricCanvas`，差别只在 `lockEditing: true`。

- **字段从哪来**：引擎 `fields` 把顶层对象映成可填字段（Textbox→文字输入框，FabricImage→logo 替换/移除）。没改 schema、没写 slot 定义也能跑；将来 PSD 导入产出 `slots` 后直接接管同一个入口。
- **锁定语义**（`lockEditing`）：`canvas.selection=false` + 每个对象 `selectable/evented=false` + **`discardActiveObject()`**（否则 `addImage` 会把新图设为 active，客户看到一圈蓝色手柄却拖不动，比不显示更困惑）；`addText/addImage` 在锁定时不再 `setActiveObject`。实测 upper-canvas 非透明像素 0 = 真没选中框。
- **共享件抽取**（避免与 DesignCanvas 冗余）：`GuideOverlay.tsx`（刀版/出血/安全区，两处共用，mm→px 乘 zoom）、`useDesignSave.ts`（命名/保存/状态行；返回 `setStatus` 给导出 PDF 写进度）。
- **出单桥**：两个 CTA 先 `save()` 再写 localStorage `pp_order_design` → `/quote`（详情页直接消费）或 `/products`。**遗留缺陷已接住**：列表页不消费桥 → 新增 `src/components/product/DesignPendingHint.tsx`（黄色条 “Your design is ready…” + Discard design），用 `useSyncExternalStore`（getServerSnapshot 返回 null）而非 effect setState，SSR/客户端无 hydration 差异。
- 实测：字段输入→画布同步且光标不跳、锁定下无法选中/拖动（对象坐标不变）、替换 logo 保持原矩形 footprint不撑破、`/products` 5 张卡仍正常、Console 0 error。

## 4. 数据库与迁移状态（✅ 漂移已全部收尾，2026-10-09）

- 正式 migrations 共 **15 个**，`prisma migrate status` = `Database schema is up to date!`。本期新增两个收尾迁移（内容均为现网已存在的结构，用 `migrate resolve --applied` 登记，**不要**再 deploy 到现网）：
  - `20261008120000_design_soft_ref_fields`：`Quote.designId` + `UserDesign.productType`（原走 db push 的两个软引用字段）。
  - `20261008130000_configurator_and_fk_catchup`：影子库校验时**额外查出的大漂移** —— 配置器三张表 `AttributeGroup`/`AttributeOption`/`DependencyRule` 当年完全没有任何迁移记录，且 `Artwork.userId`/`Order.userId`/`Order.addressId` 外键 init 里是 RESTRICT、现网已是 SET NULL，一并补齐。
- **双向校验都已通过**：① 现网库 ↔ schema：`migrate diff --from-url <DIRECT_URL> --to-schema-datamodel` = No difference；② migrations 重放 ↔ schema：影子库 `migrate diff --from-migrations --shadow-database-url` = No difference（→ 全新库跑 `migrate deploy` 能还原出现在的结构）。以后每次改 schema 都建议跑一遍②。
- **血泪教训仍成立**：Neon 库结构即时生效而部署滞后 → 旧 client SELECT 新列会 500（读库路由全挂，不读库的没事）。
- 测试数据：✅ 2026-10-09 已清 —— 15 条 UserDesign（E2E-Save-Test-Label / Untitled design×N / QA-Props-Panel-Test / 本轮各回归页留下的 “… custom”）全部删除，且删除前已确认**无一条被订单/报价引用**；4 条订单（PPMUW…）与 1 条报价属演示/业务数据，**未动**，要清需人工确认。工具：`node scripts/cleanup-test-data.mjs`（默认 dry-run，加 `--apply` 真删；删前会把 Order/Quote 的 designId 置空）。
- 模型新增：`Post`/`Video`（PublishStatus）· `DesignTemplate`/`UserDesign`（DesignStatus）· `Order.designId` · `Quote.designId`。
- **2026-10-09 模板库规模改造**（走正规 `migrate dev`，不是 resolve，新库 deploy 会真跑）：
  - `20261009132421_template_library_scale`：`DesignTemplate` 加 `slots`/`sourceKey`/`sourceHash`/`widthPx`/`heightPx`/`dpi`/`tags`。
  - `20261009142441_template_scale_indexes`：索引换成 `(active, productType, sort, createdAt)` + `(active, sort, createdAt)`（**排序字段必须进索引**，否则全类型翻页走 Seq Scan + Sort，实测过）。
  - `20261010043011_template_full_bleed`：`DesignTemplate.fullBleed`（默认 false，空白框架模板不该一打开就被警告；生成的 200 个内容模板为 true）。

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
11. **设计作品桥（`src/lib/design-bridge.ts`）两个必知坑**：
  - 绝不能在挂载时 `removeItem`：与 `useSyncExternalStore` 的挂载后快照复核冲突（值被清→快照变→重渲染→hidden designId 约 10ms 后被卸掉），实测导致 **designId 根本提交不出去**（报价/下单都静默丢作品）。现在语义：写覆盖 + 显式清除（表单上 "Attaching your saved design #xxxx" + don’t attach，列表页黄条 + Discard）。
  - **同标签页 `setItem/removeItem` 不触发 `storage` 事件**（HTML5 语义），所以 `saveDesignBridge/clearDesignBridge` 必须自己 `dispatchEvent(new Event('pp-design-bridge-changed'))`，`subscribeBridge` 同时监听两个事件；否则点了“不挂/丢弃”但 FormData 里仍带着旧 designId 提交。
12. **`DIRECT_URL`（Neon 直连端点）从本机可能不可达**（migrate 一直 P1001，而池化端点 `DATABASE_URL` 正常）→ 跑迁移前在当前 shell 里临时覆盖：`$env:DIRECT_URL = (((Get-Content .env | Select-String -Pattern '^DATABASE_URL=').Line -replace '^DATABASE_URL=','') -replace '"','')`（不回显凭证）。进程环境变量优先于 `.env`，Prisma 会用它。
13. **沙箱 PowerShell 里 `localhost` 请求会失败**（curl 与 `Invoke-WebRequest` 都拿到空状态）→ 一律用 **`http://127.0.0.1:3000`**。另外后台终端会被回收，`Invoke-WebRequest` 全挂时先确认 dev server 还在跑。
14. **批量灌数据后要 `ANALYZE "DesignTemplate"`**：统计信息是旧的，planner 会估错行数选错计划（实测同一个查询：ANALYZE 前 Seq Scan + Sort，ANALYZE 后 Index Scan + Limit）。将来的导入器末尾要补一步 ANALYZE。
15. **右侧浮动工具栏 `FloatingHelp`（`fixed right-0 z-40 w-16`）会盖住页面右缘控件**：实测 1167px 宽下，一个靠右的提交按钮被它盖住，点下去跳到 `/quote`。新控件不要靠右缘放（或者给容器留 64px 右栏）。
16. **中间件里拼重定向地址不要手拼字符串**：`new URL(`/${rest}${search}`, req.url)` 在 `rest` 已以 `/` 开头时得 `//design?q=x`，被当成**协议相对 URL** → 跳到 `http://design/`（实测踩过，很隐讳）。正确写法：`new URL(rest === '' ? '/' : rest, req.url)` 再 `target.search = search`。
17. **客户可见的联系方式只认 `NEXT_PUBLIC_SALES_EMAIL`**（`src/lib/contact.ts`）：必须用公开变量，因为卡片会出现在 `ssr:false` 的客户端树里，普通 `SALES_EMAIL` 进不了客户端 bundle（永远是 undefined）；而且 no-reply/noreply/postmaster/abuse 这类地址会被过滤成 undefined → **入口直接隐藏**。三态已实测：真邮箱→出 mailto、no-reply→隐藏、不配→隐藏。不要把 `EMAIL_FROM`（当前是 no-reply@）挂到转化卡片上。
18. **报价表单的来意走 `src/lib/quote-intent.ts` 白名单**：卡片 CTA = `/quote?intent=design-help`，报价页解析后渲染顶部说明 + 预填 `notes`（QuoteForm 新增 `intent` 可选 prop）。只认白名单，用户手改的任意值不灌进表单（实测 `?intent=<script>` 无 banner 无预填）。
19. **跑写库脚本前先停 dev server**：Neon 连接数会被跑着的 dev server 占满，脚本开新连接直接 P1001（症状：页面能开、脚本连不上）。`Get-Process node | Stop-Process -Force` → 跑脚本 → 重启 dev。冷启动 P1001 另需等 15–30s 重试。
20. **内置浏览器视图在后台时，`ssr:false` 的页面永远不水合**（`document.hidden=true` → rAF 不触发 → React 不 hydrate），截图也全失败。设计器/引导页这类客户端页面要实测，必须先确认该视图在前台；否则只能验 SSR 页。
21. **想在 Node 里复用应用内的 TS 纯函数**（避免脚本里另写一份规则造成偏差）：`node --experimental-strip-types scripts/x.mts` + `import ... from '../src/lib/y.ts'`；tsconfig 已开 `allowImportingTsExtensions`（靠 `noEmit` 才合法）。生成器已改成这样跑（**必须带这个 flag**）。
22. **从刀版 SVG 解析形状时，小圆会抢走“裁切线”的位置**：吊带的打孔圆（r=1.8mm）曾被当成刀版，导致整张所有对象都被报“超出出血”。现在只有直径 ≥ min(宽,高)×0.85 的圆才算裁切轮廓（`parseDieShape`）。
23. **圆形对象不能用外接矩形做包含判定**：圆的外接框四角永远比圆大，一个刚好铺满出血的背景圆会被判“超出出血”→ 圆模板永久报红。`dieline.ts` 的 `DieObject` 允许对象附带真实圆，两个判定口径（引擎/脚本）共用。
24. **R2 已接通（2026-10-10 实测）**：`r2Enabled()=true`，PUT 200 → HEAD → 预签名 GET 内容一致 → **公共域名 `https://file.propackcustom.com/...` 直接 200 可访问** → DELETE 204 后 HEAD NotFound。坑：**`R2_BUCKET` 原本写的是 `propack-artworks`，而令牌只授权 `propackcustom` → 写入 403 AccessDenied**；令牌是桶作用域的，ListBuckets 也会 AccessDenied（这不代表凭证错）。中文对象键安全（SDK 会 percent-encode）。
25. **桶内目录必须按 `objectKey()` 的规范走**（用户明确要求不得混乱）：`uploads/{artwork,proofs}/<yyyy>/<mm>/<dd>-<rand>-<原名>`（上传类按月分片）、`exports/designs/<designId>/`、`production/orders/<orderNo>/`（产物类按实体归组）、`templates/source/<yyyy>/<mm>/<sha12>-<原名>`、`templates/preview/<slug>.<ext>`（稳定键可覆盖）、`tmp/`（建议配 7 天生命周期规则）。新增用途就改 `LAYOUT` 一处。
26. **R2 公共域名 `file.propackcustom.com` 目前不带 CORS 头**（实测：GET 无 `access-control-allow-origin`，预检 OPTIONS 直接 403）→ **不能把 R2 直链丢进 Fabric 画布**：带 `crossOrigin` 会加载失败，不带则画布被污染，`toDataURL()`/导出直接 SecurityError。所以“大图不进 sceneJson”这个优化必须走**同源代理**（或者你在 Cloudflare 给桶加一条 CORS 规则，加完就可以直链 + 吃 CDN）。
27. **用户报“UI 点了/悬停没反应”时，先看 dev server 终端有没有编译错误**。实测踩过：我改 SiteNav 改到一半留了个多余 `)}` → Turbopack 编译失败 → `/products` 返 500 → 浏览器拿到坏 bundle → **整页失去水合**，表现就是“所有 JS 交互都死了但页面看得到”。修好后**那个标签页仍挂着死 bundle，必须硬刷新**。判别技巧：纯 CSS 的 hover 效果还在、靠 state 的效果不动 → 就是没水合。
28. **Mega Menu 全部交互零 JS**（悬停弹面板 + 左列切右列 + 定高）。实现要点（踩过三次才稳定）：
   - 面板放在**自己分类的 li 里**，绝对定位投送到右列。放右列不行：鼠标穿过列间隙时没 li 被 hover → 面板跳回第一块；li 后代关系才能保持 hover。
   - **li 绝对不能再带 `relative`**：那样面板就以 220px 宽的 li 为基准算 `left:calc(pad+220px)` + `right:pad` → **负宽度 → 面板被压成 0 宽**，表现为“高亮在、右列整片空白”（实测踩过）。定位基准必须是 `.mega-grid`（它带 relative）。
   - 菜单项间隙走 **li 自己的 padding**，不用 `space-y-1` 外边距 —— 外边距会造出不属于任何 li 的空域，鼠标经过时静止态闪一下（用户报的“内容跳”）。
   - 面板定高 `min(600px, calc(100vh-104px))`；`.mega-default` 是静止态，被 `.mega-grid:has(.mega-cat:hover)` 收掉。位置用 CSS 变量 `--mega-pad/--mega-left-w/--mega-gap` 与 `container-site` 内边距同步，不手调像素。
   - 代价：11 块面板都在 DOM 里 → 首页 HTML raw 217KB / **gzip 25.9KB**（重复结构压得动）。实测几何：面板统一 x=240/y=108/w=1050/h=536，与静止态内容起点 x=272 对齐，切换不横移。
29. **Tailwind v4 的 `scale-*` 走独立 `scale` 属性，不是 `transform`** —— 用 `getComputedStyle(el).transform` 验证放大效果永远得到 `none`，会误判成“没生效”。要读 `computed.scale`（实测 1 → 1.04，元素 100.77px → 104.80px）。另：`NAV_CATALOG`（`src/lib/megaMenu.ts`）**没有任何 image 字段**，所以产品方块走的是字母占位分支 —— 想把 `scale` 类挂在 `<img>` 上是无效的（该分支从不渲染，这就是“放大效果丢了”的真相）。
30. **自动化测试时：浏览器窗口不可见（`document.hidden`）就发不进真指针事件**，`hover`/`click`/`take_screenshot` 全部失败。但**纯 CSS 的几何可以量**：强制 `display:block` 后的 layout box 与真 hover 完全一致，再配合 `elementFromPoint` 做命中测试，足以验证定位与 hover 连续性。
31. **在 Node 里跑 pdf.js 必须给 `cMapUrl` + `cMapPacked:true` + `standardFontDataUrl`**（指向 `node_modules/pdfjs-dist/cmaps|standard_fonts` 的绝对路径）。不给的话 CJK 子集字体直接解不出来：实测 **牙签旗.ai 从 `TEXT runs=0` 变成 3 条**（其中一条就是“黑色为刀模线”），眼镜标.ai 28 条中文全可读。v6.4 **没有** `NodeCMapReaderFactory`（不用去找它），传路径就够了。
32. **pdf.js `constructPath` 给的是 user space 坐标，没乘 CTM** —— spike 现在报的路径包围盒不可直接当页面坐标用（牙签旗 A4 竖版 210mm 宽上出现跳 297mm 的 x）。P1 做刀版提取时必须自己累加 `transform` 算子的矩阵（或者改用 `page.getViewport()` 换算）。另外 **页面尺寸异常要拦**：一粒麦子.ai 的 TrimBox 是 2265.89×2265.89mm（≈2.27m），典型的 10:1 放大画稿，不能直接当成品尺寸入库。

## 6. 待办（按优先级，用户认可「设计器要做到值得付费」的方向）

> 2026-10-09 已清：首页 Design Studio 入口、迁移漂移收尾、**编辑器对象属性面板**、**后台模板刀版 SVG 拖拽上传**、**画布缩放/平移**、**印前自检出血校验**、**快速定制页**、**移动端导航+横向溢出**、**全仓 eslint 债**（原待办表 5/6 两项；后几项含用户临时提出的需求，均 Browser 实测通过）。`npx eslint src --max-warnings 0` 首次 **0 问题**（以前 22 错 5 警）。

| # | 项 | 说明 | 难度 |
|---|---|---|---|
| 1 | 导出成品入 R2（`UserDesign.exportKey/thumbKey` 已留） | ✅ **R2 本身已接通并实测**（不再是阻塞项）；但“导出成品落桶”这个功能本身还没做（写入路径+键已备好：`exports/designs/<designId>/`） | 中 |
| 2 | CMYK 色彩路线 | ✅ 已按 a) 做完：`src/lib/color-gamut.ts` 只做色域预警（sRGB→Lab + 涂布四色上限曲线，**不做任何通道换算**）；b)/c)（附印厂 RIP 说明 / 服务端 ICC 真转）仍未做 | — |
| 3 | 属性面板二期：锁定/显隐/图层列表/多选对齐/等比缩放 | ✅ 已完成（含改名联动 Pre-flight、name/locked 持久化、隐藏对象不进导出 SVG）；剩下：分组(group)、对象重名时无后缀区分 | 一期已完 |
| 4 | 文字转曲导出（outlines） | PDF 提示已有；真转曲需字体解析 | 难 |
| 5 | 移动端登录态横向溢出 | ✅ 已修：390px 两态 scrollWidth==clientWidth；顺手补了移动端汉堡菜单（之前 lg 以下根本没有导航）并把搜索框提到 xl，1024/1167/1280 均无溢出 | — |
| 6 | 遗留 lint 债清理 | ✅ 已清：多语言 Json 统一走 `src/lib/locale-text.ts`；删掉旧 Spec 表单死代码；桥收进 `src/lib/design-bridge.ts`；`react-hooks` 三类错误全部消除 | — |
| 7 | 测试数据清理 | ✅ 已清：15 条测试 UserDesign 已删（脚本 `scripts/cleanup-test-data.mjs`，默认 dry-run）；4 订单+1 报价保留未动，要删需你确认 | — |
| 8 | PSD/AI 批量导入 P1+ | 见 §6A：P0 spike 已跑完，卡在“需要真实源文件 + 5 个未决问题”；**它的前置（表字段 + 分页列表）已清掉**，剩下的是解析器 + 导入作业 + 审核台 | 中大 |
| 9 | 模板库 10 万级规模改造 | ✅ 已完成（2026-10-09）：字段 + 索引 + 查询层（分页/facet/去重 slug/内容指纹）+ 后台表格化（一行一表单→零个常驻表单）+ 前台分页搜索；20k 行实测执行计划已校正 | — |
| 10 | 内容模板库（定位①的“有东西可逛”） | ✅ 第一批已入库：`scripts/generate-templates.mjs` 生成 **200 个**自有版权可编辑模板（版式骨架×配色×图案×字体），库内共 205；卡片预览改成服务端编译 SVG（`src/lib/scene-svg.ts`，不依赖 R2） | — |
| 11 | 模板库发现体验补齐 | 待做：色系/风格/行业 facet（tags 已写，查询层还没按它筛）、Most Popular/Newest 排序、模板详情页（Avery 那种）、收藏/More like this | 中 |
| 12 | 刀版三件套（印刷正确性） | ✅ 已完成（2026-10-10）：① 预检按 `dielineSvg` 解析出的**真实形状**判定（圆刀按安全圆/出血圆，不再用矩形包围盒）② `fullBleed` 满版检查（没东西盖住成品线→“会露白底”）③ 生产交付：SVG 拆 `<g id="PRINT">` + 非印刷 `<g id="DIELINE">`，PDF 第 2 页 1:1 刀版层。**剩下**：异形（path 刀线）仍退化成矩形；作业单页（job ticket）未加 | 中 |

## 6A. PSD / AI 批量导入（**已拿到真实样本并跑完，结论见下**）

### 真实样本实测（2026-10-10，用户提供的两个文件）

**`化妆品banner设计.psd`（63MB）——不能用作模板，原因全部可验证：**
- 1920×600px、**96dpi**（=208×158.5mm）→ 是**网页 banner**，不是印刷文件（无出血/无刀版/分辨率不够）。
- 95 个图层，**顶层图层名全部是 `众图网www.ztupic.com`**（素材站水印）→ 没有任何 `__text:/__slot:` 命名→ 映射器识别 **0 个槽位**（行为正确：报 `no-editable-slot`、不可发布）。
- 文字层能读到内容+字体：`缓解干燥-秋季必备保湿单品`/MicrosoftYaHei、`圣诞狂欢`/FZLTDHK--GBK1-0、`提前把快乐带回家`/FZLTXHK--GBK1-0 → **方正/微软雅黑商业字体，网页不能嵌**（字体策略这个未决问题已证实是真的）。
- 图案是 60+ 个 13×13px 小矩形拼的 → 印证“背景必须归并成一张图”，不能当 Fabric 对象逐个存。
- 组图层包围盒 0×0 → 再次印证“空层无几何”。

**`包装盒.ai`（3.1MB）——容器是好的，但内容**不适合自动导入**（已用 `scripts/ai-pdf-spike.mts` 逐项取证）：**
- 文件头 `%PDF-1.6`、`Creator=Adobe Illustrator 30.2` → **带 PDF 兼容流，能用 PDF 解析器读**（ag-psd 直接拒：`Invalid signature: '%PDF'`）。
- ✅ **文字可提**：20 条带坐标的矢量文本，均落在成品线内；尺寸 2.42–3.98mm（实测能换算到 mm）。
- ✅ **矢量丰富**：内容流 `constructPath` **608** 条（不是位图稿），全部能解出包围盒；其中 2 条几乎铺满成品线（背景/裁切框）。
- ❌ **只有一个图层**：`/OCProperties/OCGs` 就一项，名叫 `图层 1`；而且内容流里 **没 BDC/EMC 标记**（`beginMarkedContent:0`）→ **所有文字/路径都归 `(no-ocg)`，无法自动分背景/文字/刀版**。
- ❌ **无出血**：`TrimBox == BleedBox == CropBox == MediaBox` = 735.59×719.12pt = **259.5×253.69mm，bleed 算出来 0mm**。而且成品线原点就是 (0,0)。
- ⚠️ **子集字体无 ToUnicode** → 20 条文字里 **14 条是乱码**（只剩控制码），能读的只有 “TPU with backplate / FOR STANDARD PSA SLABS / GRADED CARD” 这类英文。字体表：`XOLEYU+AcuminVariableConcept`、`GMUGUC+GoodTimesRg-Regular`、**`SJYAGE+MicrosoftYaHei-Bold`、`GMUGUC+DengXian-Bold`**（微软雅黑/等线 → 商业字体风险坐实）。
- ⚠️ 这个文件的 `/Producer` 是 **pdf-lib**（不是 Adobe PDF library）→ **它已经被某个工具重写过**，图层被拍平、box 被拉平很可能就是这一步造成的。**不能拿它当“AI 导出应该长什么样”的基准**。

### 四个真实文件的横向对比（2026-10-10 补，`scripts/ai-pdf-spike.mts` 实测）

| 文件 | 成品尺寸 | 图层数 | 文字 | 可读比例 | 矢量路径 |
|---|---|---|---|---|---|
| 广耀眼镜标.ai (4.9MB) | 128.17×148.44mm | 5（`图层 1/2/3` + `_拷贝`） | 28 | **100%** | 43 |
| 牙签旗_复制.ai (1.2MB) | 210×297mm（A4） | 1 | 3 | **100%** | 5 |
| 一粒麦子_复制.ai (10.1MB) | **2265.89mm** ⚠️ | 4（含“图像”层与一个有意义命名层） | 2 | 100% | 2（位图为主） |
| 包装盒.ai (3.1MB) | 259.5×253.69mm | 1 | 20 | **30%** | 608 |

**好消息（比第一份样本的结论乐观很多）：**
- 文字提取在配好 CMap 后**完全可用**，而且内容天生就是槽位。眼镜标.ai 读出来的是：`合格证 / 品牌：ZCGZ / 产品名称：眼镜架 / 镜架材质：tr90/合金/钛 / 执行标准：GB/T14214-2019 / 生产商：临海市广耀眼镜有限公司 / 地址：浙江省临海市杜桥镇` —— 直接就能做 `slots`。
- 字体授权情况比想象好：眼镜标=微软雅黑（商业）、**一粒麦子=阿里巴巴普惠体（免费可商用）**、牙签旗=AdobeSongStd。所以“强制回退托管字体”得配一份**可商用字体白名单**，而不是一律回退。
- 牙签旗.ai 里有一行文字就是 **“黑色为刀模线”** + `30mm`/`82mm` 尺寸标注 → 刀版信息在文件里是以**文字备注 + 黑色描边路径**存在的，不是独立图层。导入器可以拿“备注文字 + 颜色/线宽”当启发式，但必须人工确认。

**坏消息（四个文件全中，无一例外）：**
- **`TrimBox == BleedBox == CropBox == MediaBox`，bleed 算出来永远 0mm** → 四个文件都没设出血。要么导入时统一补 3mm，要么要求导出时带 BleedBox。
- **`pdfJs=0` 图层、`markedContentTagged=false`、`layerCount=1`** → 虽然 `/OCProperties` 里有 1–5 个图层，但**内容流里没有 BDC/EMC 标记**，所以文字/路径无法归到图层 → **自动分背景/文字/刀版目前做不到**。
- 图层名全是 `图层 1`/`图层 3_拷贝` 这种默认名，没有命名规范。
- `/Producer` 四个都是 **pdf-lib** → 它们都被某个工具重写过（不是 Illustrator 直出）。这很可能就是图层标记丢失的原因。**下一批文件请直接从 Illustrator 导出，不要过任何转换工具。**

### 因此 P1 的技术选择（已按四个文件修正）

1. **AI/PDF 路线可以干，但“图层分离”这一环现在断在源文件上**（四个文件全部无 marked content）。现实的前置是：要么给设计师一份《图层命名与导出规范》（至少：背景 / 文字 / 刀版 三层 + 开 PDF 兼容 + **保留图层标记 + 设 BleedBox + 不要用第三方工具转一手**），要么做成“**自动抽草稿 + 人工标注台**”。文字/尺寸/路径都能自动，图层不能。
2. 依赖已选定并实测：**`pdf-lib`（结构：页框/OCG 名/字体表）+ `pdfjs-dist@6.4`（内容流：文字带坐标 + 路径）**，两者 MIT/Apache。**不用 mupdf（AGPL，商业站风险）**。均为 devDependency（产品代码用到时再升为 dependencies）。
3. 背景必须归并成图（worker 渲染），产物按 `templates/source/<yyyy>/<mm>/<sha12>-<原名>` 存 R2（桶已可用）。
4. 字体：商业字体（雅黑/等线/方正）要么买授权子集化，要么强制回退托管字体并报警 —— 映射器已有后者。
5. **文字解码必须做“失败可识别”**：无 ToUnicode 时不能把乱码当文案入库（现在 spike 会原样输出，导入器必须按“可读字符比例”判并降级为占位文本）。

### 旧有结论（仍有效）

- 契约与验证：`src/lib/psd-template.ts`（纯函数，不依赖 ag-psd、不碰像素）+ `scripts/psd-spike.mjs`（19 项断言全绿，`node scripts/psd-spike.mjs a.psd` 可直接跑真实文件）。
- **图层命名规范（没这套规范自动化必翻车）**：`__text:key__` 文字槽位 / `__slot:key__` 图片槽位 / `__dieline__` / `__bleed__`（含出血外扩矩形）/ `__safe__`（安全区内缩矩形）；其余图层归背景。画布尺寸 = 成品（trim）尺寸，文字层不开图层样式。
- **Spike 查出的两条硬约束**：
  1. **PSD 图层包围盒依附像素**：空图层读回来 `right===left`、`bottom===top`。所以标记层必须有实体像素（哪怕 1px 占位矩形）；映射器现在对退化几何直接报 `layer-no-geometry` error 并停止上架（以前会静默算出 bleed=0mm / safe=27mm 这种看起正常的错值）。
  2. **mm 只能反算**：像素是整数，1063px@300dpi=90.002mm → 映射器统一吸到 0.5mm（`snapMm`），模板尺寸以吸附后的标准规格入库。
- 已覆盖的映射：pt→场景px（1pt=2.822px）、`{r,g,b}`→hex、段落对齐、未托管字体→强制回退 Arial 并报警、隐藏层跳过、零槽位=死图不可发布、文字带图层样式=不可发布。
- **还没验证（必须拿设计产线的真实 PSD）**：Photoshop 存的引擎数据/智能对象/矢量蒙版/CMYK/专色承刀版；以及背景合成图切片（需 worker：带 canvas 的 Node / headless Chrome / Python psd-tools）。
- **未决问题（阻塞 P1 开工）**：① PSD 由谁产、能否定规范；② 客户要改什么（只文字+logo？有无产品实拍图）；③ 字体策略（只用托管集 / 买授权子集化 / 允许上传）；④ 模板页要不要做 SEO；⑤ 先内部上架还是公开市场。
- **语义缺口（开工前必须定）**：当前设计器画布尺寸=trim，而带出血的 PSD 背景比 trim 大；Fabric 导出只覆盖画布本身 → 要么把导出改成覆盖含出血的矩形，要么让 PSD 画布=trim 并接受“背景无出血”。选错会导致印厂拒收。
- **AI/PDF 路线（用户 2026-10-09 补充：源文件可能是 .ai）——已建议优先做这条**：现代 `.ai` 默认内嵌 PDF 兼容流，Illustrator 图层→PDF **OCG（可选内容组）**，可分离背景/文字/刀版；文字是矢量可直提（字体名/字号/坐标），单位 pt 换 mm 比 PSD 反算更准，刀版本身就是矢量路径，且交付印厂不丢矢量。代价：只有开了“创建 PDF 兼容文件”的能读，老 AI8/9 二进制无解。**需拿真实 .ai/.pdf 样本跟 .psd 一起跑 spike 才能定。**
- **已完成的前置**：`DesignTemplate` 已有 `slots`/`sourceKey`/`sourceHash`/`widthPx`/`heightPx`/`dpi`/`tags`；列表已服务端分页（后台 25/前台 24）；`sourceHashOf()` 做内容去重、`ensureUniqueSlug()` 做 slug 撞车避让；`previewImage` 已接进卡片（有图用图，无图回退内联刀版 SVG）。导入器只需往上灌数据。

## 6B. 模板库现状（2026-10-10：内容模板第一批）

- 库内 **205 个上架模板** = 5 个手工种子 + 200 个生成（`sourceKey='generated@template-kit'` 标记；`node scripts/generate-templates.mjs --clean` 只删这批）。
- **产品类型已拆出 `sticker`**（用户定的）：card 51 / label 41 / sticker 29 / tag 34 / box 44。模板库 chip 与 `/design/[type]` 自动出现新类型，不用改代码（列表查询走 facet，没硬编枚举）。
- 生成器：**确定性 seed**（重跑同一批）、`--dry-run` 只算不写；写入是“先删后写整批重建”——按 sourceHash 跳过 + `createMany.skipDuplicates` 会让改过版式的模板**因 slug 撞车静默丢弃**（实测 `created=0` 才发现）。
- 生成器内置**几何自检**：用与 `runPreflight` 相同的三条规则（超出血/跨裁切/文字出安全区）预查每个对象，200 个全 0 违规。它已实际抓到两个真 bug：小尺寸色带版式文字顶边 3.1mm < 安全区 3.5mm；`corner` 图案圆戳出出血框。
- 色域：`node --experimental-strip-types scripts/check-template-colors.mts` → **205 模板 / 1696 个 fill 全部在 CMYK 色域内**（用的是应用里真实的 `outOfCmykGamut`，不是脚本副本）。
- 卡片预览三级回退：`previewImage`（将来 R2 缩略图）→ `sceneToSvg(sceneTemplate)`（现在生效）→ 内联刀版 SVG。`src/lib/scene-svg.ts` 只支持 textbox/rect/circle/image，**不支持的 type 直接跳过不报错**，场景 >300KB 也主动放弃（不依赖 R2、不跑浏览器）。
- 已知不足：前 5 张卡片是手工种子，场景只有一行占位文字，看上去“很空”（生成模板从第 6 张起才有真实构图）——要么把种子也铺上设计，要么调排序。圆形贴纸的方形构图问题已修（强制内接方框 + 靠内细环）。

## 7. 关键文件速查

- 模板库（10 万级改造后）：**`src/lib/template-query.ts`**（分页/筛选/facet/深翻页上限/内容指纹/唯一 slug —— 所有列表查询只走这里）、`src/lib/template-slug.ts`（纯 slug 规则）、`src/components/ui/Pager.tsx`（前后台共用，`lang: 'en'|'zh'`）、`src/components/design/TemplateCard.tsx`（前台卡片）、`src/app/[locale]/admin/templates/page.tsx`（表格 + URL 驱动的单表单：`?q=&type=&page=&edit=&new=`）
- 免费设计引导：`src/components/design/FreeDesignCallout.tsx`（一份文案三个密度：`banner`=/design 与 /design/[type] 顶部横条、`rail`=引导页左栏竖卡、`strip`=编辑器左工具栏紧凑条）。主 CTA = `/quote?intent=design-help`；第二入口（mailto）只在 `NEXT_PUBLIC_SALES_EMAIL` 配了真邮箱才渲染。口径：“Free with any order”，不承诺无条件免费打样。配套：`src/lib/contact.ts`、`src/lib/quote-intent.ts`
- 印前与刀版：**`src/lib/dieline.ts`**（从 dielineSvg 解析裁切形状 + 三个判定区域 + `DieObject`；预检与生成器共用一份规则）、`src/lib/color-gamut.ts`（色域预警）、**`src/lib/production-export.ts`**（`svgWithDielineLayer` 拆 PRINT/DIELINE 两组；`appendDielinePage` 给 PDF 加第 2 页 1:1 刀版层；刀线只取自模板，不由客户带）、`src/components/design/PreflightPanel.tsx`（kind 新增 `no-full-bleed`；`index<0` 的图级问题不可点选）
- 设计器：`src/components/design/{useFabricCanvas,DesignCanvas,DesignStudio,ObjectPropertiesPanel,PreflightPanel,GuideOverlay}.tsx/ts` · `src/features/design/actions.ts` · `src/app/[locale]/design/{page,[productType]/page}.tsx` · `src/app/[locale]/account/designs/page.tsx`
- 快速定制：`src/app/[locale]/customize/[templateSlug]/page.tsx` · `src/components/design/{GuidedStudio,GuidedWorkspace,useDesignSave}.tsx/ts` · `src/components/product/DesignPendingHint.tsx`
- 桥接：`src/lib/design-bridge.ts`（localStorage `pp_order_design` 唯一入出口：`useDesignBridge/saveDesignBridge/clearDesignBridge`）· `src/components/ui/AttachedDesignNote.tsx`（表单上展示挂的是哪份 + don’t attach）· `src/components/product/DesignPendingHint.tsx`（/products 列表页黄条）· `src/components/quote/{ProductConfigurator,QuoteForm}.tsx` · `src/features/{order,quote}/actions.ts`（designId 落库）
- 导航：`src/components/site/SiteNav.tsx`（悬停区模型+mega menu，**全部交互零 JS**；面板在各自 li 内、定位基准必须是 `.mega-grid`）· `src/lib/megaMenu.ts`（NavGroup 数据，**无 image 字段**）· 定高/静止态让位规则在 `src/app/globals.css` 末尾的 `.mega-grid` 一段
- 后台：`src/components/admin/{TemplateEditor,PostEditor,VideoEditor,OrderReviewPanel}.tsx` · `src/features/admin/actions.ts` · `src/app/[locale]/admin/{templates,blog,videos,orders}/page.tsx`
- 计价引擎：`src/lib/config-engine.ts` · 订单领域：`src/lib/orders.ts`
- schema：`prisma/schema.prisma`（Order.designId L277、Quote.designId、DesignTemplate/UserDesign L~360-400、Post/Video）
- 首页：`src/app/[locale]/page.tsx`（各段都是本文件内的展示型函数；新横幅 `DesignStudioBand` 在 `Categories` 后）· 文案 `messages/en.json`
- 色彩：`src/lib/color-gamut.ts`（sRGB→Lab + CMYK 色域近似上限，**只预警不换算**）
- PSD 导入 spike：`src/lib/psd-template.ts`（纯映射契约）· `scripts/psd-spike.mjs`（自检 + 跑真实 PSD）· **`scripts/ai-pdf-spike.mts`**（跑真实 AI/PDF：`node --experimental-strip-types scripts/ai-pdf-spike.mjs "Test file/xxx.ai"`，报告落 `scripts/out/`）· 详见 §6A
- 维护脚本：`scripts/cleanup-test-data.mjs`（测试数据清理，默认 dry-run）· `scripts/template-scale-check.mjs`（模板库规模压测：灌 N 条临时模板→量查询+看执行计划→自清，`--rows=20000`）· **`scripts/generate-templates.mjs`**（生成内容模板：`--count=200` 重建、`--dry-run` 只算+自检、`--clean` 只删这批）· **`scripts/check-template-colors.mts`**（拿真实色域规则体检全库 fill 颜）· `prisma/seed-templates.mjs`（模板 upsert 幂等）

## 8. 提交链（origin/main 已同步）

2026-10-09 本轮已提交并 push（按功能分组，每个都单独可回滚）：

| commit | 内容 |
|---|---|
| `dcb760d` | `fix(db)` 两个漂移迁移（配置器三表 + 外键 SET NULL + 两个软引用字段） |
| `ce3b617` | `feat(home)` 首页 Design Studio 横幅 + `DesignStudio` 英文文案 |
| `4b035d5` | `feat(design-studio)` 对象属性面板 + 画布缩放/平移 + 印前自检（含 CMYK 色域预警）+ 种子预置文字按安全区内缩 |
| `5709fbb` | `feat(admin)` 刀版 SVG 拖拽上传/预览/校验（DielineField） |
| `5385d94` | `fix(auth)` register 页 `useTranslations` 移入同步子组件（**早前会话遗留未提交**，非本期改动） |
| `6a834de`+`14a0d91` | PSD 导入 spike（§6A）与文档 |
| 本轮 | `feat(customize)` 快速定制页 `/customize/[slug]` + `GuideOverlay/useDesignSave` 抽取 + `/products` 桥提示条；修 4 处（锁定下选中框泄漏 / 桥残留无承接 / h1 文案与字段数矛盾 / 无移除 logo） |
| docs | 本文 + `.gitignore`（排除 `verify-*` 验收产物） |

历史：`3e56f5d` HANDOFF 文档 · `4614eed` 矢量导出 SVG+PDF · `26236e7` M3 刀版/出血 overlay · `d049008` 我的设计+后台看稿链+productType 持久化 · `ba152ba` 专家报价路径 · `e0b5bdf` M2a 设计→下单桥 · `14e4603` 画布放大+满宽 · `9f6edee` 前台文案英文化 · `025d4ce` M1b 作品入库 · `ab40b9e` 模板系统+后台CRUD+宽度 · `6f26735` mega menu 修复+设计入口 · `aff24c4` B端化+SEO+M0/M1。
