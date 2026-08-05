-- AI product categorization fields
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "aiCategorySuggested" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "aiCategoryConfidence" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "aiCategoryReason" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "aiCategoryStatus" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "aiCategoryAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Product_aiCategoryStatus_idx" ON "Product"("aiCategoryStatus");
