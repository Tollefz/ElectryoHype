/**
 * Supplier job worker — parallel import/sync with idempotency, lock, retry, DLQ, cancel.
 */

import "server-only";

import {
  SupplierJobStatus,
  SupplierJobType,
  type Prisma,
  type SupplierJob,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processImportQueueItem } from "@/lib/suppliers/import-queue";
import { logError, logWarning } from "@/lib/utils/logger";
import { randomUUID } from "crypto";

const DEFAULT_LOCK_MS = 5 * 60_000;
/** Buyer batches often run 10–40 min (CJ + scoring). Short locks create false "stuck" jobs. */
const BUYER_SCAN_LOCK_MS = 90 * 60_000;
/** Requeue running buyer batches that never finished (crashed worker / killed process). */
const BUYER_STALE_RUNNING_MS = 90 * 60_000;
const GENERIC_STALE_RUNNING_MS = 15 * 60_000;
const STALE_LOCKED_MS = 10 * 60_000;

function lockMsForType(type: SupplierJobType): number {
  return type === SupplierJobType.buyer_scan_batch
    ? BUYER_SCAN_LOCK_MS
    : DEFAULT_LOCK_MS;
}

/**
 * Reset locked/running jobs left behind when a worker dies.
 * Safe for long buyer batches: only recovers by startedAt age (90 min), not by the
 * short historical 5-min lock expiry alone.
 */
export async function recoverStaleSupplierJobs(opts?: {
  types?: SupplierJobType[];
}): Promise<number> {
  const now = new Date();
  const buyerStaleBefore = new Date(now.getTime() - BUYER_STALE_RUNNING_MS);
  const genericStaleBefore = new Date(now.getTime() - GENERIC_STALE_RUNNING_MS);
  const lockedStaleBefore = new Date(now.getTime() - STALE_LOCKED_MS);

  const stuck = await prisma.supplierJob.findMany({
    where: {
      status: {
        in: [SupplierJobStatus.locked, SupplierJobStatus.running],
      },
      cancelledAt: null,
      ...(opts?.types?.length ? { type: { in: opts.types } } : {}),
      OR: [
        {
          status: SupplierJobStatus.locked,
          lockedAt: { lt: lockedStaleBefore },
        },
        {
          status: SupplierJobStatus.running,
          type: SupplierJobType.buyer_scan_batch,
          startedAt: { lt: buyerStaleBefore },
        },
        {
          status: SupplierJobStatus.running,
          type: { not: SupplierJobType.buyer_scan_batch },
          startedAt: { lt: genericStaleBefore },
        },
      ],
    },
    take: 40,
    select: { id: true, status: true, type: true, attempts: true },
  });

  for (const job of stuck) {
    let nextStatus: SupplierJobStatus = SupplierJobStatus.failed;
    let progressMessage = "Requeued after stale recovery";
    let lastError = `Stale ${job.status} recovered (worker timeout)`;

    if (job.type === SupplierJobType.buyer_scan_batch) {
      const full = await prisma.supplierJob.findUnique({
        where: { id: job.id },
        select: { payload: true },
      });
      const payload =
        full?.payload &&
        typeof full.payload === "object" &&
        !Array.isArray(full.payload)
          ? (full.payload as Record<string, unknown>)
          : {};
      const scanRunId =
        typeof payload.scanRunId === "string" ? payload.scanRunId : null;
      if (scanRunId) {
        const sibling = await prisma.supplierJob.findFirst({
          where: {
            id: { not: job.id },
            type: SupplierJobType.buyer_scan_batch,
            status: {
              in: [SupplierJobStatus.locked, SupplierJobStatus.running],
            },
            cancelledAt: null,
            payload: { path: ["scanRunId"], equals: scanRunId },
          },
          select: { id: true },
        });
        if (sibling) {
          // Another worker is already processing this scan — do not dual-write checkpoint
          nextStatus = SupplierJobStatus.dead;
          progressMessage = "Dead-letter: superseded by active batch";
          lastError = `Stale ${job.status} dropped — active batch ${sibling.id} owns scan`;
        }
      }
    }

    await prisma.supplierJob.update({
      where: { id: job.id },
      data: {
        status: nextStatus,
        lastError,
        lockedBy: null,
        lockExpiresAt: null,
        runAfter: now,
        finishedAt: nextStatus === SupplierJobStatus.dead ? now : undefined,
        deadAt: nextStatus === SupplierJobStatus.dead ? now : undefined,
        progressMessage,
      },
    });
    logWarning(
      `Recovered stale supplier job ${job.id} (${job.type}, was ${job.status} → ${nextStatus})`,
      "[supplier-job:stale]"
    );
  }

  return stuck.length;
}

