-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_subcategory_idx" ON "Product"("subcategory");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_category_subcategory_idx" ON "Product"("category", "subcategory");
