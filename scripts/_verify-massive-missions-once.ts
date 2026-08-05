/**
 * ONE-SHOT verification harness (not a product feature).
 * NODE_OPTIONS='--require ./scripts/stub-server-only.cjs' npx tsx scripts/_verify-massive-missions-once.ts
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { isCjConfigured } from "../lib/suppliers/cj/api";
import { searchCjProducts } from "../lib/suppliers/cj/search";
import {
  startBuyerScan,
  processBuyerScanBatch,
  listBuyerMissionHistory,
} from "../lib/buyer/scan";
import { runSupplierWorkers } from "../lib/suppliers/workers/jobs";
import { MISSION_SIZE_TARGETS } from "../lib/buyer/category-missions";
import { parseScanRequest } from "../lib/buyer/category-missions";

function mem() {
  const m = process.memoryUsage();
  return {
    rssMb: Math.round(m.rss / 1024 / 1024),
    heapUsedMb: Math.round(m.heapUsed / 1024 / 1024),
  };
}

async function dumpRun(id: string, label: string) {
  const run = await prisma.buyerScanRun.findUnique({ where: { id } });
  if (!run) {
    console.log(JSON.stringify({ label, missing: true }));
    return null;
  }
  const parsed = parseScanRequest(run.request);
  const out = {
    label,
    id: run.id,
    status: run.status,
    target: run.targetScanCount,
    scanned: run.scanned,
    kept: run.kept,
    filtered: run.filtered,
    checkpoint: run.checkpoint,
    stage: parsed.progress?.stage,
    stageLabel: parsed.progress?.stageLabel,
    missionSize: parsed.missionSize,
    result: parsed.result,
    error: run.error,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
  console.log(JSON.stringify(out, null, 2));
  return run;
}

async function main() {
  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
    hourLocal: new Date().getHours(),
    targets: MISSION_SIZE_TARGETS,
    memStart: mem(),
  };

  // --- CJ live ---
  const cjConfigured = await isCjConfigured();
  report.cjConfigured = cjConfigured;
  console.log("\n=== CJ LIVE SEARCH ===");
  console.log(JSON.stringify({ cjConfigured }));
  if (cjConfigured) {
    const t0 = Date.now();
    const search = await searchCjProducts({
      query: "Gaming Mouse",
      sortBy: "bestsellers",
      page: 1,
      pageSize: 20,
    });
    report.cjSearch = {
      ms: Date.now() - t0,
      count: search.products.length,
      totalPages: search.totalPages,
      sampleIds: search.products.slice(0, 3).map((p) => p.id),
      sampleTitles: search.products.slice(0, 3).map((p) => p.title?.slice(0, 60)),
    };
    console.log(JSON.stringify(report.cjSearch, null, 2));
  }

  // --- Existing DB evidence ---
  console.log("\n=== EXISTING SCAN RUNS (DB) ===");
  const existing = await prisma.buyerScanRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  report.existingRuns = existing.map((r) => {
    const p = parseScanRequest(r.request);
    return {
      id: r.id,
      status: r.status,
      target: r.targetScanCount,
      scanned: r.scanned,
      kept: r.kept,
      filtered: r.filtered,
      missionSize: p.missionSize,
      stage: p.progress?.stage,
      hasResult: !!p.result,
      result: p.result
        ? {
            analyzed: p.result.analyzed,
            discarded: p.result.discarded,
            candidates: p.result.candidates,
            imported: p.result.imported,
            published: p.result.published,
            approved: p.result.approved,
            rejected: p.result.rejected,
          }
        : null,
      createdAt: r.createdAt,
    };
  });
  console.log(JSON.stringify(report.existingRuns, null, 2));

  const jobs = await prisma.supplierJob.groupBy({
    by: ["type", "status"],
    _count: true,
  });
  report.supplierJobs = jobs;
  console.log("\n=== SUPPLIER JOBS ===");
  console.log(JSON.stringify(jobs, null, 2));

  const importByStatus = await prisma.importQueueItem.groupBy({
    by: ["status"],
    _count: true,
  });
  const cjProducts = await prisma.product.count({ where: { supplierName: "cj" } });
  const ranked = await prisma.buyerCandidate.count({ where: { status: "ranked" } });
  report.importQueue = importByStatus;
  report.cjProducts = cjProducts;
  report.rankedCandidates = ranked;
  console.log("\n=== IMPORT / PRODUCTS ===");
  console.log(JSON.stringify({ importByStatus, cjProducts, ranked }, null, 2));

  // --- TEST 1: Quick mission (target 500), drain limited batches ---
  console.log("\n=== TEST 1 QUICK START ===");
  const quickStart = Date.now();
  const quick = await startBuyerScan({
    categoryId: "gaming",
    missionSize: "quick",
    targetScanCount: 500,
    processInline: false,
    startedBy: "verify_quick",
  });
  await dumpRun(quick.id, "quick_after_start");

  const stages: Array<{ n: number; stage?: string; scanned: number; kept: number; filtered: number; ms: number; mem: ReturnType<typeof mem> }> = [];
  let batches = 0;
  const maxBatches = 8; // evidence, not full 500
  while (batches < maxBatches) {
    const t = Date.now();
    const drained = await runSupplierWorkers({
      concurrency: 1,
      limit: 1,
      types: ["buyer_scan_batch"],
    });
    batches += 1;
    const run = await prisma.buyerScanRun.findUnique({ where: { id: quick.id } });
    const p = parseScanRequest(run?.request);
    stages.push({
      n: batches,
      stage: p.progress?.stage,
      scanned: run?.scanned ?? 0,
      kept: run?.kept ?? 0,
      filtered: run?.filtered ?? 0,
      ms: Date.now() - t,
      mem: mem(),
    });
    console.log(JSON.stringify({ batch: batches, drained, ...stages[stages.length - 1] }));
    if (run?.status === "completed" || run?.status === "failed" || run?.status === "paused") break;
    if ((run?.scanned ?? 0) >= 500) break;
  }

  const quickAfter = await dumpRun(quick.id, "quick_after_batches");
  report.quick = {
    scanId: quick.id,
    batches,
    stages,
    elapsedMs: Date.now() - quickStart,
    final: quickAfter
      ? {
          status: quickAfter.status,
          scanned: quickAfter.scanned,
          kept: quickAfter.kept,
          filtered: quickAfter.filtered,
          target: quickAfter.targetScanCount,
          checkpoint: quickAfter.checkpoint,
        }
      : null,
  };

  // --- TEST 2: Standard target wiring (start only + 2 batches) ---
  console.log("\n=== TEST 2 STANDARD TARGET ===");
  const std = await startBuyerScan({
    categoryId: "gaming",
    missionSize: "standard",
    targetScanCount: 10_000,
    processInline: false,
    startedBy: "verify_standard",
  });
  await runSupplierWorkers({ concurrency: 1, limit: 2, types: ["buyer_scan_batch"] });
  const stdRun = await dumpRun(std.id, "standard_after_2_batches");
  report.standard = {
    scanId: std.id,
    targetIs10000: std.targetScanCount === 10_000,
    target: std.targetScanCount,
    after: stdRun
      ? {
          status: stdRun.status,
          scanned: stdRun.scanned,
          kept: stdRun.kept,
          filtered: stdRun.filtered,
          checkpoint: stdRun.checkpoint,
        }
      : null,
  };

  // --- TEST 3: Deep target wiring ---
  console.log("\n=== TEST 3 DEEP TARGET ===");
  const deep = await startBuyerScan({
    categoryId: "mobil",
    missionSize: "deep",
    targetScanCount: 100_000,
    processInline: false,
    startedBy: "verify_deep",
  });
  report.deep = {
    scanId: deep.id,
    targetIs100000: deep.targetScanCount === 100_000,
    target: deep.targetScanCount,
    status: deep.status,
  };
  console.log(JSON.stringify(report.deep));

  // --- TEST 4: Night pause logic (create night, one batch, check pause if daytime) ---
  console.log("\n=== TEST 4 NIGHT ===");
  const night = await startBuyerScan({
    categoryId: "gaming",
    missionSize: "night",
    targetScanCount: 1_000_000,
    processInline: false,
    startedBy: "verify_night",
  });
  await runSupplierWorkers({ concurrency: 1, limit: 1, types: ["buyer_scan_batch"] });
  const nightRun = await dumpRun(night.id, "night_after_1_batch");
  const hour = new Date().getHours();
  report.night = {
    scanId: night.id,
    target: night.targetScanCount,
    hourLocal: hour,
    expectPausedIfDaytime: hour >= 7 && hour < 22,
    after: nightRun
      ? {
          status: nightRun.status,
          scanned: nightRun.scanned,
          checkpoint: nightRun.checkpoint,
          stage: parseScanRequest(nightRun.request).progress?.stage,
        }
      : null,
  };

  // --- TEST 5: History ---
  console.log("\n=== TEST 5 HISTORY ===");
  const history = await listBuyerMissionHistory({ limit: 8 });
  report.history = history;
  console.log(JSON.stringify(history, null, 2));

  // --- TEST 8: Recovery — reuse standard scan checkpoint, process another batch ---
  console.log("\n=== TEST 8 RECOVERY (continue standard checkpoint) ===");
  const beforeCp = (await prisma.buyerScanRun.findUnique({ where: { id: std.id } }))?.checkpoint;
  // Ensure running (night may be paused; standard should be running)
  await prisma.buyerScanRun.update({
    where: { id: std.id },
    data: { status: "running" },
  });
  await runSupplierWorkers({ concurrency: 1, limit: 1, types: ["buyer_scan_batch"] });
  const afterRec = await prisma.buyerScanRun.findUnique({ where: { id: std.id } });
  report.recovery = {
    scanId: std.id,
    beforeCheckpoint: beforeCp,
    afterCheckpoint: afterRec?.checkpoint,
    scannedBefore: report.standard && (report.standard as { after?: { scanned?: number } }).after?.scanned,
    scannedAfter: afterRec?.scanned,
    advanced: (afterRec?.scanned ?? 0) > ((report.standard as { after?: { scanned?: number } })?.after?.scanned ?? 0),
  };
  console.log(JSON.stringify(report.recovery, null, 2));

  // Duplicate check on standard candidates
  const dupes = await prisma.$queryRawUnsafe<Array<{ fingerprint: string; c: bigint }>>(
    `SELECT fingerprint, COUNT(*) as c FROM "BuyerCandidate" WHERE "scanRunId" = $1 AND fingerprint IS NOT NULL GROUP BY fingerprint HAVING COUNT(*) > 1 LIMIT 10`,
    std.id
  ).catch(async () => {
    // sqlite/postgres variance — use groupBy
    const rows = await prisma.buyerCandidate.groupBy({
      by: ["fingerprint"],
      where: { scanRunId: std.id, fingerprint: { not: null } },
      _count: true,
    });
    return rows.filter((r) => r._count > 1).map((r) => ({ fingerprint: r.fingerprint || "", c: BigInt(r._count) }));
  });
  report.duplicateFingerprints = dupes.map((d) => ({
    fingerprint: d.fingerprint,
    count: Number(d.c),
  }));
  console.log("\n=== DUPLICATES ===");
  console.log(JSON.stringify(report.duplicateFingerprints));

  report.memEnd = mem();
  console.log("\n=== REPORT SUMMARY JSON ===");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error("VERIFY_FAILED", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
