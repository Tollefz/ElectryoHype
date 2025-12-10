/**
 * ONE-TIME SCRIPT: Fix storeId for existing Temu products
 * 
 * This script updates all Temu products that have storeId = null
 * to use DEFAULT_STORE_ID so they appear in the frontend.
 * 
 * IMPORTANT: This is a one-time migration script.
 * DO NOT run this automatically in production.
 * 
 * Usage: npm run fix:temu-storeid
 * Or: ts-node --compiler-options "{\"module\":\"CommonJS\",\"moduleResolution\":\"node\"}" scripts/fix-temu-storeid.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Finding Temu products with null storeId...");

  // Find all Temu products with null storeId
  const temuProducts = await prisma.product.findMany({
    where: {
      OR: [
        { supplierName: "temu" },
        { supplierUrl: { contains: "temu", mode: "insensitive" } },
        { sku: { startsWith: "TEMU-" } },
      ],
      storeId: null,
    },
    select: {
      id: true,
      name: true,
      storeId: true,
      sku: true,
    },
  });

  console.log(`📦 Found ${temuProducts.length} Temu products with null storeId`);

  if (temuProducts.length === 0) {
    console.log("✅ No products to update. All Temu products already have storeId set.");
    return;
  }

  // Get DEFAULT_STORE_ID from env or use "default-store"
  const DEFAULT_STORE_ID = process.env.DEFAULT_STORE_ID || "default-store";
  console.log(`📝 Updating products to use storeId: "${DEFAULT_STORE_ID}"`);

  // Update all products
  const result = await prisma.product.updateMany({
    where: {
      OR: [
        { supplierName: "temu" },
        { supplierUrl: { contains: "temu", mode: "insensitive" } },
        { sku: { startsWith: "TEMU-" } },
      ],
      storeId: null,
    },
    data: {
      storeId: DEFAULT_STORE_ID,
    },
  });

  console.log(`✅ Updated ${result.count} Temu products to storeId="${DEFAULT_STORE_ID}"`);

  // Verify
  const remaining = await prisma.product.count({
    where: {
      OR: [
        { supplierName: "temu" },
        { supplierUrl: { contains: "temu", mode: "insensitive" } },
        { sku: { startsWith: "TEMU-" } },
      ],
      storeId: null,
    },
  });

  if (remaining > 0) {
    console.log(`⚠️  Warning: ${remaining} Temu products still have null storeId`);
  } else {
    console.log("✅ All Temu products now have storeId set!");
  }
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

