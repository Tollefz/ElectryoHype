/**
 * ONE-TIME SCRIPT: Cleanup demo products
 * 
 * This script removes or hides demo products from the database.
 * 
 * IMPORTANT: This is a ONE-TIME cleanup script.
 * DO NOT run this automatically in production.
 * 
 * This script will:
 * 1. Delete all products with storeId = "demo-store" (sport/klær demo products)
 * 2. Optionally move old "default-store" demo products to "demo-legacy" storeId
 * 
 * Usage: npm run cleanup:demo-products
 * Or: ts-node --compiler-options "{\"module\":\"CommonJS\",\"moduleResolution\":\"node\"}" scripts/cleanup-demo-products.ts
 * 
 * DRY RUN: Set DRY_RUN=true to see what would be deleted without actually deleting
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "true";

async function main() {
  console.log("🧹 Starting demo products cleanup...");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes will be made)" : "LIVE (will delete/move products)"}`);
  console.log("");

  // Step 1: Find and delete "demo-store" products
  console.log("📦 Step 1: Finding products with storeId='demo-store'...");
  const demoStoreProducts = await prisma.product.findMany({
    where: { storeId: "demo-store" },
    select: {
      id: true,
      name: true,
      category: true,
      storeId: true,
    },
  });

  console.log(`   Found ${demoStoreProducts.length} products in "demo-store"`);
  if (demoStoreProducts.length > 0) {
    console.log("   Sample products:");
    demoStoreProducts.slice(0, 5).forEach((p) => {
      console.log(`   - ${p.name} (${p.category})`);
    });
    if (demoStoreProducts.length > 5) {
      console.log(`   ... and ${demoStoreProducts.length - 5} more`);
    }
  }

  if (!DRY_RUN && demoStoreProducts.length > 0) {
    console.log(`\n🗑️  Deleting ${demoStoreProducts.length} products from "demo-store"...`);
    const deleteResult = await prisma.product.deleteMany({
      where: { storeId: "demo-store" },
    });
    console.log(`✅ Deleted ${deleteResult.count} products from "demo-store"`);
  } else if (DRY_RUN && demoStoreProducts.length > 0) {
    console.log(`\n[DRY RUN] Would delete ${demoStoreProducts.length} products from "demo-store"`);
  } else {
    console.log("✅ No products in 'demo-store' to delete");
  }

  // Step 2: Find old "default-store" demo products (the 6 original electronics products)
  // These are identified by being in "default-store" but having simple/demo names
  console.log("\n📦 Step 2: Finding old demo products in 'default-store'...");
  
  // Common demo product names/patterns
  const demoPatterns = [
    "Premium hodetelefoner",
    "Smartklokke Pro",
    "Trådløs mus",
    "USB-C lader",
    "Skjermbeskytter",
    "Hodetelefoner",
    "Treningsball",
    "Kokekarsett",
    "Sportsundertøy",
    "Hettegenser",
    "T-skjorte",
  ];

  const oldDemoProducts = await prisma.product.findMany({
    where: {
      storeId: "default-store",
      OR: demoPatterns.map((pattern) => ({
        name: { contains: pattern, mode: "insensitive" },
      })),
    },
    select: {
      id: true,
      name: true,
      category: true,
      storeId: true,
      supplierName: true,
    },
  });

  console.log(`   Found ${oldDemoProducts.length} potential old demo products in "default-store"`);
  if (oldDemoProducts.length > 0) {
    console.log("   Sample products:");
    oldDemoProducts.slice(0, 5).forEach((p) => {
      console.log(`   - ${p.name} (${p.category}, supplier: ${p.supplierName || "none"})`);
    });
    if (oldDemoProducts.length > 5) {
      console.log(`   ... and ${oldDemoProducts.length - 5} more`);
    }
  }

  // Option: Move to "demo-legacy" instead of deleting (safer)
  const MOVE_TO_LEGACY = true; // Set to false to delete instead

  if (oldDemoProducts.length > 0) {
    if (MOVE_TO_LEGACY) {
      if (!DRY_RUN) {
        console.log(`\n📦 Moving ${oldDemoProducts.length} old demo products to "demo-legacy" storeId...`);
        const moveResult = await prisma.product.updateMany({
          where: {
            storeId: "default-store",
            OR: demoPatterns.map((pattern) => ({
              name: { contains: pattern, mode: "insensitive" },
            })),
          },
          data: {
            storeId: "demo-legacy",
          },
        });
        console.log(`✅ Moved ${moveResult.count} products to "demo-legacy"`);
      } else {
        console.log(`\n[DRY RUN] Would move ${oldDemoProducts.length} products to "demo-legacy"`);
      }
    } else {
      if (!DRY_RUN) {
        console.log(`\n🗑️  Deleting ${oldDemoProducts.length} old demo products...`);
        const deleteResult = await prisma.product.deleteMany({
          where: {
            storeId: "default-store",
            OR: demoPatterns.map((pattern) => ({
              name: { contains: pattern, mode: "insensitive" },
            })),
          },
        });
        console.log(`✅ Deleted ${deleteResult.count} old demo products`);
      } else {
        console.log(`\n[DRY RUN] Would delete ${oldDemoProducts.length} old demo products`);
      }
    }
  } else {
    console.log("✅ No old demo products found in 'default-store'");
  }

  // Summary
  console.log("\n📊 Summary:");
  console.log(`   - Deleted/moved from "demo-store": ${demoStoreProducts.length}`);
  console.log(`   - Moved/deleted from "default-store": ${oldDemoProducts.length}`);
  console.log("\n✅ Cleanup complete!");
  console.log("\n⚠️  IMPORTANT: Verify that Temu products are now visible on /products");
  console.log("   Check: /api/debug/store-ids and /api/debug/temu-products");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

