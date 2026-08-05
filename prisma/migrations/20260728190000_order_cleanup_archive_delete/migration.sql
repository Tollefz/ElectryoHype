-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isTestOrder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "archivedById" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "archivedByEmail" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_archivedAt_idx" ON "Order"("archivedAt");
CREATE INDEX IF NOT EXISTS "Order_isTestOrder_idx" ON "Order"("isTestOrder");

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrderDeletionLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "deletionType" TEXT NOT NULL,
    "deletedById" TEXT,
    "deletedByEmail" TEXT,
    "reason" TEXT,
    "wasPaid" BOOLEAN NOT NULL DEFAULT false,
    "wasTestOrder" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDeletionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderDeletionLog_orderNumber_idx" ON "OrderDeletionLog"("orderNumber");
CREATE INDEX IF NOT EXISTS "OrderDeletionLog_createdAt_idx" ON "OrderDeletionLog"("createdAt");
CREATE INDEX IF NOT EXISTS "OrderDeletionLog_deletedById_idx" ON "OrderDeletionLog"("deletedById");
CREATE INDEX IF NOT EXISTS "OrderDeletionLog_deletionType_idx" ON "OrderDeletionLog"("deletionType");