export type EnqueueJobInput = {
  type: SupplierJobType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  supplierAccountId?: string | null;
  maxAttempts?: number;
  runAfter?: Date;
};

export async function enqueueSupplierJob(input: EnqueueJobInput): Promise<SupplierJob> {
  return prisma.supplierJob.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      type: input.type,
      status: SupplierJobStatus.pending,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload as Prisma.InputJsonValue,
      supplierAccountId: input.supplierAccountId || null,
      maxAttempts: input.maxAttempts ?? 5,
      runAfter: input.runAfter || new Date(),
    },
    update: {
      // Idempotent: if already terminal success, leave alone; otherwise requeue failed/dead.
      status: SupplierJobStatus.pending,
      runAfter: input.runAfter || new Date(),
      cancelledAt: null,
      deadAt: null,
      lastError: null,
      progress: 0,
      progressMessage: null,
    },
  });
}

export async function enqueueImportJobs(
  queueItemIds: string[],
  supplierAccountId?: string | null
): Promise<string[]> {
  const jobIds: string[] = [];
  for (const queueItemId of queueItemIds) {
    const job = await enqueueSupplierJob({
      type: SupplierJobType.import_item,
      idempotencyKey: `import_item:${queueItemId}`,
      payload: { queueItemId },
      supplierAccountId,
    });
    await prisma.importQueueItem.update({
      where: { id: queueItemId },
      data: { jobId: job.id },
    }).catch(() => undefined);
    jobIds.push(job.id);
  }
  return jobIds;
}

export async function cancelSupplierJob(jobId: string): Promise<boolean> {
  const job = await prisma.supplierJob.findUnique({ where: { id: jobId } });
  if (!job) return false;
  if (
    job.status === SupplierJobStatus.succeeded ||
    job.status === SupplierJobStatus.dead
  ) {
    return false;
  }
  await prisma.supplierJob.update({
    where: { id: jobId },
    data: {
      status: SupplierJobStatus.cancelled,
      cancelledAt: new Date(),
      finishedAt: new Date(),
      progressMessage: "Cancelled",
    },
  });
  return true;
}

async function claimJobs(opts: {
  workerId: string;
  limit: number;
  types?: SupplierJobType[];
  preferScanRunId?: string | null;
}): Promise<SupplierJob[]> {
  const now = new Date();
  const fetchLimit = opts.preferScanRunId
    ? Math.max(opts.limit * 8, 24)
    : opts.limit;

  const candidates = await prisma.supplierJob.findMany({
    where: {
      status: { in: [SupplierJobStatus.pending, SupplierJobStatus.failed] },
      runAfter: { lte: now },
      cancelledAt: null,
      ...(opts.types?.length ? { type: { in: opts.types } } : {}),
      OR: [
        { lockExpiresAt: null },
        { lockExpiresAt: { lt: now } },
      ],
    },
    orderBy: { runAfter: "asc" },
    take: fetchLimit,
  });

  let ordered = candidates;
  if (opts.preferScanRunId) {
    const prefer: SupplierJob[] = [];
    const rest: SupplierJob[] = [];
    for (const job of candidates) {
      const payload =
        job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
          ? (job.payload as Record<string, unknown>)
          : {};
      if (payload.scanRunId === opts.preferScanRunId) prefer.push(job);
      else rest.push(job);
    }
    ordered = [...prefer, ...rest];
  }

  // Never claim a second buyer_scan_batch while one is already locked/running for that scan
  const activeBuyerScans = new Set<string>();
  const activeBuyer = await prisma.supplierJob.findMany({
    where: {
      type: SupplierJobType.buyer_scan_batch,
      status: { in: [SupplierJobStatus.locked, SupplierJobStatus.running] },
      cancelledAt: null,
    },
    select: { payload: true },
    take: 50,
  });
  for (const row of activeBuyer) {
    const payload =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    if (typeof payload.scanRunId === "string") {
      activeBuyerScans.add(payload.scanRunId);
    }
  }

  const claimed: SupplierJob[] = [];
  for (const job of ordered) {
    if (job.type === SupplierJobType.buyer_scan_batch) {
      const payload =
        job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
          ? (job.payload as Record<string, unknown>)
          : {};
      const scanRunId =
        typeof payload.scanRunId === "string" ? payload.scanRunId : null;
      if (scanRunId && activeBuyerScans.has(scanRunId)) {
        continue;
      }
    }
    const lockExpiresAt = new Date(Date.now() + lockMsForType(job.type));
    const result = await prisma.supplierJob.updateMany({
      where: {
        id: job.id,
        status: { in: [SupplierJobStatus.pending, SupplierJobStatus.failed] },
        OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: now } }],
      },
      data: {
        status: SupplierJobStatus.locked,
        lockedBy: opts.workerId,
        lockedAt: now,
        lockExpiresAt,
      },
    });
    if (result.count === 1) {
      const locked = await prisma.supplierJob.findUnique({ where: { id: job.id } });
      if (locked) {
        claimed.push(locked);
        if (locked.type === SupplierJobType.buyer_scan_batch) {
          const payload =
            locked.payload &&
            typeof locked.payload === "object" &&
            !Array.isArray(locked.payload)
              ? (locked.payload as Record<string, unknown>)
              : {};
          if (typeof payload.scanRunId === "string") {
            activeBuyerScans.add(payload.scanRunId);
          }
        }
      }
    }
    if (claimed.length >= opts.limit) break;
  }
  return claimed;
}

