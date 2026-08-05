import "dotenv/config";
import { prisma } from "../lib/prisma";
import { processBuyerScanBatch } from "../lib/buyer/scan";
import { parseScanRequest } from "../lib/buyer/category-missions";
import { importTopBuyerCandidates } from "../lib/buyer/bulk";

const QUICK = "cms6krztf0001vfqkcohfemye";
const STD = "cms6kshcx002xvfqkykjoz7g0";
const OLD = "cms6dls6h002vvf2gmohqpa7e";

async function show(id: string) {
  const r = await prisma.buyerScanRun.findUnique({ where: { id } });
  if (!r) {
    console.log(JSON.stringify({ id, missing: true }));
    return null;
  }
  const p = parseScanRequest(r.request);
  const out = {
    id,
    status: r.status,
    target: r.targetScanCount,
    scanned: r.scanned,
    kept: r.kept,
    filtered: r.filtered,
    checkpoint: r.checkpoint,
    stage: p.progress?.stage,
    progressCurrent: p.progress?.current,
    missionSize: p.missionSize,
    error: r.error,
  };
  console.log(JSON.stringify(out, null, 2));
  return r;
}

async function main() {
  const pending = await prisma.supplierJob.findMany({
    where: { type: "buyer_scan_batch" },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      status: true,
      payload: true,
      attempts: true,
      createdAt: true,
      idempotencyKey: true,
      lastError: true,
      result: true,
    },
  });
  console.log("=== JOBS ===");
  console.log(
    JSON.stringify(
      pending.map((j) => ({
        id: j.id,
        status: j.status,
        payload: j.payload,
        attempts: j.attempts,
        key: j.idempotencyKey,
        lastError: j.lastError,
        result: j.result,
      })),
      null,
      2
    )
  );

  console.log("=== BEFORE ===");
  await show(QUICK);
  await show(STD);
  await show(OLD);

  // Pause competing runs so direct batch isn't racing
  await prisma.buyerScanRun.updateMany({
    where: {
      id: { in: [STD, OLD, "cms6kslb20030vfqkhfc0rfhs", "cms6ksmgd0033vfqkprxqlkwl"] },
      status: "running",
    },
    data: { status: "paused" },
  });
  await prisma.buyerScanRun.update({
    where: { id: QUICK },
    data: { status: "running" },
  });

  console.log("=== DIRECT BATCH 1 ===");
  let t0 = Date.now();
  let res = await processBuyerScanBatch(QUICK);
  console.log(JSON.stringify({ ms: Date.now() - t0, res }, null, 2));
  await show(QUICK);

  console.log("=== DIRECT BATCH 2 ===");
  t0 = Date.now();
  res = await processBuyerScanBatch(QUICK);
  console.log(JSON.stringify({ ms: Date.now() - t0, res }, null, 2));
  await show(QUICK);

  console.log("=== DIRECT BATCH 3 ===");
  t0 = Date.now();
  res = await processBuyerScanBatch(QUICK);
  console.log(JSON.stringify({ ms: Date.now() - t0, res }, null, 2));
  await show(QUICK);

  const cands = await prisma.buyerCandidate.findMany({
    where: { scanRunId: QUICK },
    take: 8,
    orderBy: { shopMatchPct: "desc" },
    select: {
      id: true,
      title: true,
      supplier: true,
      supplierProductId: true,
      status: true,
      shopMatchPct: true,
      overallScore: true,
      merchandiserRecId: true,
    },
  });
  console.log("=== CANDIDATES ===");
  console.log(JSON.stringify(cands, null, 2));
  const counts = await prisma.buyerCandidate.groupBy({
    by: ["status"],
    where: { scanRunId: QUICK },
    _count: true,
  });
  console.log("counts", JSON.stringify(counts));

  // Import top if we have ranked with merchandiserRecId
  const importable = cands.filter((c) => c.status === "ranked" && c.merchandiserRecId);
  if (importable.length > 0) {
    console.log("=== IMPORT TOP 3 ===");
    try {
      const imported = await importTopBuyerCandidates({
        limit: 3,
        actorEmail: "verify@local",
      });
      console.log(JSON.stringify(imported, null, 2));
    } catch (e) {
      console.log("IMPORT_ERROR", e instanceof Error ? e.message : e);
    }
  } else {
    console.log("=== IMPORT SKIPPED (no ranked+merchRec on sample) ===");
  }

  const queue = await prisma.importQueueItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      supplierName: true,
      supplierProductId: true,
      title: true,
      productId: true,
      createdAt: true,
    },
  });
  console.log("=== RECENT QUEUE ===");
  console.log(JSON.stringify(queue, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
