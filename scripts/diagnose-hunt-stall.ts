/**
 * Hunt stall diagnosis — last 12h activity, discovery vs worker.
 * Read-only. No algorithm changes.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { matchFamily } from "../lib/intelligence/families";

const prisma = new PrismaClient();

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

async function main() {
  const now = new Date();
  const since12h = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  const runs = await prisma.buyerScanRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      scanned: true,
      kept: true,
      filtered: true,
      targetScanCount: true,
      startedAt: true,
      finishedAt: true,
      updatedAt: true,
      error: true,
      checkpoint: true,
      request: true,
      createdAt: true,
    },
  });

  const active =
    runs.find((r) => r.status === "running" || r.status === "paused") ||
    runs[0];

  // Worker jobs
  const jobsSinceMidnight = await prisma.supplierJob.findMany({
    where: {
      createdAt: { gte: midnight },
      type: { in: ["buyer_scan_batch", "buyer_scan"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      status: true,
      attempts: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      finishedAt: true,
      payload: true,
      idempotencyKey: true,
    },
  }).catch(async () => {
    // schema may use different model name
    return [] as Array<Record<string, unknown>>;
  });

  // Try alternate job table shapes
  let jobTableNote = "supplierJob";
  let jobs: Array<{
    id: string;
    type: string;
    status: string;
    attempts: number | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    payload: unknown;
    idempotencyKey: string | null;
  }> = [];

  try {
    jobs = (await prisma.supplierJob.findMany({
      where: { createdAt: { gte: since12h } },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        type: true,
        status: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        finishedAt: true,
        payload: true,
        idempotencyKey: true,
      },
    })) as typeof jobs;
  } catch (e) {
    jobTableNote = `supplierJob error: ${e instanceof Error ? e.message : e}`;
  }

  const buyerJobs = jobs.filter(
    (j) =>
      String(j.type).includes("buyer") ||
      String(j.idempotencyKey || "").includes("buyer")
  );

  // Candidate growth over time (hourly buckets last 12h for this run)
  const runId = active?.id;
  let candidates: Array<{
    createdAt: Date;
    updatedAt: Date;
    status: string;
    title: string | null;
  }> = [];
  if (runId) {
    candidates = await prisma.buyerCandidate.findMany({
      where: { scanRunId: runId },
      select: {
        createdAt: true,
        updatedAt: true,
        status: true,
        title: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  // Hourly created / updated activity
  const hours: Array<{
    hour: string;
    created: number;
    updatedOnly: number;
    keptCreated: number;
    filteredCreated: number;
    topFamiliesCreated: Array<[string, number]>;
  }> = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
    const end = new Date(now.getTime() - i * 60 * 60 * 1000);
    const created = candidates.filter(
      (c) => c.createdAt >= start && c.createdAt < end
    );
    const updatedOnly = candidates.filter(
      (c) =>
        c.updatedAt >= start &&
        c.updatedAt < end &&
        !(c.createdAt >= start && c.createdAt < end)
    );
    const fam: Record<string, number> = {};
    for (const c of created) {
      if (c.status === "filtered") continue;
      const f = matchFamily(c.title || "") || "other";
      fam[f] = (fam[f] || 0) + 1;
    }
    hours.push({
      hour: `${start.toISOString().slice(11, 16)}–${end.toISOString().slice(11, 16)} Z`,
      created: created.length,
      updatedOnly: updatedOnly.length,
      keptCreated: created.filter((c) => c.status !== "filtered").length,
      filteredCreated: created.filter((c) => c.status === "filtered").length,
      topFamiliesCreated: Object.entries(fam)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    });
  }

  // Growth 11h window
  const t11 = new Date(now.getTime() - 11 * 60 * 60 * 1000);
  const keptBefore = candidates.filter(
    (c) => c.status !== "filtered" && c.createdAt < t11
  ).length;
  const keptNow = candidates.filter((c) => c.status !== "filtered").length;
  const createdLast11h = candidates.filter((c) => c.createdAt >= t11).length;
  const keptCreatedLast11h = candidates.filter(
    (c) => c.status !== "filtered" && c.createdAt >= t11
  ).length;

  const cp = asObj(active?.checkpoint);
  const discovery = asObj(cp.discovery);
  const req = asObj(active?.request);
  const progress = asObj(req.progress);
  const discoveryPlan = asObj(progress.discoveryPlan);
  const discVal = asObj(req.discoveryValidation);
  const decisions = Array.isArray(discVal.decisions)
    ? (discVal.decisions as Array<Record<string, unknown>>)
    : [];
  const decisionsSinceMidnight = decisions.filter((d) => {
    const at = typeof d.at === "string" ? new Date(d.at) : null;
    return at && at >= midnight;
  });
  const decisionsLast12h = decisions.filter((d) => {
    const at = typeof d.at === "string" ? new Date(d.at) : null;
    return at && at >= since12h;
  });

  // Job timing analysis
  const jobTimings = buyerJobs.map((j) => {
    const start = j.startedAt || j.createdAt;
    const end = j.finishedAt || (j.status === "running" ? now : j.updatedAt);
    const durMs = end.getTime() - start.getTime();
    const payload = asObj(j.payload);
    return {
      id: j.id,
      type: j.type,
      status: j.status,
      attempts: j.attempts,
      lastError: j.lastError,
      createdAt: j.createdAt.toISOString(),
      startedAt: j.startedAt?.toISOString() || null,
      finishedAt: j.finishedAt?.toISOString() || null,
      durationSec: Math.round(durMs / 1000),
      scanRunId: payload.scanRunId || null,
      idempotencyKey: j.idempotencyKey,
    };
  });

  const byStatus: Record<string, number> = {};
  for (const j of buyerJobs) {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  }

  const retryish = buyerJobs.filter(
    (j) =>
      (j.attempts || 0) > 1 ||
      /rate|429|timeout|ECONN|backoff|throttl/i.test(
        String(j.lastError || "")
      )
  );

  // Recent candidate family mix (last 50 created)
  const recent50 = candidates.slice(-50);
  const recentFam: Record<string, number> = {};
  for (const c of recent50) {
    const f = matchFamily(c.title || "") || "other";
    recentFam[`${c.status}:${f}`] = (recentFam[`${c.status}:${f}`] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        now: now.toISOString(),
        midnight: midnight.toISOString(),
        since12h: since12h.toISOString(),
        activeRun: active
          ? {
              id: active.id,
              status: active.status,
              scanned: active.scanned,
              kept: active.kept,
              filtered: active.filtered,
              target: active.targetScanCount,
              startedAt: active.startedAt,
              updatedAt: active.updatedAt,
              finishedAt: active.finishedAt,
              error: active.error,
              ageHours: active.startedAt
                ? Math.round(
                    ((now.getTime() - new Date(active.startedAt).getTime()) /
                      3600000) *
                      10
                  ) / 10
                : null,
              staleMinutes: active.updatedAt
                ? Math.round(
                    (now.getTime() - new Date(active.updatedAt).getTime()) /
                      60000
                  )
                : null,
            }
          : null,
        checkpoint: {
          page: cp.page,
          seedIdx: cp.seedIdx,
          supplierIdx: cp.supplierIdx,
          seenKeysLen: Array.isArray(cp.seenKeys) ? cp.seenKeys.length : null,
          discovery: {
            currentFamilyId: discovery.currentFamilyId || null,
            currentQuery: discovery.currentQuery || null,
            pagesOnCurrent: discovery.pagesOnCurrent || null,
            emptyStreak: discovery.emptyStreak || null,
            familyScanCounts: discovery.familyScanCounts || {},
            groupScanCounts: discovery.groupScanCounts || {},
            recentFamilies: discovery.recentFamilies || [],
          },
        },
        progress: {
          stage: progress.stage || null,
          stageLabel: progress.stageLabel || null,
          seedQuery: progress.seedQuery || null,
          supplierLabel: progress.supplierLabel || null,
          current: progress.current || null,
          total: progress.total || null,
          kept: progress.kept || null,
          filtered: progress.filtered || null,
          discoveryPlanNow: discoveryPlan.now || null,
          discoveryPlanQueue: Array.isArray(discoveryPlan.queue)
            ? (discoveryPlan.queue as unknown[]).slice(0, 6)
            : [],
          groupSharePct: discoveryPlan.groupSharePct || [],
        },
        decisions: {
          total: decisions.length,
          sinceMidnight: decisionsSinceMidnight.length,
          last12h: decisionsLast12h.length,
          recent: decisionsLast12h.slice(-15).map((d) => ({
            at: d.at,
            familyId: d.familyId,
            label: d.label,
            query: d.query,
            needScore: d.needScore,
          })),
        },
        growth: {
          keptBefore11h: keptBefore,
          keptNow,
          deltaKept: keptNow - keptBefore,
          createdLast11h,
          keptCreatedLast11h,
          totalCandidates: candidates.length,
        },
        hourly: hours,
        recent50Fam: Object.entries(recentFam)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15),
        jobs: {
          table: jobTableNote,
          totalLast12h: jobs.length,
          buyerLast12h: buyerJobs.length,
          byStatus,
          retryishCount: retryish.length,
          retryishSample: retryish.slice(0, 10).map((j) => ({
            type: j.type,
            status: j.status,
            attempts: j.attempts,
            lastError: j.lastError,
            createdAt: j.createdAt.toISOString(),
          })),
          timings: jobTimings.slice(-40),
          midnightBuyerJobs: jobsSinceMidnight.length,
        },
        otherRuns: runs.slice(0, 5).map((r) => ({
          id: r.id,
          status: r.status,
          scanned: r.scanned,
          kept: r.kept,
          updatedAt: r.updatedAt,
          error: r.error,
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
