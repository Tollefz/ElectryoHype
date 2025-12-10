/**
 * Debug script to check which storeId values exist in the database
 * Run with: npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" scripts/debug-store-ids.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Checking storeId distribution in database...\n");

  // Get all products grouped by storeId
  const productsByStore = await prisma.product.groupBy({
    by: ["storeId"],
    _count: {
      _all: true,
    },
    orderBy: {
      storeId: "asc",
    },
  });

  console.log("📊 Products by storeId:");
  console.log("─".repeat(60));
  
  for (const group of productsByStore) {
    const storeId = group.storeId || "(null)";
    const count = group._count._all;
    
    // Get sample product names from this storeId
    const samples = await prisma.product.findMany({
      where: { storeId: group.storeId },
      take: 5,
      select: { name: true, category: true },
    });

    console.log(`\n${storeId}:`);
    console.log(`  Count: ${count} products`);
    console.log(`  Sample products:`);
    samples.forEach((p) => {
      console.log(`    - ${p.name} (${p.category || "no category"})`);
    });
  }

  // Also check for products with specific categories that might indicate demo data
  const sportProducts = await prisma.product.findMany({
    where: {
      OR: [
        { category: { contains: "Sport", mode: "insensitive" } },
        { name: { contains: "Trenings", mode: "insensitive" } },
        { name: { contains: "Sport", mode: "insensitive" } },
      ],
    },
    select: { name: true, storeId: true, category: true },
    take: 10,
  });

  if (sportProducts.length > 0) {
    console.log("\n\n🏋️ Found sport/training products:");
    console.log("─".repeat(60));
    sportProducts.forEach((p) => {
      console.log(`  - ${p.name} (${p.category}) - storeId: ${p.storeId || "(null)"}`);
    });
  }

  // Check for electronics products
  const electronicsProducts = await prisma.product.findMany({
    where: {
      OR: [
        { category: { contains: "Elektronikk", mode: "insensitive" } },
        { category: { contains: "Data", mode: "insensitive" } },
        { category: { contains: "Gaming", mode: "insensitive" } },
      ],
    },
    select: { name: true, storeId: true, category: true },
    take: 10,
  });

  if (electronicsProducts.length > 0) {
    console.log("\n\n⚡ Found electronics products:");
    console.log("─".repeat(60));
    electronicsProducts.forEach((p) => {
      console.log(`  - ${p.name} (${p.category}) - storeId: ${p.storeId || "(null)"}`);
    });
  }

  console.log("\n\n✅ Debug complete!");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

