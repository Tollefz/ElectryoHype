/**
 * Order Worker — drains automation queue independently of the admin UI.
 * Same philosophy as Buyer Hunt Worker: UI observes, worker owns process.
 */

import "server-only";

import { randomUUID } from "crypto";
import type { OrderAutomationPhase } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { advanceOrder, advanceOrderBrain } from "@/lib/orders/order-engine";
import type { AutomationPhase } from "@/lib/orders/order-state-machine";
import { logInfo, logError } from "@/lib/utils/logger";

export const ORDER_WORKER_SETTING_KEY = "order_automation_worker";
/** Separate heartbeat key for Order Brain memory rebuild cadence */
export const ORDER_BRAIN_SETTING_KEY = "order_brain_worker";

const HEARTBEAT_STALE_MS = 60_000;
const BRAIN_REBUILD_MIN_MS = 5 * 60_000;
const DEFAULT_BATCH = 8;

export type OrderWorkerDeskStatus = {
  status: "running" | "idle" | "stopped";
  lastTickAt: string | null;
  tickAgeMs: number;
  lastWorkerId: string | null;
  lastBatch: {
    at: string;
    claimed: number;
    advanced: number;
    errors: number;
    durationMs: number;
  } | null;
  counts: {
    queue: number;
    validating: number;
    cj: number;
    tracking: number;
    retry: number;
    errors: number;
    completedToday: number;
    ordersToday: number;
  };
};

type Persisted = {
  lastTickAt: string | null;
  lastWorkerId: string | null;
  lastBatch: OrderWorkerDeskStatus["lastBatch"];
};

function emptyPersisted(): Persisted {
  return { lastTickAt: null, lastWorkerId: null, lastBatch: null };
}

async function readState(): Promise<Persisted> {
  const row = await prisma.setting.findUnique({
    where: { key: ORDER_WORKER_SETTING_KEY },
  });
  if (row?.value == null) return emptyPersisted();
  try {
    if (typeof row.value === "string") {
      return { ...emptyPersisted(), ...(JSON.parse(row.value) as Persisted) };
    }
    if (typeof row.value === "object") {
      return { ...emptyPersisted(), ...(row.value as Persisted) };
    }
    return emptyPersisted();
  } catch {
    return emptyPersisted();
  }
}

async function writeState(state: Persisted): Promise<void> {
  await prisma.setting.upsert({
    where: { key: ORDER_WORKER_SETTING_KEY },
    create: {
      key: ORDER_WORKER_SETTING_KEY,
      value: state as object,
    },
    update: { value: state as object },
  });
}

const ACTIVE_CLAIM: OrderAutomationPhase[] = [
  "NEW",
  "PAID",
  "VALIDATING",
  "READY_FOR_CJ",
  "SENT_TO_CJ",
  "ORDERED",
  "TRACKING_RECEIVED",
  "SHIPPED",
  "DELIVERED",
  "WAITING_FOR_RETRY",
];

/**
 * Claim work: paid orders in active automation phases (incl. due retries).
 */
