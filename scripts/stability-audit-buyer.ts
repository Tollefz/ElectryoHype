/**
 * Stability audit for AI Product Buyer — read-only.
 * Documents worker, queue, discovery, candidates, ranks, layers.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 60 * 60_000);
}

async function main() {
  const now = new Date();
  const since12 = hoursAgo(12);
  const since24 = hoursAgo(24);

  const setting = await prisma.setting.findUnique({
    where: { key: "buyer_hunt_worker" },
  });
  const workerState = asObj(setting?.value);

  const activeScan = await prisma.buyerScanRun.findFirst({
    where: { status: { in: ["running", "queued", "paused"] } },
    orderBy: { createdAt: "desc" },
  });

  const latestScan = await prisma.buyerScanRun.findFirst({
    orderBy: { createdAt: "desc" },
  });

  const scan = activeScan || latestScan;
  const scanId = scan?.id || null;

  const jobs24 = await prisma.supplierJob.findMany({
    where: {
      type: "buyer_scan_batch",
      createdAt: { gte: since24 },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      runAfter: true,
      updatedAt: true,
      lastError: true,
      attempts: true,
      payload: true,
      lockedBy: true,
    },
  });

  const pendingNow = await prisma.supplierJob.findMany({
    where: {
      type: "buyer_scan_batch",
      status: { in: ["pending", "failed", "locked", "running"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      runAfter: true,
      startedAt: true,
      updatedAt: true,
      lastError: true,
      attempts: true,
      lockedBy: true,
      idempotencyKey: true,
    },
  });

  const byStatus: Record<string, number> = {};
  for (const j of jobs24) {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  }

  // Stall detection: pending older than 5/30/60 min
  const pendingAges = pendingNow
    .filter((j) => j.status === "pending" || j.status === "failed")
    .map((j) => ({
      id: j.id,
      status: j.status,
      ageMin: Math.round((now.getTime() - j.createdAt.getTime()) / 60_000),
      waitRunAfterMin: Math.round(
        (now.getTime() - (j.runAfter?.getTime() || j.createdAt.getTime())) /
          60_000
      ),
      attempts: j.attempts,
      error: j.lastError?.slice(0, 120) || null,
    }));

  // Throughput windows
  const succeeded = jobs24.filter((j) => j.status === "succeeded" && j.finishedAt);
  const lastHour = succeeded.filter(
    (j) => j.finishedAt && j.finishedAt >= hoursAgo(1)
  );
  const last2h = succeeded.filter(
    (j) => j.finishedAt && j.finishedAt >= hoursAgo(2)
  );

  let avgWaitMs: number | null = null;
  let avgRuntimeMs: number | null = null;
  const waits = succeeded
    .filter((j) => j.startedAt)
    .map((j) => j.startedAt!.getTime() - j.createdAt.getTime())
    .filter((ms) => ms >= 0);
  const runtimes = succeeded
    .filter((j) => j.startedAt && j.finishedAt)
    .map((j) => j.finishedAt!.getTime() - j.startedAt!.getTime())
    .filter((ms) => ms >= 0);
  if (waits.length)
    avgWaitMs = Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
  if (runtimes.length)
    avgRuntimeMs = Math.round(
      runtimes.reduce((a, b) => a + b, 0) / runtimes.length
    );

  // Candidate growth
  let candTotal = 0;
  let cand1h = 0;
  let cand12h = 0;
  let candByHour: Array<{ hour: string; n: number }> = [];
  let rankStats: {
    withRank: number;
    nullRank: number;
    staleRankSuspect: number;
    sampleStale: Array<{ id: string; rank: number | null; updatedAt: string; createdAt: string; scanRunId: string | null }>;
  } | null = null;
  let discovery: unknown = null;

  if (scanId) {
    candTotal = await prisma.buyerCandidate.count({
      where: { scanRunId: scanId },
    });
    cand1h = await prisma.buyerCandidate.count({
      where: { scanRunId: scanId, createdAt: { gte: hoursAgo(1) } },
    });
    cand12h = await prisma.buyerCandidate.count({
      where: { scanRunId: scanId, createdAt: { gte: since12 } },
    });

    const recentCand = await prisma.buyerCandidate.findMany({
      where: { scanRunId: scanId, createdAt: { gte: since12 } },
      select: { createdAt: true },
      take: 5000,
    });
    const buckets = new Map<string, number>();
    for (const c of recentCand) {
      const d = new Date(c.createdAt);
      d.setMinutes(0, 0, 0);
      const k = d.toISOString();
      buckets.set(k, (buckets.get(k) || 0) + 1);
    }
    candByHour = [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, n]) => ({ hour, n }));

    // Rank reuse suspicion: candidates with rank set but updatedAt far from createdAt
    // OR same supplierProductId across scans with identical rank
    const ranked = await prisma.buyerCandidate.findMany({
      where: { scanRunId: scanId, status: "ranked" },
      select: {
        id: true,
        rank: true,
        createdAt: true,
        updatedAt: true,
        scanRunId: true,
        supplier: true,
        supplierProductId: true,
        overallScore: true,
        shopMatchPct: true,
      },
      take: 500,
      orderBy: { rank: "asc" },
    });
    const withRank = ranked.filter((r) => r.rank != null).length;
    const nullRank = ranked.filter((r) => r.rank == null).length;

    // Cross-scan rank reuse: find products that exist in older scans with same rank
    const productIds = ranked
      .slice(0, 80)
      .map((r) => r.supplierProductId)
      .filter(Boolean) as string[];
    const older = await prisma.buyerCandidate.findMany({
      where: {
        supplierProductId: { in: productIds },
        scanRunId: { not: scanId },
        rank: { not: null },
      },
      select: {
        supplierProductId: true,
        rank: true,
        scanRunId: true,
        updatedAt: true,
      },
      take: 400,
    });
    const olderMap = new Map<string, typeof older>();
    for (const o of older) {
      const k = o.supplierProductId || "";
      const list = olderMap.get(k) || [];
      list.push(o);
      olderMap.set(k, list);
    }
    const sampleStale: Array<{
      id: string;
      rank: number | null;
      updatedAt: string;
      createdAt: string;
      scanRunId: string | null;
      reuse?: boolean;
      olderRank?: number | null;
    }> = [];
    let staleRankSuspect = 0;
    for (const r of ranked.slice(0, 80)) {
      const prev = olderMap.get(r.supplierProductId || "") || [];
      const sameRank = prev.find((p) => p.rank === r.rank);
      // created and updated far apart while rank present from upsert reuse
      const ageGap =
        r.updatedAt.getTime() - r.createdAt.getTime() > 60 * 60_000;
      if (sameRank || (ageGap && r.rank != null && r.createdAt < since12)) {
        staleRankSuspect += 1;
        if (sampleStale.length < 8) {
          sampleStale.push({
            id: r.id,
            rank: r.rank,
            updatedAt: r.updatedAt.toISOString(),
            createdAt: r.createdAt.toISOString(),
            scanRunId: r.scanRunId,
            reuse: Boolean(sameRank),
            olderRank: sameRank?.rank ?? null,
          });
        }
      }
    }
    rankStats = { withRank, nullRank, staleRankSuspect, sampleStale };

    const req = asObj(scan?.request);
    const progress = asObj(req.progress);
    discovery = {
      plan: progress.discoveryPlan || null,
      validation: req.discoveryValidation
        ? {
            decisionCount: Array.isArray(
              asObj(req.discoveryValidation).decisions
            )
              ? (asObj(req.discoveryValidation).decisions as unknown[]).length
              : 0,
            lastDecisions: (
              (asObj(req.discoveryValidation).decisions as unknown[]) || []
            )
              .slice(-8)
              .map((d) => {
                const o = asObj(d);
                return {
                  at: o.at,
                  familyId: o.familyId,
                  label: o.label,
                  groupLabel: o.groupLabel,
                  switched: o.switchedFamily,
                };
              }),
          }
        : null,
      checkpoint: asObj(scan?.checkpoint).discovery || null,
    };
  }

  // Products/min from scan
  let productsPerMin: number | null = null;
  if (scan?.startedAt && scan.scanned > 0) {
    const elapsedMin = Math.max(
      0.1,
      (now.getTime() - scan.startedAt.getTime()) / 60_000
    );
    productsPerMin = Math.round((scan.scanned / elapsedMin) * 10) / 10;
  }

  // Memory / DNA / Feedback settings
  const [mem, dna, fb] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "buyer_ai_memory" } }),
    prisma.setting.findUnique({ where: { key: "buyer_store_dna" } }),
    prisma.setting.findUnique({ where: { key: "buyer_store_feedback" } }),
  ]);

  const memObj = asObj(mem?.value);
  const dnaObj = asObj(dna?.value);
  const fbObj = asObj(fb?.value);

  // Economic flags sample
  const econSample = scanId
    ? await prisma.buyerCandidate.findMany({
        where: { scanRunId: scanId, status: "ranked" },
        select: { pricing: true },
        take: 100,
        orderBy: { createdAt: "desc" },
      })
    : [];
  let belowMargin = 0;
  let fxStale = 0;
  let econFail = 0;
  for (const c of econSample) {
    const pricing = asObj(c.pricing);
    const economic = asObj(pricing.economic);
    const flags = Array.isArray(economic.flags)
      ? economic.flags.map(String)
      : [];
    const margin =
      Number(pricing.estimatedMarginPct ?? pricing.marginPct ?? economic.marginPct);
    if (Number.isFinite(margin) && margin < 35) belowMargin += 1;
    if (flags.includes("fx_stale") || asObj(economic.fx).stale === true)
      fxStale += 1;
    if (flags.includes("economic_control_failed")) econFail += 1;
  }

  // Job gaps: time between successive succeeded finishes
  const gaps: number[] = [];
  for (let i = 1; i < succeeded.length; i++) {
    const a = succeeded[i - 1]!.finishedAt!.getTime();
    const b = succeeded[i]!.finishedAt!.getTime();
    gaps.push(b - a);
  }
  const gapOver5min = gaps.filter((g) => g > 5 * 60_000).length;
  const gapOver30min = gaps.filter((g) => g > 30 * 60_000).length;
  const maxGapMin =
    gaps.length > 0
      ? Math.round(Math.max(...gaps) / 60_000)
      : null;

  const lastTickAt = workerState.lastTickAt
    ? String(workerState.lastTickAt)
    : null;
  const lastActiveAt = workerState.lastActiveAt
    ? String(workerState.lastActiveAt)
    : null;
  const tickAgeSec = lastTickAt
    ? Math.round((now.getTime() - new Date(lastTickAt).getTime()) / 1000)
    : null;

  const report = {
    generatedAt: now.toISOString(),
    worker: {
      lastTickAt,
      lastActiveAt,
      lastActiveWorker: workerState.lastActiveWorker || null,
      tickAgeSec,
      samples: Array.isArray(workerState.samples)
        ? (workerState.samples as unknown[]).length
        : 0,
      heartbeatOk: tickAgeSec != null && tickAgeSec < 120,
      likelyRunning: tickAgeSec != null && tickAgeSec < 90,
    },
    scan: scan
      ? {
          id: scan.id,
          status: scan.status,
          scanned: scan.scanned,
          kept: scan.kept,
          filtered: scan.filtered,
          target: scan.targetScanCount,
          startedAt: scan.startedAt?.toISOString() || null,
          updatedAt: scan.updatedAt.toISOString(),
          error: scan.error,
          productsPerMinWallClock: productsPerMin,
          ageHours: scan.startedAt
            ? Math.round(
                ((now.getTime() - scan.startedAt.getTime()) / 3600_000) * 10
              ) / 10
            : null,
        }
      : null,
    queue: {
      byStatus24h: byStatus,
      pendingNow: pendingNow.length,
      pendingDetail: pendingAges.slice(0, 15),
      stuckOver5min: pendingAges.filter((p) => p.ageMin >= 5).length,
      stuckOver30min: pendingAges.filter((p) => p.ageMin >= 30).length,
      succeededLastHour: lastHour.length,
      succeededLast2h: last2h.length,
      jobsPerMinLastHour: Math.round((lastHour.length / 60) * 100) / 100,
      avgWaitMs,
      avgRuntimeMs,
      gapOver5min,
      gapOver30min,
      maxGapMin,
    },
    candidates: {
      total: candTotal,
      lastHour: cand1h,
      last12h: cand12h,
      byHour: candByHour,
    },
    ranks: rankStats,
    discovery,
    layers: {
      memory: {
        rebuiltAt: memObj.rebuiltAt || null,
        patternCount: Array.isArray(memObj.patterns)
          ? (memObj.patterns as unknown[]).length
          : null,
        stats: memObj.stats || null,
      },
      dna: {
        rebuiltAt: dnaObj.rebuiltAt || null,
        productCount: dnaObj.productCount || null,
        topTraits: Array.isArray(dnaObj.traits)
          ? (dnaObj.traits as Array<{ label?: string; pct?: number }>)
              .slice(0, 6)
              .map((t) => ({ label: t.label, pct: t.pct }))
          : [],
      },
      feedback: {
        rebuiltAt: fbObj.rebuiltAt || null,
        experienceCount: Array.isArray(fbObj.experiences)
          ? (fbObj.experiences as unknown[]).length
          : null,
        top: Array.isArray(fbObj.topPerforming)
          ? (fbObj.topPerforming as Array<{ label?: string; confidence?: number }>)
              .slice(0, 5)
              .map((e) => ({ label: e.label, confidence: e.confidence }))
          : [],
      },
    },
    economy: {
      sampleSize: econSample.length,
      belowMargin35: belowMargin,
      fxStale,
      economicControlFailed: econFail,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
