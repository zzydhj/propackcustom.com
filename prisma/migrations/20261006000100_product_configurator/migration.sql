-- 产品配置器：定价模式 / 尺寸单价 / 字段定义 / 数量阶梯
CREATE TYPE "PricingMode" AS ENUM ('FIXED', 'AREA');

ALTER TABLE "Product" ADD COLUMN     "pricingMode"   "PricingMode" NOT NULL DEFAULT 'FIXED';
ALTER TABLE "Product" ADD COLUMN     "pricePerSqm"   DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN     "attributes"    JSONB;
ALTER TABLE "Product" ADD COLUMN     "quantityTiers" JSONB;
