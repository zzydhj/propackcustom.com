-- 补齐历史漂移：Product.attributes 已迁至关系表并被 drop，PriceRule 表由 db push 建立
-- 这两项此前没有任何迁移文件记录，导致 migrate 基线与真实库不一致。

ALTER TABLE "Product" DROP COLUMN IF EXISTS "attributes";

CREATE TABLE IF NOT EXISTS "PriceRule" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "optionId" TEXT,
    "chargeType" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "priceValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PriceRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PriceRule_productId_idx" ON "PriceRule"("productId");

ALTER TABLE "PriceRule" DROP CONSTRAINT IF EXISTS "PriceRule_productId_fkey";
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
