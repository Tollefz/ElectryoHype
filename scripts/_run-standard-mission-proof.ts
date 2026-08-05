/**
 * Prove Standard Mission end-to-end (no UI).
 * NODE_OPTIONS='--require ./scripts/stub-server-only.cjs' npx tsx scripts/_run-standard-mission-proof.ts
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  startBuyerScan,
  processBuyerScanBatch,
  listBuyerRanking,
  listBuyerMissionHistory,
} from "../lib/buyer";
import { parseScanRequest } from "../lib/buyer/category-missions";

async function main() {
  const startedAt = Date.now();
  console.log("=== START STANDARD MISSION ===");

  const scan = await startBuyerScan({
    categoryId: "gaming",
    missionSize: "standard",
    targetScanCount: 10_000,
    processInline: false,
    startedBy: "proof_standard",
  });

  console.log(
    JSON.stringify(
      {
        scanId: scan.id,
        target: scan.targetScanCount,
        status: scan.status,
        missionSize: "standard",
      },
      null,
      2
    )
  );

  let batches = 0;
  const maxBatches = 400; // 400*40 = 16k headroom
  const logEvery = 5;

  while (batches < maxBatches) {
    const t0 = Date.now();
    const res = await processBuyerScanBatch(scan.id);
    batches += 1;
    const run = await prisma.buyerScanRun.findUniqueOrThrow({
      where: { id: scan.id },
    });
    const cp = (run.checkpoint || {}) as {
      page?: number;
      seedIdx?: number;
      supplierIdx?: number;
      seenKeys?: string[];
    };
    const parsed = parseScanRequest(run.request);

    if (batches % logEvery === 0 || res.done || run.status !== "running") {
      console.log(
        JSON.stringify({
          batch: batches,
          ms: Date.now() - t0,
          done: res.done,
          status: run.status,
          scanned: run.scanned,
          kept: run.kept,
          filtered: run.filtered,
          page: cp.page,
          seedIdx: cp.seedIdx,
          supplierIdx: cp.supplierIdx,
          seen: (cp.seenKeys || []).length,
          stage: parsed.progress?.stage,
          scannedDelta: res.scannedDelta,
          error: run.error,
        })
      );
    }

    if (res.done || run.status === "completed" || run.status === "failed") break;
    if (run.status === "paused") {
      console.log("PAUSED — unexpected for standard");
      break;
    }
  }

  const final = await prisma.buyerScanRun.findUniqueOrThrow({
    where: { id: scan.id },
  });
  const parsed = parseScanRequest(final.request);
  const ranking = await listBuyerRanking({ scanRunId: scan.id, limit: 200 });
  const history = await listBuyerMissionHistory({ limit: 5 });
  const byStatus = await prisma.buyerCandidate.groupBy({
    by: ["status"],
    where: { scanRunId: scan.id },
    _count: true,
  });

  const proof = {
    elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    scanId: scan.id,
    status: final.status,
    target: final.targetScanCount,
    scanned: final.scanned,
    kept: final.kept,
    filtered: final.filtered,
    batches,
    stage: parsed.progress?.stage,
    result: parsed.result,
    rankingCount: ranking.length,
    rankingSample: ranking.slice(0, 5).map((r) => ({
      id: r.id,
      title: r.title?.slice(0, 50),
      shopMatchPct: r.shopMatchPct,
      overallScore: r.overallScore,
    })),
    candidateCounts: byStatus,
    historyHead: history.slice(0, 3),
    error: final.error,
  };

  console.log("=== STANDARD PROOF ===");
  console.log(JSON.stringify(proof, null, 2));
}

main()
  .catch((e) => {
    console.error("PROOF_FAILED", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
