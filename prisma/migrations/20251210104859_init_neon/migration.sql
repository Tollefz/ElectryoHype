/*
  Warnings:

  - The `status` column on the `AbandonedCart` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `paymentMethod` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `paymentStatus` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `supplierOrderStatus` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `supplierName` column on the `Product` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `oldStatus` column on the `SupplierOrderEvent` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `role` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `newStatus` on the `SupplierOrderEvent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'manager', 'support');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('stripe', 'vipps', 'klarna', 'paypal');

-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('PENDING', 'SENT_TO_SUPPLIER', 'ACCEPTED_BY_SUPPLIER', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'RECOVERED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SupplierName" AS ENUM ('alibaba', 'ebay', 'temu');

-- AlterTable
ALTER TABLE "AbandonedCart" DROP COLUMN "status",
ADD COLUMN     "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "status",
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'pending',
ALTER COLUMN "subtotal" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "shippingCost" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "tax" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "total" SET DATA TYPE DOUBLE PRECISION,
DROP COLUMN "paymentMethod",
ADD COLUMN     "paymentMethod" "PaymentMethod",
DROP COLUMN "paymentStatus",
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
DROP COLUMN "supplierOrderStatus",
ADD COLUMN     "supplierOrderStatus" "SupplierOrderStatus" DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "price" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "price" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "compareAtPrice" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "supplierPrice" SET DATA TYPE DOUBLE PRECISION,
DROP COLUMN "supplierName",
ADD COLUMN     "supplierName" "SupplierName";

-- AlterTable
ALTER TABLE "SupplierOrderEvent" DROP COLUMN "oldStatus",
ADD COLUMN     "oldStatus" "SupplierOrderStatus",
DROP COLUMN "newStatus",
ADD COLUMN     "newStatus" "SupplierOrderStatus" NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'admin';

-- CreateIndex
CREATE INDEX "AbandonedCart_status_lastUpdated_idx" ON "AbandonedCart"("status", "lastUpdated");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Product_supplierName_idx" ON "Product"("supplierName");

-- CreateIndex
CREATE INDEX "SupplierOrderEvent_newStatus_createdAt_idx" ON "SupplierOrderEvent"("newStatus", "createdAt");
