/**
 * Buyer Hunt Worker — drains buyer_scan_batch independently of the admin UI.
 *
 * See BUYER_WORKER.md for architecture.
 * See WORKER_STOPPED_ROOT_CAUSE.md for heartbeat / Stopped semantics.
 */

import "server-only";

import {
  SupplierJobStatus,
  SupplierJobType,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { runSupplierWorkers } from "@/lib/suppliers/workers/jobs";
import { logInfo, logWarning, logError } from "@/lib/utils/logger";

export const BUYER_HUNT_WORKER_SETTING_KEY = "buyer_hunt_worker";

const IDLE_WARN_MS = 60_000;
const STALE_PENDING_MS = 5 * 60_000;
const SAMPLE_WINDOW_MS = 10 * 60_000;
const METRICS_LOOKBACK_MS = 60 * 60_000;
const MAX_SAMPLES = 60;
/** Mission Control: no heartbeat within this window ⇒ Stopped */
const HEARTBEAT_STALE_MS = 60_000;
/** Refresh lastTickAt while a long batch is in flight */
const HEARTBEAT_PULSE_MS = 15_000;

export type BuyerHuntScanSample = {
  t: number;
  scanned: number;
  scanRunId: string;
};

export type BuyerHuntWorkerException = {
  at: string;
  message: string;
  stack: string | null;
  workerId: string | null;
};

export type BuyerHuntLastBatch = {
  at: string;
  workerId: string;
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
  scanRunId: string | null;
  durationMs: number;
};

export type BuyerHuntWorkerMetrics = {
  pendingJobs: number;
  claimedJobs: number;
  jobsPerMinute: number;
  avgWaitMs: number | null;
  avgRuntimeMs: number | null;
  productsPerMin: number | null;
  lastActiveWorker: string | null;
  lastActiveAt: string | null;
  lastTickAt: string | null;
  idleMs: number;
  scanRunId: string | null;
  oldestPending: { id: string; waitMs: number; createdAt: string } | null;
  /** Derived: running | idle | stopped */
  status: "running" | "idle" | "stopped";
  warnings: string[];
  samples: BuyerHuntScanSample[];
  lastException: BuyerHuntWorkerException | null;
  lastBatch: BuyerHuntLastBatch | null;
  tickAgeMs: number;
};

type PersistedState = {
  lastActiveWorker: string | null;
  lastActiveAt: string | null;
  lastTickAt: string | null;
  lastClaimAt: string | null;
  samples: BuyerHuntScanSample[];
  lastIdleWarnAt: string | null;
  lastStaleWarnAt: string | null;
  lastWatchdogAt: string | null;
  lastException: BuyerHuntWorkerException | null;
  lastBatch: BuyerHuntLastBatch | null;
};

function emptyState(): PersistedState {
  return {
    lastActiveWorker: null,
    lastActiveAt: null,
    lastTickAt: null,
    lastClaimAt: null,
    samples: [],
    lastIdleWarnAt: null,
    lastStaleWarnAt: null,
    lastWatchdogAt: null,
    lastException: null,
    lastBatch: null,
  };
}

function asException(v: unknown): BuyerHuntWorkerException | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== "string" || typeof o.message !== "string") return null;
  return {
    at: o.at,
    message: o.message,
    stack: typeof o.stack === "string" ? o.stack : null,
    workerId: typeof o.workerId === "string" ? o.workerId : null,
  };
}

function asLastBatch(v: unknown): BuyerHuntLastBatch | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== "string" || typeof o.workerId !== "string") return null;
  return {
    at: o.at,
    workerId: o.workerId,
    claimed: Number(o.claimed) || 0,
    succeeded: Number(o.succeeded) || 0,
    failed: Number(o.failed) || 0,
    dead: Number(o.dead) || 0,
    scanRunId: typeof o.scanRunId === "string" ? o.scanRunId : null,
    durationMs: Number(o.durationMs) || 0,
  };
}