async function executeJob(job: SupplierJob): Promise<unknown> {
  const payload = (job.payload || {}) as Record<string, unknown>;

  const runningLockExpires = new Date(
    Date.now() + lockMsForType(job.type)
  );
  await prisma.supplierJob.update({
    where: { id: job.id },
    data: {
      status: SupplierJobStatus.running,
      startedAt: new Date(),
      attempts: { increment: 1 },
      progress: 0.05,
      progressMessage: "Starting",
      lockExpiresAt: runningLockExpires,
    },
  });

  // Cooperative cancel check
  const fresh = await prisma.supplierJob.findUnique({ where: { id: job.id } });
  if (fresh?.cancelledAt || fresh?.status === SupplierJobStatus.cancelled) {
    throw new Error("Job cancelled");
  }

  switch (job.type) {
    case SupplierJobType.import_item: {
      const queueItemId = String(payload.queueItemId || "");
      if (!queueItemId) throw new Error("Missing queueItemId");
      await prisma.supplierJob.update({
        where: { id: job.id },
        data: { progress: 0.2, progressMessage: "Import pipeline" },
      });
      const result = await processImportQueueItem(queueItemId);
      return result;
    }
    case SupplierJobType.sync_account: {
      const { runCatalogSync } = await import("@/lib/suppliers/sync/engine");
      const { getCatalogProvider } = await import("@/lib/suppliers/registry");
      const supplierId = String(payload.supplierId || "");
      const provider = getCatalogProvider(supplierId as "cj");
      await prisma.supplierJob.update({
        where: { id: job.id },
        data: { progress: 0.3, progressMessage: "Catalog sync" },
      });
      return runCatalogSync({
        provider,
        applySafeUpdates: true,
        supplierAccountId: job.supplierAccountId,
      });
    }
    case SupplierJobType.buyer_scan_batch: {
      const scanRunId = String(payload.scanRunId || "");
      if (!scanRunId) throw new Error("Missing scanRunId");
      await prisma.supplierJob.update({
        where: { id: job.id },
        data: { progress: 0.2, progressMessage: "Digital Buyer batch" },
      });
      const { processBuyerScanBatch } = await import("@/lib/buyer/scan");
      return processBuyerScanBatch(scanRunId);
    }
    default:
      throw new Error(`Unsupported job type: ${job.type}`);
  }
}

async function finalizeSuccess(jobId: string, result: unknown) {
  await prisma.supplierJob.update({
    where: { id: jobId },
    data: {
      status: SupplierJobStatus.succeeded,
      progress: 1,
      progressMessage: "Done",
      result: result as Prisma.InputJsonValue,
      finishedAt: new Date(),
      lockedBy: null,
      lockExpiresAt: null,
    },
  });
}

