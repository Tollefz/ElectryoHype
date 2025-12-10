/**
 * Migrate sport/training products to demo-store
 * Run with: npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" scripts/migrate-sport-products.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Migrating sport/training products to demo-store...\n");

  // Find all products that should be moved to demo-store
  const sportCategories = ["Sport", "Klær"];
  const sportKeywords = ["Trenings", "Sport", "Yoga", "Ball", "Undertøy"];

  // Find products to migrate
  const productsToMigrate = await prisma.product.findMany({
    where: {
      storeId: "default-store",
      OR: [
        { category: { in: sportCategories } },
        {
          name: {
            contains: "Trenings",
            mode: "insensitive",
          },
        },
        {
          name: {
            contains: "Yoga",
            mode: "insensitive",
          },
        },
        {
          name: {
            contains: "Ball",
            mode: "insensitive",
          },
        },
        {
          name: {
            contains: "Undertøy",
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      category: true,
      storeId: true,
    },
  });

  console.log(`📦 Found ${productsToMigrate.length} products to migrate:`);
  productsToMigrate.forEach((p) => {
    console.log(`  - ${p.name} (${p.category})`);
  });

  if (productsToMigrate.length === 0) {
    console.log("\n✅ No products to migrate. All done!");
    return;
  }

  // Migrate them
  const result = await prisma.product.updateMany({
    where: {
      id: { in: productsToMigrate.map((p) => p.id) },
    },
    data: {
      storeId: "demo-store",
    },
  });

  console.log(`\n✅ Migrated ${result.count} products to demo-store`);
  console.log("   These products will no longer appear on /products");
  console.log("\n📊 Remaining products in default-store:");
  
  const remaining = await prisma.product.findMany({
    where: { storeId: "default-store" },
    select: { name: true, category: true },
  });
  
  remaining.forEach((p) => {
    console.log(`  - ${p.name} (${p.category})`);
  });
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

