/**
 * Buyer hunt batch timing — measure where wall-clock goes.
 * Does not change Discovery / Merch / ranking algorithms.
 */

import { AsyncLocalStorage } from "async_hooks";
import { logInfo } from "@/lib/utils/logger";

export const BATCH_TIMING_KEYS = [
  "discovery",
  "cjSearch",
  "productFetch",
  "price",
  "shipping",
  "currency",
  "matching",
  "merchScore",
  "memory",
  "storeDna",
  "feedback",
  "database",
] as const;

export type BatchTimingKey = (typeof BATCH_TIMING_KEYS)[number];

export type BatchTimingBuckets = Record<BatchTimingKey, number>;

export type BatchTimingReport = {
  batchNo: number;
  scanRunId: string;
  scannedBefore: number;
  scannedDelta: number;
  keptDelta: number;
  filteredDelta: number;
  at: string;
  totalMs: number;
  buckets: BatchTimingBuckets;
  /** Wall clock minus accounted buckets (overlap / uncategorized). */
  unaccountedMs: number;
};

const LABELS: Record<BatchTimingKey, string> = {
  discovery: "Discovery",
  cjSearch: "CJ Search",
  productFetch: "Product fetch",
  price: "Price",
  shipping: "Shipping",
  currency: "Currency lookup",
  matching: "Matching",
  merchScore: "Merch Score",
  memory: "Memory",
  storeDna: "Store DNA",
  feedback: "Feedback",
  database: "Database",
};

function emptyBuckets(): BatchTimingBuckets {
  return {
    discovery: 0,
    cjSearch: 0,
    productFetch: 0,
    price: 0,
    shipping: 0,
    currency: 0,
    matching: 0,
    merchScore: 0,
    memory: 0,
    storeDna: 0,
    feedback: 0,
    database: 0,
  };
}

export class BatchTimer {
  readonly buckets = emptyBuckets();
  private wallStart = 0;
  private wallEnd = 0;

  start() {
    this.wallStart = performance.now();
  }

  stop() {
    this.wallEnd = performance.now();
  }

  add(key: BatchTimingKey, ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.buckets[key] += ms;
  }

  measureSync<T>(key: BatchTimingKey, fn: () => T): T {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      this.add(key, performance.now() - t0);
    }
  }

  async measureAsync<T>(
    key: BatchTimingKey,
    fn: () => Promise<T>
  ): Promise<T> {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      this.add(key, performance.now() - t0);
    }
  }

  totalMs(): number {
    if (this.wallEnd > this.wallStart) return this.wallEnd - this.wallStart;
    return performance.now() - this.wallStart;
  }

  accountedMs(): number {
    return BATCH_TIMING_KEYS.reduce((s, k) => s + this.buckets[k], 0);
  }

  report(meta: {
    batchNo: number;
    scanRunId: string;
    scannedBefore: number;
    scannedDelta: number;
    keptDelta: number;
    filteredDelta: number;
  }): BatchTimingReport {
    const totalMs = this.totalMs();
    const accounted = this.accountedMs();
    return {
      ...meta,
      at: new Date().toISOString(),
      totalMs,
      buckets: { ...this.buckets },
      unaccountedMs: Math.max(0, totalMs - accounted),
    };
  }
}

const storage = new AsyncLocalStorage<BatchTimer>();

/** Fallback when not inside `withBatchTimer` (sync pricing helpers). */
let fallbackTimer: BatchTimer | null = null;

export function getActiveBatchTimer(): BatchTimer | null {
  return storage.getStore() ?? fallbackTimer;
}

export function setFallbackBatchTimer(timer: BatchTimer | null) {
  fallbackTimer = timer;
}

export async function withBatchTimer<T>(
  timer: BatchTimer,
  fn: () => Promise<T>
): Promise<T> {
  const prev = fallbackTimer;
  fallbackTimer = timer;
  try {
    return await storage.run(timer, fn);
  } finally {
    fallbackTimer = prev;
  }
}

export function formatBatchTimingLog(report: BatchTimingReport): string {
  const lines = [
    `Batch ${report.batchNo}`,
    `scanned +${report.scannedDelta} (kept ${report.keptDelta}, filtered ${report.filteredDelta})`,
  ];
  for (const key of BATCH_TIMING_KEYS) {
    const ms = Math.round(report.buckets[key]);
    lines.push(`${LABELS[key]}: ${ms} ms`);
  }
  if (report.unaccountedMs >= 1) {
    lines.push(`Other: ${Math.round(report.unaccountedMs)} ms`);
  }
  lines.push(`Total: ${Math.round(report.totalMs)} ms`);
  return lines.join("\n");
}

export function logBatchTiming(report: BatchTimingReport): void {
  const text = formatBatchTimingLog(report);
  console.log(text);
  logInfo(text, "[buyer/batch-timing]");
}

export function topBottlenecks(
  report: BatchTimingReport,
  n = 10
): Array<{ key: BatchTimingKey | "other"; label: string; ms: number; pct: number }> {
  const total = Math.max(1, report.totalMs);
  const rows: Array<{
    key: BatchTimingKey | "other";
    label: string;
    ms: number;
    pct: number;
  }> = BATCH_TIMING_KEYS.map((key) => ({
    key,
    label: LABELS[key],
    ms: report.buckets[key],
    pct: (report.buckets[key] / total) * 100,
  }));
  if (report.unaccountedMs >= 1) {
    rows.push({
      key: "other",
      label: "Other",
      ms: report.unaccountedMs,
      pct: (report.unaccountedMs / total) * 100,
    });
  }
  return rows
    .filter((r) => r.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, n)
    .map((r) => ({
      ...r,
      ms: Math.round(r.ms),
      pct: Math.round(r.pct * 10) / 10,
    }));
}

/** Aggregate several reports for a stable top-10. */
export function aggregateTopBottlenecks(
  reports: BatchTimingReport[],
  n = 10
): Array<{
  key: BatchTimingKey | "other";
  label: string;
  totalMs: number;
  avgMs: number;
  pctOfWall: number;
  batches: number;
}> {
  if (!reports.length) return [];
  const sum: BatchTimingBuckets = emptyBuckets();
  let other = 0;
  let wall = 0;
  for (const r of reports) {
    wall += r.totalMs;
    other += r.unaccountedMs;
    for (const k of BATCH_TIMING_KEYS) sum[k] += r.buckets[k];
  }
  const batches = reports.length;
  const rows = BATCH_TIMING_KEYS.map((key) => ({
    key: key as BatchTimingKey | "other",
    label: LABELS[key],
    totalMs: sum[key],
    avgMs: sum[key] / batches,
    pctOfWall: wall > 0 ? (sum[key] / wall) * 100 : 0,
    batches,
  }));
  if (other > 0) {
    rows.push({
      key: "other",
      label: "Other",
      totalMs: other,
      avgMs: other / batches,
      pctOfWall: wall > 0 ? (other / wall) * 100 : 0,
      batches,
    });
  }
  return rows
    .filter((r) => r.totalMs > 0)
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, n)
    .map((r) => ({
      ...r,
      totalMs: Math.round(r.totalMs),
      avgMs: Math.round(r.avgMs),
      pctOfWall: Math.round(r.pctOfWall * 10) / 10,
    }));
}
