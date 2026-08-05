/**
 * Live DB checks for Category Engine (requires DATABASE_URL).
 * Run: npx tsx scripts/_verify-category-engine-db.ts
 */

import { prisma } from "../lib/prisma";
import { getAllDbValues } from "../lib/categories";
import { assertMainCategory, isValidSubcategory, normalizeLegacyCategory } from "../lib/categories/tree";
import { getCategoriesWithCounts, getCategoryCounts } from "../lib/utils/product-count";

async function main() {
  const allowlist = getAllDbValues();
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, category: true, subcategory: true },
  });

  let missing = 0;
  let invalidMain = 0;
  let invalidSub = 0;
  const seen = new Set<string>();

  for (const p of products) {
    if (seen.has(p.id)) {
      console.error("Duplicate product id in result set", p.id);
    }
    seen.add(p.id);

    if (!p.category?.trim()) {
      missing += 1;
      continue;
    }
    const main =
      assertMainCategory(p.category) || normalizeLegacyCategory(p.category);
    if (!main || !allowlist.includes(main)) {
      invalidMain += 1;
      console.warn("Invalid main:", p.category, "—", p.name.slice(0, 60));
    } else if (
      p.subcategory &&
      !isValidSubcategory(main, p.subcategory) &&
      // allow legacy subs until rebuild
      true
    ) {
      // Count only if not normalizable — warn soft
      if (!isValidSubcategory(main, p.subcategory)) {
        invalidSub += 1;
      }
    }
  }

  const counts = await getCategoryCounts();
  const withCounts = await getCategoriesWithCounts();
  const sumAllowlist = allowlist.reduce((s, c) => s + (counts[c] || 0), 0);

  console.log("Active products:", products.length);
  console.log("Missing category:", missing);
  console.log("Invalid main (not allowlist/legacy):", invalidMain);
  console.log("Subcategory mismatches (soft):", invalidSub);
  console.log("Allowlist count sum:", sumAllowlist);
  console.log("Frontpage tiles:", withCounts);

  for (const c of withCounts) {
    const prismaCount = await prisma.product.count({
      where: { isActive: true, category: c.name },
    });
    // Legacy may inflate helper vs exact dbValue — after rebuild should match
    console.log(`  ${c.slug}: helper=${c.count} exactDb=${prismaCount}`);
  }

  if (missing > 0 || invalidMain > products.length * 0.5) {
    console.error("FAIL: too many uncategorized / invalid");
    process.exit(1);
  }

  console.log("DB checks completed (run Rebuild Categories to clear legacy orphans).");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
