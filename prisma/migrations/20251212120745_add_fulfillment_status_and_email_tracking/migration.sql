-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('NEW', 'ORDERED_FROM_SUPPLIER', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "adminEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "adminEmailStatus" "EmailStatus",
ADD COLUMN     "customerEmailLastError" TEXT,
ADD COLUMN     "customerEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "customerEmailStatus" "EmailStatus" NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN     "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'NEW';

-- CreateIndex
CREATE INDEX "Order_fulfillmentStatus_createdAt_idx" ON "Order"("fulfillmentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Order_customerEmailStatus_idx" ON "Order"("customerEmailStatus");