function asState(value: unknown): PersistedState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyState();
  }
  const v = value as Record<string, unknown>;
  const samples = Array.isArray(v.samples)
    ? v.samples
        .filter(
          (s): s is BuyerHuntScanSample =>
            !!s &&
            typeof s === "object" &&
            typeof (s as BuyerHuntScanSample).t === "number" &&
            typeof (s as BuyerHuntScanSample).scanned === "number" &&
            typeof (s as BuyerHuntScanSample).scanRunId === "string"
        )
        .slice(-MAX_SAMPLES)
    : [];
  return {
    lastActiveWorker:
      typeof v.lastActiveWorker === "string" ? v.lastActiveWorker : null,
    lastActiveAt: typeof v.lastActiveAt === "string" ? v.lastActiveAt : null,
    lastTickAt: typeof v.lastTickAt === "string" ? v.lastTickAt : null,
    lastClaimAt: typeof v.lastClaimAt === "string" ? v.lastClaimAt : null,
    samples,
    lastIdleWarnAt:
      typeof v.lastIdleWarnAt === "string" ? v.lastIdleWarnAt : null,
    lastStaleWarnAt:
      typeof v.lastStaleWarnAt === "string" ? v.lastStaleWarnAt : null,
    lastWatchdogAt:
      typeof v.lastWatchdogAt === "string" ? v.lastWatchdogAt : null,
    lastException: asException(v.lastException),
    lastBatch: asLastBatch(v.lastBatch),
  };
}

async function loadState(): Promise<PersistedState> {
  const row = await prisma.setting.findUnique({
    where: { key: BUYER_HUNT_WORKER_SETTING_KEY },
  });
  return asState(row?.value);
}

async function saveState(state: PersistedState): Promise<void> {
  const value = state as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: BUYER_HUNT_WORKER_SETTING_KEY },
    create: {
      key: BUYER_HUNT_WORKER_SETTING_KEY,
      value,
    },
    update: { value },
  });
}

/**
 * Mid-batch / mid-tick pulse so long drains do not look like a dead worker.
 * Only touches heartbeat fields — never clears samples or lastBatch.
 */
async function pulseHeartbeat(workerId: string): Promise<void> {
  const state = await loadState();
  const iso = new Date().toISOString();
  state.lastTickAt = iso;
  state.lastActiveWorker = workerId;
  await saveState(state);
  console.log(`Heartbeat pulse worker=${workerId}`);
}

function productsPerMinFromSamples(
  samples: BuyerHuntScanSample[],
  scanRunId: string | null,
  now: number
): number | null {
  if (!scanRunId) return null;
  const window = samples.filter(
    (s) => s.scanRunId === scanRunId && now - s.t <= SAMPLE_WINDOW_MS
  );
  if (window.length < 2) return null;
  const first = window[0]!;
  const last = window[window.length - 1]!;
  const elapsedMin = (last.t - first.t) / 60_000;
  if (elapsedMin < 0.05) return null;
  const delta = last.scanned - first.scanned;
  if (delta <= 0) return 0;
  return Math.round(delta / elapsedMin);
}

