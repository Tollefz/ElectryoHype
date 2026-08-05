/**
 * Trace buyer candidates: DB → resolveScan → listBuyerReviewPage
 * Run: NODE_OPTIONS=--require=./scripts/stub-server-only.cjs npx ts-node ...
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const scans = await p.buyerScanRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      status: true,
      scanned: true,
      kept: true,
      filtered: true,
      createdAt: true,
      finishedAt: true,
      targetScanCount: true,
    },
  });

  console.log("\n=== 1. SCANS (latest 8) ===");
  for (const s of scans) {
    console.log(
      `${s.id.slice(0, 12)}… status=${s.status} scanned=${s.scanned} kept=${s.kept} filtered=${s.filtered}`
    );
  }

  const byStatus = await p.buyerCandidate.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log("\n=== 2. ALL buyer_candidates BY STATUS ===");
  console.log(byStatus);

  const total = await p.buyerCandidate.count();
  console.log("total=", total);

  console.log("\n=== 3. PER-SCAN ranked / bestInGroup ===");
  for (const s of scans.slice(0, 5)) {
    const ranked = await p.buyerCandidate.count({
      where: { scanRunId: s.id, status: "ranked" },
    });
    const best = await p.buyerCandidate.count({
      where: { scanRunId: s.id, status: "ranked", isBestInGroup: true },
    });
    const bestFalse = await p.buyerCandidate.count({
      where: { scanRunId: s.id, status: "ranked", isBestInGroup: false },
    });
    const filtered = await p.buyerCandidate.count({
      where: { scanRunId: s.id, status: "filtered" },
    });
    const other = await p.buyerCandidate.groupBy({
      by: ["status"],
      where: { scanRunId: s.id },
      _count: { _all: true },
    });
    console.log({
      scan: s.id,
      scanStatus: s.status,
      keptCounter: s.kept,
      ranked,
      rankedBestInGroup: best,
      rankedNotBest: bestFalse,
      filteredRows: filtered,
      byStatus: other,
    });
  }

  // Dynamic import after stub
  const { resolveBuyerRankingScanId } = await import("../lib/buyer/scan");
  const { listBuyerReviewPage } = await import("../lib/buyer/review-board");

  const resolved = await resolveBuyerRankingScanId();
  console.log("\n=== 4. resolveBuyerRankingScanId ===", resolved);

  if (resolved) {
    const resolvedScan = scans.find((s) => s.id === resolved) ||
      (await p.buyerScanRun.findUnique({
        where: { id: resolved },
        select: {
          id: true,
          status: true,
          scanned: true,
          kept: true,
          filtered: true,
        },
      }));
    console.log("resolved scan meta", resolvedScan);

    const ranked = await p.buyerCandidate.count({
      where: { scanRunId: resolved, status: "ranked" },
    });
    const best = await p.buyerCandidate.count({
      where: { scanRunId: resolved, status: "ranked", isBestInGroup: true },
    });
    console.log("DB for resolved: ranked=", ranked, "bestInGroup=", best);
  }

  console.log("\n=== 5. listBuyerReviewPage (PickFlow defaults) ===");
  const page = await listBuyerReviewPage({
    page: 1,
    pageSize: 48,
    group: "all",
    sort: "rank",
  });
  console.log({
    scanRunId: page.scanRunId,
    total: page.total,
    itemsReturned: page.items.length,
    sampleTitles: page.items.slice(0, 5).map((c) => c.title?.slice(0, 50)),
  });

  // Cross-check: candidates on other scans not shown
  const anyRankedBest = await p.buyerCandidate.count({
    where: { status: "ranked", isBestInGroup: true },
  });
  console.log("\n=== 6. GLOBAL ranked+bestInGroup (any scan) ===", anyRankedBest);

  if (anyRankedBest > 0 && page.total === 0) {
    console.log(
      "\n!!! BUG PATTERN: candidates exist globally but API page.total=0"
    );
    const orphans = await p.buyerCandidate.groupBy({
      by: ["scanRunId"],
      where: { status: "ranked", isBestInGroup: true },
      _count: { _all: true },
    });
    console.log("ranked+best by scanRunId:", orphans);
  }

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
