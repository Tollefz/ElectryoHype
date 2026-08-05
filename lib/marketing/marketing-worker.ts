/**
 * Marketing Worker — drains learning work independently of the admin UI.
 * Same philosophy as Buyer / Order workers: UI observes, worker owns process.
 * Never sends ads. Never changes budgets.
 */

import "server-only";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { advanceMarketingBrain } from "./marketing-engine";
import { logInfo, logError } from "@/lib/utils/logger";

export const MARKETING_WORKER_SETTING_KEY = "marketing_brain_worker";

const HEARTBEAT_STALE_MS = 120_000;

export type MarketingWorkerDeskStatus = {
  status: "running" | "idle" | "stopped";
  lastTickAt: string | null;
  tickAgeMs: number;
  lastWorkerId: string | null;
  lastBatch: {
    at: string;
    didWork: boolean;
    productsScored: number;
    memoryScore: number;
    message: string;
    durationMs: number;
  } | null;
};

type Persisted = {
  lastTickAt: string | null;
  lastWorkerId: string | null;
  lastBatch: MarketingWorkerDeskStatus["lastBatch"];
};

function emptyPersisted(): Persisted {
  return { lastTickAt: null, lastWorkerId: null, lastBatch: null };
}

async function readState(): Promise<Persisted> {
  const row = await prisma.setting.findUnique({
    where: { key: MARKETING_WORKER_SETTING_KEY },
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
    where: { key: MARKETING_WORKER_SETTING_KEY },
    create: {
      key: MARKETING_WORKER_SETTING_KEY,
      value: state as object,
    },
    update: { value: state as object },
  });
}

export async function tickMarketingWorker(opts?: {
  workerId?: string;
  rangeDays?: number;
}): Promise<{
  workerId: string;
  didWork: boolean;
  productsScored: number;
  memoryScore: number;
  message: string;
  durationMs: number;
}> {
  const workerId = opts?.workerId || randomUUID().slice(0, 8);
  const started = Date.now();

  try {
    const result = await advanceMarketingBrain({
      rangeDays: opts?.rangeDays ?? 7,
    });

    const lastBatch: MarketingWorkerDeskStatus["lastBatch"] = {
      at: new Date().toISOString(),
      didWork: result.didWork,
      productsScored: result.productsScored,
      memoryScore: result.memoryScore,
      message: result.message,
      durationMs: result.durationMs,
    };

    await writeState({
      lastTickAt: new Date().toISOString(),
      lastWorkerId: workerId,
      lastBatch,
    });

    logInfo(
      `[marketing-worker] ${workerId}: ${result.message}`,
      "marketing-worker"
    );

    return {
      workerId,
      didWork: result.didWork,
      productsScored: result.productsScored,
      memoryScore: result.memoryScore,
      message: result.message,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    logError(err, "[marketing-worker]");
    await writeState({
      lastTickAt: new Date().toISOString(),
      lastWorkerId: workerId,
      lastBatch: {
        at: new Date().toISOString(),
        didWork: false,
        productsScored: 0,
        memoryScore: 0,
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      },
    });
    throw err;
  }
}

export async function getMarketingWorkerStatus(): Promise<MarketingWorkerDeskStatus> {
  const state = await readState();
  const tickAgeMs = state.lastTickAt
    ? Date.now() - new Date(state.lastTickAt).getTime()
    : Number.POSITIVE_INFINITY;

  let status: MarketingWorkerDeskStatus["status"] = "stopped";
  if (state.lastTickAt && tickAgeMs < HEARTBEAT_STALE_MS) {
    status = state.lastBatch?.didWork ? "running" : "idle";
  } else if (state.lastTickAt) {
    status = "idle";
  }

  return {
    status,
    lastTickAt: state.lastTickAt,
    tickAgeMs: Number.isFinite(tickAgeMs) ? tickAgeMs : -1,
    lastWorkerId: state.lastWorkerId,
    lastBatch: state.lastBatch,
  };
}

export async function runMarketingWorkerLoop(opts?: {
  intervalMs?: number;
  signal?: AbortSignal;
}): Promise<void> {
  const intervalMs = opts?.intervalMs ?? 60_000;
  logInfo("[marketing-worker] loop started", "marketing-worker");

  while (!opts?.signal?.aborted) {
    try {
      await tickMarketingWorker();
    } catch (err) {
      logError(err, "[marketing-worker] loop tick");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