async function computeQueueAndTiming(now: Date): Promise<{
  pendingJobs: number;
  claimedJobs: number;
  jobsPerMinute: number;
  avgWaitMs: number | null;
  avgRuntimeMs: number | null;
  oldestPending: { id: string; waitMs: number; createdAt: string } | null;
  activeScan: {
    id: string;
    scanned: number;
    status: string;
  } | null;
  /** Why claim might be blocked despite pending > 0 */
  claimBlockReason: string | null;
}> {
  const lookback = new Date(now.getTime() - METRICS_LOOKBACK_MS);
  const since10m = new Date(now.getTime() - SAMPLE_WINDOW_MS);

  const [
    pendingJobs,
    claimedJobs,
    recentSucceeded,
    oldestPendingRow,
    activeScan,
    succeededLast10m,
    runningSibling,
  ] = await Promise.all([
    prisma.supplierJob.count({
      where: {
        type: SupplierJobType.buyer_scan_batch,
        status: {
          in: [SupplierJobStatus.pending, SupplierJobStatus.failed],
        },
        cancelledAt: null,
      },
    }),
    prisma.supplierJob.count({
      where: {
        type: SupplierJobType.buyer_scan_batch,
        status: {
          in: [SupplierJobStatus.locked, SupplierJobStatus.running],
        },
      },
    }),
    prisma.supplierJob.findMany({
      where: {
        type: SupplierJobType.buyer_scan_batch,
        status: SupplierJobStatus.succeeded,
        finishedAt: { gte: lookback },
        startedAt: { not: null },
      },
      select: { createdAt: true, startedAt: true, finishedAt: true },
      take: 200,
      orderBy: { finishedAt: "desc" },
    }),
    prisma.supplierJob.findFirst({
      where: {
        type: SupplierJobType.buyer_scan_batch,
        status: {
          in: [SupplierJobStatus.pending, SupplierJobStatus.failed],
        },
        cancelledAt: null,
        runAfter: { lte: now },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, runAfter: true },
    }),
    prisma.buyerScanRun.findFirst({
      where: { status: { in: ["running", "queued"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, scanned: true, status: true },
    }),
    prisma.supplierJob.count({
      where: {
        type: SupplierJobType.buyer_scan_batch,
        status: SupplierJobStatus.succeeded,
        finishedAt: { gte: since10m },
      },
    }),
    prisma.supplierJob.findFirst({
      where: {
        type: SupplierJobType.buyer_scan_batch,
        status: {
          in: [SupplierJobStatus.locked, SupplierJobStatus.running],
        },
        cancelledAt: null,
      },
      select: { id: true, status: true, lockedBy: true, startedAt: true },
    }),
  ]);

  const waits = recentSucceeded
    .filter((j) => j.startedAt)
    .map((j) => j.startedAt!.getTime() - j.createdAt.getTime())
    .filter((ms) => ms >= 0);
  const runtimes = recentSucceeded
    .filter((j) => j.startedAt && j.finishedAt)
    .map((j) => j.finishedAt!.getTime() - j.startedAt!.getTime())
    .filter((ms) => ms >= 0);

  const avg = (xs: number[]) =>
    xs.length > 0
      ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
      : null;

  let claimBlockReason: string | null = null;
  if (pendingJobs > 0 && claimedJobs > 0 && runningSibling) {
    claimBlockReason = `Active ${runningSibling.status} job ${runningSibling.id} (lockedBy=${runningSibling.lockedBy || "—"}) blocks concurrent claim for same scan`;
  } else if (pendingJobs > 0 && !oldestPendingRow) {
    claimBlockReason =
      "Pending jobs exist but none are claimable yet (runAfter in the future)";
  }

  return {
    pendingJobs,
    claimedJobs,
    jobsPerMinute: Math.round((succeededLast10m / 10) * 100) / 100,
    avgWaitMs: avg(waits),
    avgRuntimeMs: avg(runtimes),
    oldestPending: oldestPendingRow
      ? {
          id: oldestPendingRow.id,
          waitMs: now.getTime() - oldestPendingRow.createdAt.getTime(),
          createdAt: oldestPendingRow.createdAt.toISOString(),
        }
      : null,
    activeScan,
    claimBlockReason,
  };
}

function deriveStatus(input: {
  tickAgeMs: number;
  pendingJobs: number;
  claimedJobs: number;
}): "running" | "idle" | "stopped" {
  // Stopped = no fresh heartbeat (process dead OR stuck without pulse)
  if (input.tickAgeMs >= HEARTBEAT_STALE_MS) return "stopped";
  // Live heartbeat + work in queue or in flight ⇒ Running
  if (input.claimedJobs > 0 || input.pendingJobs > 0) return "running";
  // Live heartbeat, empty queue ⇒ Idle (will resume when jobs appear)
  return "idle";
}

/**
 * Internal watchdog: pending work but heartbeat stale > 60s.
 */
async function runWatchdogIfNeeded(
  state: PersistedState,
  queue: Awaited<ReturnType<typeof computeQueueAndTiming>>,
  tickAgeMs: number,
  now: Date
): Promise<{ state: PersistedState; warnings: string[]; fired: boolean }> {
  const warnings: string[] = [];
  if (!(queue.pendingJobs > 0 && tickAgeMs >= HEARTBEAT_STALE_MS)) {
    return { state, warnings, fired: false };
  }

  const lastWatch = state.lastWatchdogAt
    ? new Date(state.lastWatchdogAt).getTime()
    : 0;
  // Throttle watchdog logs to once per 60s
  if (now.getTime() - lastWatch < HEARTBEAT_STALE_MS) {
    return { state, warnings, fired: false };
  }

  const why: string[] = [
    `pendingJobs=${queue.pendingJobs}`,
    `claimedJobs=${queue.claimedJobs}`,
    `tickAgeSec=${Math.round(tickAgeMs / 1000)}`,
    `lastTickAt=${state.lastTickAt || "null"}`,
    `lastActiveAt=${state.lastActiveAt || "null"}`,
  ];
  if (queue.claimBlockReason) why.push(`claimBlock=${queue.claimBlockReason}`);
  if (!state.lastTickAt) {
    why.push(
      "root=no_heartbeat_ever (dedicated worker / Inngest tick not persisting state)"
    );
  } else {
    why.push(
      "root=heartbeat_stale (worker process not pulsing — exited, hung before pulse, or cron not running)"
    );
  }

  const lines = [
    "[buyer-hunt-worker:watchdog] pending>0 and heartbeat stale ≥60s",
    `why: ${why.join("; ")}`,
    `lastBatch: ${
      state.lastBatch ? JSON.stringify(state.lastBatch) : "none"
    }`,
    `lastException: ${
      state.lastException
        ? `${state.lastException.at} ${state.lastException.message}`
        : "none"
    }`,
    `lastException.stack: ${state.lastException?.stack || "none"}`,
  ];
  for (const line of lines) {
    logWarning(line, "[buyer-hunt-worker:watchdog]");
    console.error(line);
  }

  warnings.push(
    `Watchdog: ${queue.pendingJobs} pending job(s) but heartbeat stale ${Math.round(tickAgeMs / 1000)}s — ${why[why.length - 1]}`
  );
  state.lastWatchdogAt = now.toISOString();
  return { state, warnings, fired: true };
}

function buildMetrics(
  state: PersistedState,
  queue: Awaited<ReturnType<typeof computeQueueAndTiming>>,
  now: Date,
  extraWarnings: string[] = []
): BuyerHuntWorkerMetrics {
  const warnings = [...extraWarnings];
  const lastActiveMs = state.lastActiveAt
    ? new Date(state.lastActiveAt).getTime()
    : state.lastTickAt
      ? new Date(state.lastTickAt).getTime()
      : 0;
  const idleMs =
    lastActiveMs > 0
      ? Math.max(0, now.getTime() - lastActiveMs)
      : queue.pendingJobs > 0
        ? now.getTime()
        : 0;

  if (
    queue.pendingJobs > 0 &&
    queue.claimedJobs === 0 &&
    idleMs >= IDLE_WARN_MS
  ) {
    warnings.push(
      `Buyer Hunt Worker idle ${Math.round(idleMs / 1000)}s while ${queue.pendingJobs} pending job(s) wait`
    );
  }

  if (queue.oldestPending && queue.oldestPending.waitMs >= STALE_PENDING_MS) {
    const waitMin = Math.round(queue.oldestPending.waitMs / 60_000);
    warnings.push(
      `Oldest pending buyer_scan_batch ${queue.oldestPending.id} waited ${waitMin} min`
    );
  }

  if (queue.claimBlockReason) {
    warnings.push(queue.claimBlockReason);
  }

  const productsPerMin = productsPerMinFromSamples(
    state.samples,
    queue.activeScan?.id ?? null,
    now.getTime()
  );

  const tickAgeMs = state.lastTickAt
    ? now.getTime() - new Date(state.lastTickAt).getTime()
    : Number.POSITIVE_INFINITY;

  const status = deriveStatus({
    tickAgeMs,
    pendingJobs: queue.pendingJobs,
    claimedJobs: queue.claimedJobs,
  });

  return {
    pendingJobs: queue.pendingJobs,
    claimedJobs: queue.claimedJobs,
    jobsPerMinute: queue.jobsPerMinute,
    avgWaitMs: queue.avgWaitMs,
    avgRuntimeMs: queue.avgRuntimeMs,
    productsPerMin,
    lastActiveWorker: state.lastActiveWorker,
    lastActiveAt: state.lastActiveAt,
    lastTickAt: state.lastTickAt,
    idleMs,
    scanRunId: queue.activeScan?.id ?? null,
    oldestPending: queue.oldestPending,
    status,
    warnings,
    samples: state.samples,
    lastException: state.lastException,
    lastBatch: state.lastBatch,
    tickAgeMs: Number.isFinite(tickAgeMs) ? tickAgeMs : -1,
  };
}

/**
 * Read-only status for dashboards. Never drains the queue.
 * Runs watchdog logging when pending>0 and heartbeat is stale.
 */
export async function getBuyerHuntWorkerStatus(): Promise<BuyerHuntWorkerMetrics> {
  const now = new Date();
  let state = await loadState();
  const queue = await computeQueueAndTiming(now);
  const tickAgeMs = state.lastTickAt
    ? now.getTime() - new Date(state.lastTickAt).getTime()
    : Number.POSITIVE_INFINITY;

  const watched = await runWatchdogIfNeeded(state, queue, tickAgeMs, now);
  state = watched.state;
  if (watched.fired) {
    await saveState(state);
  }

  return buildMetrics(state, queue, now, watched.warnings);
}

async function persistException(
  workerId: string,
  err: unknown
): Promise<void> {
  const state = await loadState();
  const error = err instanceof Error ? err : new Error(String(err));
  state.lastException = {
    at: new Date().toISOString(),
    message: error.message,
    stack: error.stack || null,
    workerId,
  };
  await saveState(state);
}

/**
 * One drain cycle + metrics/heartbeat. Safe to call from cron, Inngest, or the loop.
 */
export async function tickBuyerHuntWorker(opts?: {
  workerId?: string;
  concurrency?: number;
  limit?: number;
  preferScanRunId?: string | null;
}): Promise<{
  workerId: string;
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
  metrics: BuyerHuntWorkerMetrics;
}> {
  const tickStartedMs = Date.now();
  const workerId =
    opts?.workerId || `buyer-hunt-${randomUUID().slice(0, 8)}`;

  // Immediate pulse so Mission Control sees Running before a long drain
  await pulseHeartbeat(workerId);

  // Prefer publish / republish drain when a job is waiting — UI only creates the job.
  // Soft lock on Setting (buyer_publish_job | buyer_republish_job) — no SupplierJob SQL claim.
  try {
    const { getBuyerPublishJob, tickBuyerPublishJob } = await import(
      "@/lib/buyer/publish-job"
    );
    for (const kind of ["republish", "publish"] as const) {
      const pub = await getBuyerPublishJob(kind);
      if (pub?.status === "running" && !pub.busy) {
        console.log(`[buyer-publish] Publish job found`, {
          kind,
          jobId: pub.id,
          cursor: pub.cursor,
          batch: `${pub.currentBatch}/${pub.batchTotal}`,
        });
        console.log("[buyer-publish] Batch found", {
          currentBatch: pub.currentBatch,
          batchSize: pub.batchSize,
        });
        console.log(
          `[buyer-publish] Claimed → Started kind=${kind} jobId=${pub.id}`
        );
        await tickBuyerPublishJob({ workerId, kind });
        console.log(
          `[buyer-publish] Finished tick kind=${kind} jobId=${pub.id}`
        );
        await pulseHeartbeat(workerId);
        break; // one publish lane per tick
      }
    }
  } catch (err) {
    logError(err, "[buyer-hunt-worker:publish]");
  }

  const active = await prisma.buyerScanRun.findFirst({
    where: { status: "running" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      scanned: true,
      targetScanCount: true,
    },
  });

  const batchBudget =
    opts?.limit ??
    ((active?.targetScanCount || 0) >= 10_000
      ? 8
      : (active?.targetScanCount || 0) >= 500
        ? 5
        : 3);

  const pulse = setInterval(() => {
    void pulseHeartbeat(workerId).catch((err) => {
      logError(err, "[buyer-hunt-worker:pulse]");
    });
  }, HEARTBEAT_PULSE_MS);

  let drain: {
    workerId: string;
    claimed: number;
    succeeded: number;
    failed: number;
    dead: number;
  };
  try {
    drain = await runSupplierWorkers({
      workerId,
      concurrency: opts?.concurrency ?? 1,
      limit: batchBudget,
      types: [SupplierJobType.buyer_scan_batch],
      preferScanRunId: opts?.preferScanRunId ?? active?.id ?? null,
    });
  } catch (err) {
    clearInterval(pulse);
    await persistException(workerId, err);
    throw err;
  } finally {
    clearInterval(pulse);
  }

  if (drain.claimed > 0) {
    console.log("Claimed job");
    console.log("Processing batch");
  }

  const state = await loadState();
  // Heartbeat = end of tick (NOT start) — root cause fix for false Stopped
  const tickIso = new Date().toISOString();
  state.lastTickAt = tickIso;
  state.lastActiveWorker = drain.workerId;

  if (drain.claimed > 0 || drain.succeeded > 0) {
    state.lastActiveAt = tickIso;
    state.lastClaimAt = tickIso;
  }

  state.lastBatch = {
    at: tickIso,
    workerId: drain.workerId,
    claimed: drain.claimed,
    succeeded: drain.succeeded,
    failed: drain.failed,
    dead: drain.dead,
    scanRunId: active?.id ?? null,
    durationMs: Date.now() - tickStartedMs,
  };

  const scanAfter = active
    ? await prisma.buyerScanRun.findUnique({
        where: { id: active.id },
        select: { id: true, scanned: true, status: true },
      })
    : null;

  if (scanAfter && scanAfter.status === "running") {
    const sample: BuyerHuntScanSample = {
      t: Date.now(),
      scanned: scanAfter.scanned,
      scanRunId: scanAfter.id,
    };
    state.samples = [...state.samples, sample]
      .filter((s) => Date.now() - s.t <= SAMPLE_WINDOW_MS * 2)
      .slice(-MAX_SAMPLES);
  }

  const queue = await computeQueueAndTiming(new Date());
  const warnExtra: string[] = [];

  const activityAnchor = state.lastActiveAt || state.lastClaimAt;
  const idleMs = activityAnchor
    ? Date.now() - new Date(activityAnchor).getTime()
    : queue.pendingJobs > 0
      ? IDLE_WARN_MS
      : 0;

  if (
    queue.pendingJobs > 0 &&
    idleMs >= IDLE_WARN_MS &&
    drain.claimed === 0 &&
    queue.claimedJobs === 0
  ) {
    const lastWarn = state.lastIdleWarnAt
      ? new Date(state.lastIdleWarnAt).getTime()
      : 0;
    if (Date.now() - lastWarn >= IDLE_WARN_MS) {
      const msg = `Buyer Hunt Worker idle ${Math.round(idleMs / 1000)}s while ${queue.pendingJobs} pending buyer_scan_batch job(s) exist${
        queue.claimBlockReason ? ` (${queue.claimBlockReason})` : ""
      }`;
      logWarning(msg, "[buyer-hunt-worker]");
      warnExtra.push(msg);
      state.lastIdleWarnAt = tickIso;
    }
  }

  if (queue.oldestPending && queue.oldestPending.waitMs >= STALE_PENDING_MS) {
    const lastWarn = state.lastStaleWarnAt
      ? new Date(state.lastStaleWarnAt).getTime()
      : 0;
    if (Date.now() - lastWarn >= IDLE_WARN_MS) {
      const waitSec = Math.round(queue.oldestPending.waitMs / 1000);
      const msg = `Oldest pending buyer_scan_batch job ${queue.oldestPending.id} has waited ${waitSec}s (${Math.round(waitSec / 60)} min)`;
      logWarning(msg, "[buyer-hunt-worker]");
      warnExtra.push(msg);
      state.lastStaleWarnAt = tickIso;
    }
  }

  const tickAgeMs = 0; // just pulsed
  const watched = await runWatchdogIfNeeded(state, queue, tickAgeMs, new Date());
  Object.assign(state, watched.state);

  await saveState(state);
  const metrics = buildMetrics(state, queue, new Date(), [
    ...warnExtra,
    ...watched.warnings,
  ]);

  console.log(
    `Heartbeat pending=${metrics.pendingJobs} claimed=${drain.claimed} succeeded=${drain.succeeded} status=${metrics.status}`
  );

  if (drain.claimed > 0) {
    logInfo(
      `drained claimed=${drain.claimed} succeeded=${drain.succeeded} failed=${drain.failed} pending=${metrics.pendingJobs}`,
      `[buyer-hunt-worker:${drain.workerId}]`
    );
  }

  return { ...drain, metrics };
}

/**
 * Long-running loop for a dedicated process (local / VPS).
 * Sleeps briefly when idle; tightens when work was claimed or pending.
 * Never exits on tick errors — only on AbortSignal.
 */
export async function runBuyerHuntWorkerLoop(opts?: {
  signal?: AbortSignal;
  idleSleepMs?: number;
  busySleepMs?: number;
  workerId?: string;
}): Promise<void> {
  const idleSleepMs = opts?.idleSleepMs ?? 2_000;
  const busySleepMs = opts?.busySleepMs ?? 250;
  const baseId = opts?.workerId || `buyer-hunt-loop-${randomUUID().slice(0, 8)}`;

  console.log(`Worker loop started id=${baseId}`);
  logInfo("Buyer Hunt Worker loop started", `[buyer-hunt-worker:${baseId}]`);

  while (!opts?.signal?.aborted) {
    try {
      const result = await tickBuyerHuntWorker({
        workerId: `${baseId}-${randomUUID().slice(0, 4)}`,
      });
      let publishRunning = false;
      try {
        const { getBuyerPublishJob } = await import("@/lib/buyer/publish-job");
        const pub = await getBuyerPublishJob("publish");
        const repub = await getBuyerPublishJob("republish");
        publishRunning =
          pub?.status === "running" || repub?.status === "running";
      } catch {
        /* ignore */
      }
      const sleepMs =
        result.claimed > 0 ||
        result.metrics.pendingJobs > 0 ||
        result.metrics.claimedJobs > 0 ||
        publishRunning
          ? busySleepMs
          : idleSleepMs;
      await sleep(sleepMs, opts?.signal);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : null;
      logWarning(message, `[buyer-hunt-worker:${baseId}:tick-error]`);
      if (stack) console.error(stack);
      await persistException(baseId, err).catch(() => undefined);
      // Keep looping — never exit on a single tick failure
      await sleep(idleSleepMs, opts?.signal);
    }
  }

  logInfo("Buyer Hunt Worker loop stopped", `[buyer-hunt-worker:${baseId}]`);
  console.log(`Worker loop stopped id=${baseId}`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
