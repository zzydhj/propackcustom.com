-- 订单支持匿名提交 + 人工对接（改价 / 发付款链接 / 上传凭证）

-- Artwork：匿名提交订单时也要能上传素材
ALTER TABLE "Artwork" ALTER COLUMN "userId" DROP NOT NULL;

-- Quote：软引用订单，报价确认后可转订单
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "orderId" TEXT;

-- Order：userId / addressId 放开非空（匿名订单不建 Address，改存 shipping 快照）
ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "addressId" DROP NOT NULL;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quotedTotal" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "adjustReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "payUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "proofFileName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "proofUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "artworkId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shipping" JSONB;

-- viewToken：加唯一列到有数据的表必须「先可空 → 回填 → 再加约束」，
-- 否则 Prisma 会拒绝执行（也不得用 --force-reset 清库）。
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "viewToken" TEXT;
UPDATE "Order" SET "viewToken" = replace(gen_random_uuid()::text, '-', '') WHERE "viewToken" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "viewToken" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Order_viewToken_key" ON "Order"("viewToken");

-- 新订单默认进入「待人工确认」
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';
CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
