-- DropIndex
DROP INDEX "DesignTemplate_productType_active_idx";

-- AlterTable
ALTER TABLE "DesignTemplate" ADD COLUMN     "dpi" INTEGER,
ADD COLUMN     "heightPx" INTEGER,
ADD COLUMN     "slots" JSONB,
ADD COLUMN     "sourceHash" TEXT,
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "widthPx" INTEGER;

-- CreateIndex
CREATE INDEX "DesignTemplate_active_productType_sort_idx" ON "DesignTemplate"("active", "productType", "sort");

-- CreateIndex
CREATE INDEX "DesignTemplate_sourceHash_idx" ON "DesignTemplate"("sourceHash");

-- CreateIndex
CREATE INDEX "DesignTemplate_category_idx" ON "DesignTemplate"("category");