async function finalizeFailure(job: SupplierJob, error: unknown) {
  const message = error instanceof Error ? error.message : "Job failed";
  const attempts = job.attempts + 1;
  const dead = attempts >= job.maxAttempts || message === "Job cancelled";

  if (message === "Job cancelled") {
    await prisma.supplierJob.update({
      where: { id: job.id },
      data: {
        status: SupplierJobStatus.cancelled,
        lastError: message,
        finishedAt: new Date(),
        lockedBy: null,
        lockExpiresAt: null,
      },
    });
    return;
  }

  if (dead) {
    await prisma.supplierJob.update({
      where: { id: job.id },
      data: {
        status: SupplierJobStatus.dead,
        lastError: message,
        deadAt: new Date(),
        finishedAt: new Date(),
        lockedBy: null,
        lockExpiresAt: null,
        progressMessage: "Dead-letter",
      },
    });
    return;
  }

  const backoffMs = Math.min(30 * 60_000, 2 ** attempts * 1000);
  await prisma.supplierJob.update({
    where: { id: job.id },
    data: {
      status: SupplierJobStatus.failed,
      lastError: message,
      runAfter: new Date(Date.now() + backoffMs),
      lockedBy: null,
      lockExpiresAt: null,
      progressMessage: `Retry after ${Math.round(backoffMs / 1000)}s`,
    },
  });
}

/**
 * Drain pending jobs with limited parallelism.
 */
export async function runSupplierWorkers(opts?: {
  concurrency?: number;
  limit?: number;
  workerId?: string;
  types?: SupplierJobType[];
  preferScanRunId?: string | null;
}): Promise<{
  workerId: string;
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
}> {
  const workerId = opts?.workerId || `worker-${randomUUID().slice(0, 8)}`;
  const concurrency = Math.max(1, opts?.concurrency ?? 3);
  const limit = opts?.limit ?? concurrency * 2;

  await recoverStaleSupplierJobs({ types: opts?.types }).catch((err) => {
    logError(err, "[supplier-job:stale]");
  });

  const claimed = await claimJobs({
    workerId,
    limit,
    types: opts?.types,
    preferScanRunId: opts?.preferScanRunId,
  });

  let succeeded = 0;
  let failed = 0;
  let dead = 0;

  async function runOne(job: SupplierJob) {
    try {
      const result = await executeJob(job);
      await finalizeSuccess(job.id, result);
      succeeded += 1;
    } catch (error) {
      logError(error, `[supplier-job:${job.id}]`);
      await finalizeFailure(job, error);
      const updated = await prisma.supplierJob.findUnique({ where: { id: job.id } });
      if (updated?.status === SupplierJobStatus.dead) dead += 1;
      else failed += 1;
    }
  }

  // Simple pool
  const queue = [...claimed];
  const runners: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    runners.push(
      (async () => {
        while (queue.length) {
          const job = queue.shift();
          if (!job) break;
          await runOne(job);
        }
      })()
    );
  }
  await Promise.all(runners);

  return {
    workerId,
    claimed: claimed.length,
    succeeded,
    failed,
    dead,
  };
}

