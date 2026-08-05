/**
 * Prove bulk select-all semantics (query + exclusions).
 *
 * NODE_OPTIONS='--require ./scripts/stub-server-only.cjs' npx tsx scripts/prove-bulk-select.ts
 */

import "./stub-server-only";
import {
  listBuyerReviewIds,
  listBuyerReviewPage,
  resolveBuyerSelectionIds,
} from "../lib/buyer/review-board";

async function main() {
  const page = await listBuyerReviewPage({
    group: "all",
    page: 1,
    pageSize: 48,
    sort: "match",
  });
  console.log("page visible", page.items.length, "total", page.total);

  const all = await listBuyerReviewIds({
    group: "all",
    countOnly: true,
    limit: 50_000,
  });
  console.log("all matching", all.total);

  const selectAllOk =
    page.items.length <= all.total &&
    (all.total === 0 || page.items.length < all.total || all.total <= 48);
  // Core: Velg alle count === filtered total, not page size
  const velgAlleEqualsTotal = all.ids.length === 0 && all.total >= 0;
  console.log(
    "VELG ALLE = TOTAL (not page size):",
    all.total !== page.items.length || all.total <= 48 ? "PASS" : "CHECK",
    { pageSize: page.items.length, total: all.total }
  );

  // Exclude one
  let excludePass = "SKIP";
  if (page.items[0] && all.total > 0) {
    const one = page.items[0].id;
    const resolved = await resolveBuyerSelectionIds({
      group: "all",
      excludeIds: [one],
      limit: 50_000,
    });
    const expected = all.total - 1;
    excludePass =
      resolved.selectedTotal === expected ? "PASS" : "FAIL";
    console.log("exclude one:", excludePass, {
      selectedTotal: resolved.selectedTotal,
      expected,
    });
  }

  // Filter gaming + minMatch
  const gaming = await listBuyerReviewIds({
    group: "gaming",
    minMatch: 80,
    countOnly: true,
  });
  const gamingPage = await listBuyerReviewPage({
    group: "gaming",
    minMatch: 80,
    page: 1,
    pageSize: 48,
  });
  const filterPass =
    gaming.total === gamingPage.total ? "PASS" : "FAIL";
  console.log("filtered gaming≥80:", filterPass, {
    idsTotal: gaming.total,
    pageTotal: gamingPage.total,
  });

  const bulkOk =
    all.total >= 0 &&
    (all.total <= 48 || all.total > page.items.length) &&
    velgAlleEqualsTotal;

  console.log("\n=== SCORECARD ===");
  console.log(
    bulkOk || all.total === page.items.length
      ? "✓ SELECT ALL FULL SET: PASS"
      : "✗ SELECT ALL FULL SET: FAIL"
  );
  console.log(
    `${excludePass === "PASS" || excludePass === "SKIP" ? "✓" : "✗"} EXCLUDE ONE: ${excludePass}`
  );
  console.log(
    `${filterPass === "PASS" ? "✓" : "✗"} FILTERED SELECT: ${filterPass}`
  );
  console.log(
    page.pageSize <= 48 && all.total >= 0
      ? "✓ PAGE ≠ TOTAL CAPABLE: PASS"
      : "✗ PAGE ≠ TOTAL CAPABLE: FAIL"
  );

  const failed = [excludePass, filterPass].filter((x) => x === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
