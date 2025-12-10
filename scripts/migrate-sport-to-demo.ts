/**
 * Script to migrate Sport and Klær products from default-store to demo-store
 * 
 * Run with: npm run migrate:sport
 * Or: npx ts-node --compiler-options "{\"module\":\"CommonJS\",\"moduleResolution\":\"node\"}" scripts/migrate-sport-to-demo.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Starting migration of Sport/Klær products to demo-store...\n");

  // Find all products in default-store that are Sport or Klær
  const sportProducts = await prisma.product.findMany({
    where: {
      storeId: "default-store",
      category: {
        in: ["Sport", "Klær"],
      },
    },
    select: {
      id: true,
      name: true,
      category: true,
      storeId: true,
    },
  });

  console.log(`📦 Found ${sportProducts.length} products to migrate:`);
  sportProducts.forEach((p) => {
    console.log(`   - ${p.name} (${p.category})`);
  });

  if (sportProducts.length === 0) {
    console.log("\n✅ No products to migrate. All done!");
    return;
  }

  // Migrate them to demo-store
  const result = await prisma.product.updateMany({
    where: {
      id: {
        in: sportProducts.map((p) => p.id),
      },
    },
    data: {
      storeId: "demo-store",
    },
  });

  console.log(`\n✅ Successfully migrated ${result.count} products to demo-store`);
  console.log("\n📊 Verification:");
  
  // Verify migration
  const remainingInDefault = await prisma.product.count({
    where: {
      storeId: "default-store",
      category: {
        in: ["Sport", "Klær"],
      },
    },
  });

  const nowInDemo = await prisma.product.count({
    where: {
      storeId: "demo-store",
      category: {
        in: ["Sport", "Klær"],
      },
    },
  });

  console.log(`   - Sport/Klær products remaining in default-store: ${remainingInDefault}`);
  console.log(`   - Sport/Klær products now in demo-store: ${nowInDemo}`);

  // Show what's left in default-store
  const remainingProducts = await prisma.product.findMany({
    where: {
      storeId: "default-store",
    },
    select: {
      name: true,
      category: true,
    },
  });

  console.log(`\n📋 Products remaining in default-store (${remainingProducts.length}):`);
  remainingProducts.forEach((p) => {
    console.log(`   - ${p.name} (${p.category || "No category"})`);
  });

  console.log("\n✅ Migration complete!");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

