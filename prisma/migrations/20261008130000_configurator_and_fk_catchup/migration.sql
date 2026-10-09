-- 漂移收尾（二）：migrations 基线 ≠ 真实库结构
-- 配置器三张关系表（AttributeGroup/AttributeOption/DependencyRule）当年直接 db push 建表，没有任何迁移记录；
-- Artwork/Order 的可空软引用外键，init 里是 RESTRICT，后来 db push 按 schema 改成了 SET NULL。
-- 本文件 = `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`
-- 在空影子库重放后与 schema 的权威差异，内容已在现网库存在，故用 `migrate resolve --applied` 登记。

-- DropForeignKey
ALTER TABLE "Artwork" DROP CONSTRAINT "Artwork_userId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_addressId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";

-- CreateTable
CREATE TABLE "AttributeGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selectType" TEXT NOT NULL DEFAULT 'single',
    "displayType" TEXT NOT NULL DEFAULT 'button',
    "unit" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "parentOptionId" TEXT,

    CONSTRAINT "AttributeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentOptionId" TEXT,
    "defaultState" TEXT NOT NULL DEFAULT 'enabled',
    "isDefaultChecked" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "priceAdjustType" TEXT NOT NULL DEFAULT 'FIXED',
    "priceAdjust" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "AttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencyRule" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceOptionId" TEXT NOT NULL,
    "targetGroupId" TEXT NOT NULL,
    "allowedOptionIds" JSONB NOT NULL DEFAULT '[]',
    "disabledOptionIds" JSONB NOT NULL DEFAULT '[]',
    "hiddenOptionIds" JSONB NOT NULL DEFAULT '[]',
    "forcedCheckedOptionId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DependencyRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttributeGroup_productId_idx" ON "AttributeGroup"("productId");

-- CreateIndex
CREATE INDEX "AttributeOption_groupId_idx" ON "AttributeOption"("groupId");

-- CreateIndex
CREATE INDEX "DependencyRule_productId_sourceOptionId_idx" ON "DependencyRule"("productId", "sourceOptionId");

-- AddForeignKey
ALTER TABLE "AttributeGroup" ADD CONSTRAINT "AttributeGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AttributeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyRule" ADD CONSTRAINT "DependencyRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyRule" ADD CONSTRAINT "DependencyRule_sourceOptionId_fkey" FOREIGN KEY ("sourceOptionId") REFERENCES "AttributeOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyRule" ADD CONSTRAINT "DependencyRule_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "AttributeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artwork" ADD CONSTRAINT "Artwork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
