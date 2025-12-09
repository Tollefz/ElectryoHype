-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "storeId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Product" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "Product" ADD COLUMN "supplierSku" TEXT;

-- CreateTable
CREATE TABLE "SupplierOrderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AbandonedCart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "items" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "storeId" TEXT,
    "token" TEXT,
    "lastUpdated" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "percentOff" REAL,
    "amountOff" REAL,
    "usageLimit" INTEGER,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "storeId" TEXT,
    "expiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "keys" JSONB,
    "customerId" TEXT,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "ratePercent" REAL NOT NULL DEFAULT 10,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateClick_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AffiliateOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "commissionAmount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateOrder_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "storeId" TEXT,
    "customerId" TEXT,
    "placedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "items" JSONB NOT NULL,
    "subtotal" REAL NOT NULL,
    "shippingCost" REAL NOT NULL,
    "tax" REAL NOT NULL,
    "total" REAL NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "paymentMethod" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "paymentIntentId" TEXT,
    "supplierOrderId" TEXT,
    "supplierOrderStatus" TEXT DEFAULT 'PENDING',
    "autoOrderAttempts" INTEGER NOT NULL DEFAULT 0,
    "autoOrderError" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "shippingCarrier" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("autoOrderAttempts", "autoOrderError", "createdAt", "customerId", "id", "items", "orderNumber", "paymentIntentId", "paymentMethod", "paymentStatus", "placedById", "shippingAddress", "shippingCost", "status", "subtotal", "supplierOrderId", "supplierOrderStatus", "tax", "total", "trackingNumber", "trackingUrl", "updatedAt") SELECT "autoOrderAttempts", "autoOrderError", "createdAt", "customerId", "id", "items", "orderNumber", "paymentIntentId", "paymentMethod", "paymentStatus", "placedById", "shippingAddress", "shippingCost", "status", "subtotal", "supplierOrderId", "supplierOrderStatus", "tax", "total", "trackingNumber", "trackingUrl", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");
CREATE INDEX "Order_supplierOrderId_idx" ON "Order"("supplierOrderId");
CREATE INDEX "Order_storeId_idx" ON "Order"("storeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SupplierOrderEvent_orderId_idx" ON "SupplierOrderEvent"("orderId");

-- CreateIndex
CREATE INDEX "SupplierOrderEvent_newStatus_createdAt_idx" ON "SupplierOrderEvent"("newStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AbandonedCart_token_key" ON "AbandonedCart"("token");

-- CreateIndex
CREATE INDEX "AbandonedCart_email_idx" ON "AbandonedCart"("email");

-- CreateIndex
CREATE INDEX "AbandonedCart_status_lastUpdated_idx" ON "AbandonedCart"("status", "lastUpdated");

-- CreateIndex
CREATE INDEX "AbandonedCart_storeId_idx" ON "AbandonedCart"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");

-- CreateIndex
CREATE INDEX "DiscountCode_storeId_idx" ON "DiscountCode"("storeId");

-- CreateIndex
CREATE INDEX "DiscountCode_isActive_expiresAt_idx" ON "DiscountCode"("isActive", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_storeId_idx" ON "PushSubscription"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");

-- CreateIndex
CREATE INDEX "Affiliate_storeId_idx" ON "Affiliate"("storeId");

-- CreateIndex
CREATE INDEX "AffiliateClick_affiliateId_idx" ON "AffiliateClick"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateOrder_affiliateId_idx" ON "AffiliateOrder"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateOrder_orderId_idx" ON "AffiliateOrder"("orderId");

-- CreateIndex
CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");
