/**
 * Worker soak / stability monitor (2–4h).
 *
 * Samples queue + heartbeat every INTERVAL_MS. Does not drain the queue —
 * expects `npm run worker:buyer-hunt` (or Inngest) to be running.
 *
 * Usage:
 *   set SOAK_HOURS=2
 *   npx ts-node ... scripts/worker-soak-monitor.ts
 *
 * Writes: scripts/_worker-soak-report.json
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient, SupplierJobStatus, SupplierJobType } from "@prisma/client";
import { getBuyerHuntWorkerStatus } from "../lib/buyer/buyer-worker";

const p = new PrismaClient();

const SOAK_HOURS = Math.max(0.05, Math.min(4, Number(process.env.SOAK_HOURS || 2)));
const INTERVAL_MS = Math.max(10_000, Number(process.env.SOAK_INTERVAL_MS || 30_000));
const OUT = join(process.cwd(), "scripts", "_worker-soak-report.json");

type Sample = {
  at: string;
  status: string;
  pending: number;
  claimed: number;
  tickAgeSec: number | null;
  lastTickAt: string | null;
  productsPerMin: number | null;
  oldestPendingWaitSec: number | null;
  scanScanned: number | null;
  warnings: string[];
  watchdog: boolean;
};

type Report = {
  startedAt: string;
  endedAt: string | null;
  soakHoursRequested: number;
  intervalMs: number;
  samples: Sample[];
  summary: Record<string, unknown> | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function takeSample(): Promise<Sample> {
  const m = await getBuyerHuntWorkerStatus();
  const scan = m.scanRunId
    ? await p.buyerScanRun.findUnique({
        where: { id: m.scanRunId },
        select: { scanned: true },
      })
    : null;
  return {
    at: new Date().toISOString(),
    status: m.status,
    pending: m.pendingJobs,
    claimed: m.claimedJobs,
    tickAgeSec: m.tickAgeMs >= 0 ? Math.round(m.tickAgeMs / 1000) : null,
    lastTickAt: m.lastTickAt,
    productsPerMin: m.productsPerMin,
    oldestPendingWaitSec: m.oldestPending
      ? Math.round(m.oldestPending.waitMs / 1000)
      : null,
    scanScanned: scan?.scanned ?? null,
    warnings: m.warnings,
    watchdog: m.warnings.some((w) => w.startsWith("Watchdog:")),
  };
}

function summarize(report: Report): Record<string, unknown> {
  const samples = report.samples;
  if (!samples.length) return { error: "no samples" };

  const start = new Date(samples[0]!.at).getTime();
  const end = new Date(samples[samples.length - 1]!.at).getTime();
  const elapsedH = (end - start) / 3_600_000;

  const scanned0 = samples.find((s) => s.scanScanned != null)?.scanScanned;
  const scannedN = [...samples].reverse().find((s) => s.scanScanned != null)
    ?.scanScanned;
  const scannedDelta =
    scanned0 != null && scannedN != null ? scannedN - scanned0 : null;
  const throughputPerMin =
    scannedDelta != null && elapsedH > 0
      ? Math.round((scannedDelta / (elapsedH * 60)) * 100) / 100
      : null;

  const waits = samples
    .map((s) => s.oldestPendingWaitSec)
    .filter((n): n is number => n != null);
  const maxWaitSec = waits.length ? Math.max(...waits) : 0;
  const avgWaitSec = waits.length
    ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
    : 0;

  const statusCounts: Record<string, number> = {};
  for (const s of samples) {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  }

  const heartbeatChanges = samples.filter(
    (s, i) => i === 0 || s.lastTickAt !== samples[i - 1]!.lastTickAt
  ).length;

  const gaps: Array<{ from: string; to: string; gapSec: number }> = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!;
    const cur = samples[i]!;
    if (!prev.lastTickAt || !cur.lastTickAt) continue;
    const gap =
      (new Date(cur.lastTickAt).getTime() -
        new Date(prev.lastTickAt).getTime()) /
      1000;
    // Between samples we expect pulses; flag if tickAge blew past 90s on a sample
    if ((cur.tickAgeSec ?? 0) >= 90 && cur.pending + cur.claimed > 0) {
      gaps.push({
        from: prev.at,
        to: cur.at,
        gapSec: cur.tickAgeSec ?? gap,
      });
    }
  }

  const idleWithWork = samples.filter(
    (s) => s.status === "idle" && (s.pending > 0 || s.claimed > 0)
  ).length;
  const stoppedWithWork = samples.filter(
    (s) => s.status === "stopped" && (s.pending > 0 || s.claimed > 0)
  ).length;
  const watchdogFires = samples.filter((s) => s.watchdog).length;

  return {
    elapsedHours: Math.round(elapsedH * 100) / 100,
    sampleCount: samples.length,
    statusCounts,
    avgThroughputProductsPerMin: throughputPerMin,
    scannedDelta,
    maxOldestPendingWaitSec: maxWaitSec,
    avgOldestPendingWaitSec: avgWaitSec,
    heartbeatUpdatesObserved: heartbeatChanges,
    inactivityGapsOver90sWithWork: gaps,
    idleWhileWorkCount: idleWithWork,
    stoppedWhileWorkCount: stoppedWithWork,
    watchdogSampleCount: watchdogFires,
    productionReadyCandidate:
      stoppedWithWork === 0 &&
      idleWithWork === 0 &&
      gaps.length === 0 &&
      elapsedH >= 1.5,
  };
}

async function main() {
  const durationMs = SOAK_HOURS * 3_600_000;
  const report: Report = {
    startedAt: new Date().toISOString(),
    endedAt: null,
    soakHoursRequested: SOAK_HOURS,
    intervalMs: INTERVAL_MS,
    samples: [],
    summary: null,
  };

  console.log(
    `Soak start ${report.startedAt} hours=${SOAK_HOURS} intervalMs=${INTERVAL_MS}`
  );

  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    try {
      const sample = await takeSample();
      report.samples.push(sample);
      report.summary = summarize(report);
      writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
      console.log(
        `[soak] ${sample.at} status=${sample.status} pending=${sample.pending} claimed=${sample.claimed} tickAge=${sample.tickAgeSec}s scanned=${sample.scanScanned}`
      );
    } catch (err) {
      console.error("[soak] sample error", err);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(INTERVAL_MS, remaining));
  }

  // Final job stats for the soak window
  const since = new Date(report.startedAt);
  const [succeeded, claimedApprox] = await Promise.all([
    p.supplierJob.count({
      where: {
        type: SupplierJobType.buyer_scan_batch,
        status: SupplierJobStatus.succeeded,
        finishedAt: { gte: since },
      },
    }),
    p.supplierJob.count({
      where: {
        type: SupplierJobType.buyer_scan_batch,
        startedAt: { gte: since },
      },
    }),
  ]);

  report.endedAt = new Date().toISOString();
  report.summary = {
    ...summarize(report),
    jobsSucceededInWindow: succeeded,
    jobsStartedInWindow: claimedApprox,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log("Soak complete", JSON.stringify(report.summary, null, 2));
  console.log("Wrote", OUT);
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
