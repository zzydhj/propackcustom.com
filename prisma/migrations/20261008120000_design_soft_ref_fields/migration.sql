-- 漂移收尾：这两个软引用字段此前用 prisma db push 直接加到 Neon，没有 migration 目录
-- 内容与实际库结构一致，本文件通过 `prisma migrate resolve --applied` 登记为已应用
-- 软引用（不建外键）：设计作品可独立于报价/订单存在，删除作品不应级联改单据

-- AlterTable
ALTER TABLE IF EXISTS "Quote" ADD COLUMN IF NOT EXISTS "designId" TEXT;

-- AlterTable
ALTER TABLE IF EXISTS "UserDesign" ADD COLUMN IF NOT EXISTS "productType" TEXT;
