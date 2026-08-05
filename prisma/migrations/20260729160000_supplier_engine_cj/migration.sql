-- AlterEnum SupplierName
ALTER TYPE "SupplierName" ADD VALUE IF NOT EXISTS 'cj';
ALTER TYPE "SupplierName" ADD VALUE IF NOT EXISTS 'aliexpress';
ALTER TYPE "SupplierName" ADD VALUE IF NOT EXISTS 'banggood';
ALTER TYPE "SupplierName" ADD VALUE IF NOT EXISTS 'onesixeight';
ALTER TYPE "SupplierName" ADD VALUE IF NOT EXISTS 'csv';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ImportQueueStatus" AS ENUM ('queued', 'processing', 'ai', 'review', 'approved', 'published', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierProductStatus" AS ENUM ('available', 'out_of_stock', 'unavailable', 'unknown');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "warehouse" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierStatus" "SupplierProductStatus" NOT NULL DEFAULT 'unknown';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierLastSync" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierCurrency" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierShipping" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierInventory" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lastInventoryCheck" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Product_supplierProductId_idx" ON "Product"("supplierProductId");
CREATE INDEX IF NOT EXISTS "Product_supplierStatus_idx" ON "Product"("supplierStatus");
CREATE INDEX IF NOT EXISTS "Product_supplierLastSync_idx" ON "Product"("supplierLastSync");

-- CreateTable ImportQueueItem
CREATE TABLE IF NOT EXISTS "ImportQueueItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "supplier" "SupplierName" NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "title" TEXT,
    "imageUrl" TEXT,
    "supplierPrice" DOUBLE PRECISION,
    "supplierCurrency" TEXT DEFAULT 'USD',
    "status" "ImportQueueStatus" NOT NULL DEFAULT 'queued',
    "rawPayload" JSONB,
    "mappedDraft" JSONB,
    "enrichment" JSONB,
    "pricing" JSONB,
    "productId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "processedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImportQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImportQueueItem_supplier_supplierProductId_key" ON "ImportQueueItem"("supplier", "supplierProductId");
CREATE INDEX IF NOT EXISTS "ImportQueueItem_status_createdAt_idx" ON "ImportQueueItem"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ImportQueueItem_supplier_status_idx" ON "ImportQueueItem"("supplier", "status");
CREATE INDEX IF NOT EXISTS "ImportQueueItem_productId_idx" ON "ImportQueueItem"("productId");
CREATE INDEX IF NOT EXISTS "ImportQueueItem_storeId_idx" ON "ImportQueueItem"("storeId");

CREATE TABLE IF NOT EXISTS "SupplierApiLog" (
    "id" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,
    "error" TEXT,
    "requestMeta" JSONB,
    "responseMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierApiLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplierApiLog_supplier_createdAt_idx" ON "SupplierApiLog"("supplier", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplierApiLog_ok_createdAt_idx" ON "SupplierApiLog"("ok", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplierApiLog_operation_createdAt_idx" ON "SupplierApiLog"("operation", "createdAt");

CREATE TABLE IF NOT EXISTS "SupplierSyncRun" (
    "id" TEXT NOT NULL,
    "supplier" "SupplierName" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "productsChecked" INTEGER NOT NULL DEFAULT 0,
    "priceChanges" INTEGER NOT NULL DEFAULT 0,
    "outOfStock" INTEGER NOT NULL DEFAULT 0,
    "unavailable" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "nextScheduledAt" TIMESTAMP(3),
    CONSTRAINT "SupplierSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplierSyncRun_supplier_startedAt_idx" ON "SupplierSyncRun"("supplier", "startedAt");
CREATE INDEX IF NOT EXISTS "SupplierSyncRun_status_startedAt_idx" ON "SupplierSyncRun"("status", "startedAt");