export async function claimOrdersForAutomation(
  take = DEFAULT_BATCH
): Promise<string[]> {
  const now = new Date();
  const rows = await prisma.order.findMany({
    where: {
      paymentStatus: "paid",
      archivedAt: null,
      OR: [
        {
          automationPhase: {
            in: ACTIVE_CLAIM.filter((p) => p !== "WAITING_FOR_RETRY"),
          },
        },
        {
          automationPhase: "WAITING_FOR_RETRY",
          OR: [
            { automationNextRetryAt: null },
            { automationNextRetryAt: { lte: now } },
          ],
        },
        // Backfill: paid + NEW fulfillment but stuck at default NEW phase
        {
          automationPhase: "NEW",
          fulfillmentStatus: "NEW",
        },
      ],
    },
    orderBy: [{ updatedAt: "asc" }],
    take,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function tickOrderWorker(opts?: {
  batchSize?: number;
}): Promise<{
  workerId: string;
  claimed: number;
  advanced: number;
  errors: number;
  results: Array<{ orderId: string; message: string; to: string }>;
}> {
  const workerId = randomUUID().slice(0, 8);
  const started = Date.now();
  const ids = await claimOrdersForAutomation(opts?.batchSize ?? DEFAULT_BATCH);

  let advanced = 0;
  let errors = 0;
  const results: Array<{ orderId: string; message: string; to: string }> = [];

  for (const id of ids) {
    try {
      const step = await advanceOrder(id);
      if (step.didWork) advanced += 1;
      results.push({
        orderId: id,
        message: step.message,
        to: step.to,
      });
    } catch (err) {
      errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      logError(err, `[order-worker] advance failed ${id}: ${message}`);
      results.push({ orderId: id, message, to: "ERROR" });
    }
  }

  const batch = {
    at: new Date().toISOString(),
    claimed: ids.length,
    advanced,
    errors,
    durationMs: Date.now() - started,
  };

  await writeState({
    lastTickAt: batch.at,
    lastWorkerId: workerId,
    lastBatch: batch,
  });

  // Order Brain: rebuild memory on a slower cadence (never auto-refunds)
  try {
    const brainRow = await prisma.setting.findUnique({
      where: { key: ORDER_BRAIN_SETTING_KEY },
    });
    let lastBrain = 0;
    if (brainRow?.value && typeof brainRow.value === "object") {
      const v = brainRow.value as { lastBrainAt?: string };
      lastBrain = v.lastBrainAt ? new Date(v.lastBrainAt).getTime() : 0;
    }
    if (Date.now() - lastBrain >= BRAIN_REBUILD_MIN_MS) {
      const brain = await advanceOrderBrain();
      await prisma.setting.upsert({
        where: { key: ORDER_BRAIN_SETTING_KEY },
        create: {
          key: ORDER_BRAIN_SETTING_KEY,
          value: {
            lastBrainAt: new Date().toISOString(),
            lastMessage: brain.message,
            memoryScore: brain.memoryScore,
          },
        },
        update: {
          value: {
            lastBrainAt: new Date().toISOString(),
            lastMessage: brain.message,
            memoryScore: brain.memoryScore,
          },
        },
      });
      logInfo(brain.message, "[order-brain]");
    }
  } catch (err) {
    logError(err, "[order-worker] order brain rebuild failed");
  }

  logInfo(
    `tick claimed=${batch.claimed} advanced=${batch.advanced} errors=${batch.errors}`,
    "[order-worker]"
  );

  return {
    workerId,
    claimed: ids.length,
    advanced,
    errors,
    results,
  };
}

export async function runOrderWorkerLoop(opts?: {
  intervalMs?: number;
  batchSize?: number;
}): Promise<never> {
  const interval = opts?.intervalMs ?? 15_000;
  for (;;) {
    try {
      await tickOrderWorker({ batchSize: opts?.batchSize });
    } catch (err) {
      logError(err, "[order-worker] loop tick failed");
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

async function countByPhases(
  phases: AutomationPhase[]
): Promise<number> {
  return prisma.order.count({
    where: {
      paymentStatus: "paid",
      archivedAt: null,
      automationPhase: { in: phases as OrderAutomationPhase[] },
    },
  });
}

/**
 * Read-only Desk / Mission Control snapshot.
 */
export async function getOrderAutomationDeskStatus(): Promise<OrderWorkerDeskStatus> {
  const state = await readState();
  const tickAgeMs = state.lastTickAt
    ? Date.now() - new Date(state.lastTickAt).getTime()
    : Number.POSITIVE_INFINITY;

  let status: OrderWorkerDeskStatus["status"] = "stopped";
  if (Number.isFinite(tickAgeMs) && tickAgeMs < HEARTBEAT_STALE_MS) {
    status =
      (state.lastBatch?.claimed ?? 0) > 0 || (state.lastBatch?.advanced ?? 0) > 0
        ? "running"
        : "idle";
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    queue,
    validating,
    cj,
    tracking,
    retry,
    errors,
    completedToday,
    ordersToday,
  ] = await Promise.all([
    countByPhases(["NEW", "PAID", "READY_FOR_CJ"]),
    countByPhases(["VALIDATING"]),
    countByPhases(["SENT_TO_CJ", "ORDERED"]),
    countByPhases(["TRACKING_RECEIVED", "SHIPPED"]),
    countByPhases(["WAITING_FOR_RETRY"]),
    countByPhases([
      "CJ_ERROR",
      "ADDRESS_ERROR",
      "WAITING_FOR_STOCK",
      "PAYMENT_FAILED",
      "MANUAL_REVIEW",
    ]),
    prisma.order.count({
      where: {
        automationPhase: "COMPLETED",
        automationPhaseAt: { gte: startOfDay },
      },
    }),
    prisma.order.count({
      where: {
        paymentStatus: "paid",
        createdAt: { gte: startOfDay },
        archivedAt: null,
      },
    }),
  ]);

  return {
    status,
    lastTickAt: state.lastTickAt,
    tickAgeMs: Number.isFinite(tickAgeMs) ? tickAgeMs : -1,
    lastWorkerId: state.lastWorkerId,
    lastBatch: state.lastBatch,
    counts: {
      queue,
      validating,
      cj,
      tracking,
      retry,
      errors,
      completedToday,
      ordersToday,
    },
  };
}
