/**
 * Finance Worker — rebuilds Finance Brain on a cadence.
 * Same philosophy as Marketing/Order workers. Never changes prices.
 */

import "server-only";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { logInfo, logError } from "@/lib/utils/logger";
import { advanceFinanceBrain } from "./finance-engine";

export const FINANCE_WORKER_SETTING_KEY = "finance_brain_worker";
const HEARTBEAT_STALE_MS = 120_000;

export type FinanceWorkerDeskStatus = {
  status: "running" | "idle" | "stopped";
  lastTickAt: string | null;
  tickAgeMs: number;
  lastWorkerId: string | null;
  lastMessage: string | null;
  memoryScore: number;
};

type Persisted = {
  lastTickAt: string | null;
  lastWorkerId: string | null;
  lastMessage: string | null;
  memoryScore: number;
};

function empty(): Persisted {
  return {
    lastTickAt: null,
    lastWorkerId: null,
    lastMessage: null,
    memoryScore: 0,
  };
}

async function readState(): Promise<Persisted> {
  const row = await prisma.setting.findUnique({
    where: { key: FINANCE_WORKER_SETTING_KEY },
  });
  if (!row?.value || typeof row.value !== "object") return empty();
  return { ...empty(), ...(row.value as Persisted) };
}

async function writeState(state: Persisted): Promise<void> {
  await prisma.setting.upsert({
    where: { key: FINANCE_WORKER_SETTING_KEY },
    create: { key: FINANCE_WORKER_SETTING_KEY, value: state as object },
    update: { value: state as object },
  });
}

export async function tickFinanceWorker(): Promise<{
  workerId: string;
  message: string;
  memoryScore: number;
}> {
  const workerId = randomUUID().slice(0, 8);
  try {
    const result = await advanceFinanceBrain();
    await writeState({
      lastTickAt: new Date().toISOString(),
      lastWorkerId: workerId,
      lastMessage: result.message,
      memoryScore: result.memoryScore,
    });
    logInfo(result.message, "[finance-worker]");
    return {
      workerId,
      message: result.message,
      memoryScore: result.memoryScore,
    };
  } catch (err) {
    logError(err, "[finance-worker] tick failed");
    throw err;
  }
}

export async function runFinanceWorkerLoop(opts?: {
  intervalMs?: number;
  signal?: AbortSignal;
}): Promise<void> {
  const interval = opts?.intervalMs ?? 5 * 60_000;
  for (;;) {
    if (opts?.signal?.aborted) return;
    try {
      await tickFinanceWorker();
    } catch (err) {
      logError(err, "[finance-worker] loop tick failed");
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

export async function getFinanceWorkerStatus(): Promise<FinanceWorkerDeskStatus> {
  const state = await readState();
  const tickAgeMs = state.lastTickAt
    ? Date.now() - new Date(state.lastTickAt).getTime()
    : Number.POSITIVE_INFINITY;

  let status: FinanceWorkerDeskStatus["status"] = "stopped";
  if (Number.isFinite(tickAgeMs) && tickAgeMs < HEARTBEAT_STALE_MS) {
    status = "idle";
  }

  return {
    status,
    lastTickAt: state.lastTickAt,
    tickAgeMs: Number.isFinite(tickAgeMs) ? tickAgeMs : -1,
    lastWorkerId: state.lastWorkerId,
    lastMessage: state.lastMessage,
    memoryScore: state.memoryScore,
  };
}