export async function getWorkerObservability() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    byStatus,
    activeLocks,
    deadLast24h,
    succeededLast24h,
    recentImports,
    recentJobs,
    buyerScan,
    buyerBatches,
  ] = await Promise.all([
    prisma.supplierJob.groupBy({ by: ["status"], _count: true }),
    prisma.supplierJob.count({
      where: {
        status: { in: [SupplierJobStatus.locked, SupplierJobStatus.running] },
        lockExpiresAt: { gt: new Date() },
      },
    }),
    prisma.supplierJob.count({
      where: { status: SupplierJobStatus.dead, deadAt: { gte: since } },
    }),
    prisma.supplierJob.count({
      where: { status: SupplierJobStatus.succeeded, finishedAt: { gte: since } },
    }),
    prisma.supplierJob.findMany({
      where: {
        type: SupplierJobType.import_item,
        status: SupplierJobStatus.succeeded,
        finishedAt: { gte: since },
        startedAt: { not: null },
      },
      select: { startedAt: true, finishedAt: true },
      take: 200,
    }),
    prisma.supplierJob.findMany({
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        progressMessage: true,
        attempts: true,
        lastError: true,
        startedAt: true,
        finishedAt: true,
        updatedAt: true,
        runAfter: true,
        payload: true,
      },
    }),
    prisma.buyerScanRun.findFirst({
      orderBy: { createdAt: "desc" },
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
      },
    }),
    prisma.supplierJob.count({
      where: {
        type: SupplierJobType.buyer_scan_batch,
        status: {
          in: [
            SupplierJobStatus.pending,
            SupplierJobStatus.locked,
            SupplierJobStatus.running,
            SupplierJobStatus.failed,
          ],
        },
      },
    }),
  ]);

  const durations = recentImports
    .filter((j) => j.startedAt && j.finishedAt)
    .map((j) => j.finishedAt!.getTime() - j.startedAt!.getTime());
  const avgImportMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  let productsPerMin: number | null = null;
  let etaMinutes: number | null = null;
  let stage: string | null = null;
  let missionName: string | null = null;
  try {
    const { getBuyerHuntWorkerStatus } = await import("@/lib/buyer/buyer-worker");
    const huntWorker = await getBuyerHuntWorkerStatus();
    if (huntWorker.productsPerMin != null && huntWorker.productsPerMin > 0) {
      productsPerMin = huntWorker.productsPerMin;
    }
  } catch {
    /* optional */
  }
  if (
    productsPerMin == null &&
    buyerScan?.startedAt &&
    buyerScan.scanned > 0
  ) {
    const elapsedMin = Math.max(
      0.1,
      (Date.now() - new Date(buyerScan.startedAt).getTime()) / 60000
    );
    productsPerMin = Math.round(buyerScan.scanned / elapsedMin);
  }
  if (productsPerMin != null && productsPerMin > 0 && buyerScan?.status === "running") {
    const remaining = Math.max(
      0,
      (buyerScan.targetScanCount || 0) - buyerScan.scanned
    );
    etaMinutes = Math.ceil(remaining / productsPerMin);
  }
  const req =
    buyerScan?.request && typeof buyerScan.request === "object"
      ? (buyerScan.request as Record<string, unknown>)
      : {};
  const progress =
    req.progress && typeof req.progress === "object"
      ? (req.progress as Record<string, unknown>)
      : null;
  stage =
    (typeof progress?.stageLabel === "string" && progress.stageLabel) ||
    (typeof progress?.stage === "string" && progress.stage) ||
    buyerScan?.status ||
    null;
  missionName =
    (typeof req.missionLabel === "string" && req.missionLabel) ||
    (typeof req.categoryId === "string" && `Mission ${req.categoryId}`) ||
    (buyerScan ? `Scan ${buyerScan.id.slice(-6)}` : null);

  const cp =
    buyerScan?.checkpoint && typeof buyerScan.checkpoint === "object"
      ? (buyerScan.checkpoint as Record<string, unknown>)
      : {};

  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
    activeWorkers: activeLocks,
    deadLast24h,
    succeededLast24h,
    avgImportMs,
    queueLength:
      (byStatus.find((r) => r.status === SupplierJobStatus.pending)?._count || 0) +
      (byStatus.find((r) => r.status === SupplierJobStatus.failed)?._count || 0),
    recentJobs: recentJobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      progress: j.progress,
      progressMessage: j.progressMessage,
      attempts: j.attempts,
      lastError: j.lastError,
      startedAt: j.startedAt?.toISOString() || null,
      finishedAt: j.finishedAt?.toISOString() || null,
      updatedAt: j.updatedAt.toISOString(),
      runAfter: j.runAfter?.toISOString() || null,
    })),
    buyer: buyerScan
      ? {
          id: buyerScan.id,
          missionName,
          status: buyerScan.status,
          stage,
          scanned: buyerScan.scanned,
          kept: buyerScan.kept,
          filtered: buyerScan.filtered,
          target: buyerScan.targetScanCount,
          productsPerMin,
          etaMinutes,
          checkpoint: {
            page: typeof cp.page === "number" ? cp.page : null,
            seedIdx: typeof cp.seedIdx === "number" ? cp.seedIdx : null,
            supplierIdx: typeof cp.supplierIdx === "number" ? cp.supplierIdx : null,
          },
          pendingBatches: buyerBatches,
          error: buyerScan.error,
          updatedAt: buyerScan.updatedAt.toISOString(),
        }
      : null,
  };
}
