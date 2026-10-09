-- DropIndex
DROP INDEX "DesignTemplate_active_productType_sort_idx";

-- CreateIndex
CREATE INDEX "DesignTemplate_active_productType_sort_createdAt_idx" ON "DesignTemplate"("active", "productType", "sort", "createdAt");

-- CreateIndex
CREATE INDEX "DesignTemplate_active_sort_createdAt_idx" ON "DesignTemplate"("active", "sort", "createdAt");
