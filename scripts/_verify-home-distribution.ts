/**
 * Verify homepage distribution has no cross-section duplicates.
 */
import { DEFAULT_STORE_ID } from "../lib/store";
import {
  distributeHomeProducts,
  findDuplicateSectionIds,
} from "../lib/storefront/home-product-distribution";

async function main() {
  const storeId = process.env.STORE_ID || DEFAULT_STORE_ID;
  const result = await distributeHomeProducts(storeId);
  const dups = findDuplicateSectionIds(result.sections);

  const report: Record<string, { count: number; names: string[]; categories: (string | null)[] }> =
    {};
  for (const [key, products] of Object.entries(result.sections)) {
    report[key] = {
      count: products.length,
      names: products.map((p) => p.name.slice(0, 60)),
      categories: products.map((p) => p.category),
    };
  }

  const allIds = Object.values(result.sections).flatMap((s) => s.map((p) => p.id));
  const unique = new Set(allIds);

  console.log(
    JSON.stringify(
      {
        storeId,
        totalSlotsFilled: allIds.length,
        uniqueIds: unique.size,
        duplicates: dups,
        ok: dups.length === 0,
        usedIds: result.usedIds.length,
        sections: report,
      },
      null,
      2
    )
  );

  if (dups.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
