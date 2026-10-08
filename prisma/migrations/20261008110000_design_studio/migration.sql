-- 在线包装设计系统 M0：DesignTemplate + UserDesign + Order.designId
DO $$ BEGIN
  CREATE TYPE "DesignStatus" AS ENUM ('DRAFT', 'SUBMITTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "DesignTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "category" TEXT,
    "dielineSvg" TEXT,
    "widthMm" DOUBLE PRECISION,
    "heightMm" DOUBLE PRECISION,
    "bleedMm" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "safeAreaMm" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "sceneTemplate" JSONB,
    "previewImage" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DesignTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DesignTemplate_slug_key" ON "DesignTemplate"("slug");
CREATE INDEX IF NOT EXISTS "DesignTemplate_productType_active_idx" ON "DesignTemplate"("productType","active");

CREATE TABLE IF NOT EXISTS "UserDesign" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "templateId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Untitled design',
    "sceneJson" JSONB NOT NULL,
    "exportKey" TEXT,
    "thumbKey" TEXT,
    "status" "DesignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserDesign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UserDesign_userId_idx" ON "UserDesign"("userId");
CREATE INDEX IF NOT EXISTS "UserDesign_email_idx" ON "UserDesign"("email");
CREATE INDEX IF NOT EXISTS "UserDesign_status_updatedAt_idx" ON "UserDesign"("status","updatedAt");

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "designId" TEXT;
