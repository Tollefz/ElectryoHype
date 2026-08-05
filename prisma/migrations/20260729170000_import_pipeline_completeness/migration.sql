-- AlterTable Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierSpecs" JSONB;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "attributes" JSONB;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "videos" JSONB;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "importCompleteness" JSONB;

-- AlterTable ImportQueueItem
ALTER TABLE "ImportQueueItem" ADD COLUMN IF NOT EXISTS "completeness" JSONB;
ALTER TABLE "ImportQueueItem" ADD COLUMN IF NOT EXISTS "imageReport" JSONB;

-- AlterTable ProductVariant
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "supplierVariantId" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "weightGrams" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "barcode" TEXT;

CREATE INDEX IF NOT EXISTS "ProductVariant_supplierVariantId_idx" ON "ProductVariant"("supplierVariantId");
