/**
 * Resume Standard mission from checkpoint after rate-limit failure.
 * NODE_OPTIONS='--require ./scripts/stub-server-only.cjs' npx tsx scripts/_resume-standard-proof.ts
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  processBuyerScanBatch,
  listBuyerRanking,
  listBuyerMissionHistory,
} from "../lib/buyer";
import { parseScanRequest } from "../lib/buyer/category-missions";

const SCAN_ID = process.env.PROOF_SCAN_ID || "cms6mljv00000vff4n3a0ngin";

async function main() {
  const startedAt = Date.now();
  const existing = await prisma.buyerScanRun.findUnique({ where: { id: SCAN_ID } });
  if (!existing) throw new Error(`Scan not found: ${SCAN_ID}`);

  await prisma.buyerScanRun.update({
    where: { id: SCAN_ID },
    data: {
      status: "running",
      error: null,
      finishedAt: null,
    },
  });

  console.log(
    JSON.stringify(
      {
        action: "resume",
        scanId: SCAN_ID,
        fromScanned: existing.scanned,
        kept: existing.kept,
        filtered: existing.filtered,
        target: existing.targetScanCount,
        checkpoint: existing.checkpoint,
      },
      null,
      2
    )
  );

  let batches = 0;
  const maxBatches = 400;

  while (batches < maxBatches) {
    const t0 = Date.now();
    // Respect CJ 1 QPS between batch starts (search happens inside)
    await new Promise((r) => setTimeout(r, 200));
    const res = await processBuyerScanBatch(SCAN_ID);
    batches += 1;
    const run = await prisma.buyerScanRun.findUniqueOrThrow({
      where: { id: SCAN_ID },
    });
    const cp = (run.checkpoint || {}) as {
      page?: number;
      seedIdx?: number;
      supplierIdx?: number;
    };
    const parsed = parseScanRequest(run.request);

    if (batches % 5 === 0 || res.done || run.status !== "running") {
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
          stage: parsed.progress?.stage,
          error: run.error,
        })
      );
    }

    if (res.done || run.status === "completed" || run.status === "failed") break;
  }

  const final = await prisma.buyerScanRun.findUniqueOrThrow({
    where: { id: SCAN_ID },
  });
  const parsed = parseScanRequest(final.request);
  const ranking = await listBuyerRanking({ scanRunId: SCAN_ID, limit: 200 });
  const history = await listBuyerMissionHistory({ limit: 3 });
  const byStatus = await prisma.buyerCandidate.groupBy({
    by: ["status"],
    where: { scanRunId: SCAN_ID },
    _count: true,
  });

  console.log("=== STANDARD PROOF ===");
  console.log(
    JSON.stringify(
      {
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        totalElapsedHintSec: Math.round(
          (Date.now() - new Date(existing.startedAt || existing.createdAt).getTime()) /
            1000
        ),
        scanId: SCAN_ID,
        status: final.status,
        target: final.targetScanCount,
        scanned: final.scanned,
        kept: final.kept,
        filtered: final.filtered,
        batches,
        result: parsed.result,
        rankingCount: ranking.length,
        rankingSample: ranking.slice(0, 8).map((r) => ({
          id: r.id,
          title: r.title?.slice(0, 55),
          shopMatchPct: r.shopMatchPct,
          overallScore: r.overallScore,
        })),
        candidateCounts: byStatus,
        historyHead: history.slice(0, 2),
        error: final.error,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error("RESUME_FAILED", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
