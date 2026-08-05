/**
 * Client-safe types for background Supplier Engine import jobs.
 */

import type { FailureReasonGroup, ImportJourneyStage } from "@/lib/ops/import-failure-reasons";

export type ImportJobPhase =
  | "idle"
  | "queuing"
  | "processing"
  | "done"
  | "error";

export type ImportJobSnapshot = {
  id: string;
  phase: ImportJobPhase;
  totalTarget: number;
  sent: number;
  queued: number;
  processing: number;
  importing: number;
  aiAnalyzing: number;
  review: number;
  approved: number;
  published: number;
  failed: number;
  readyForReview: number;
  succeeded: number;
  done: number;
  etaSeconds: number | null;
  journeyStage: ImportJourneyStage;
  failureReasons: FailureReasonGroup[];
  queueItemIds: string[];
  error?: string | null;
  startedAt: string;
  updatedAt: string;
  minimized?: boolean;
};

export const IMPORT_JOB_STORAGE_KEY = "ehx-import-job-v1";

export function emptyImportJob(partial?: Partial<ImportJobSnapshot>): ImportJobSnapshot {
  const now = new Date().toISOString();
  return {
    id: `job-${Date.now()}`,
    phase: "idle",
    totalTarget: 0,
    sent: 0,
    queued: 0,
    processing: 0,
    importing: 0,
    aiAnalyzing: 0,
    review: 0,
    approved: 0,
    published: 0,
    failed: 0,
    readyForReview: 0,
    succeeded: 0,
    done: 0,
    etaSeconds: null,
    journeyStage: "waiting",
    failureReasons: [],
    queueItemIds: [],
    error: null,
    startedAt: now,
    updatedAt: now,
    minimized: false,
    ...partial,
  };
}

export function importJobProgressPct(job: ImportJobSnapshot): number {
  const total = Math.max(job.totalTarget, job.sent, 1);
  if (job.phase === "done") return 100;
  if (job.phase === "queuing") {
    return Math.min(40, Math.round((job.sent / total) * 40));
  }
  const terminal = job.succeeded + job.failed;
  return Math.min(99, Math.round((terminal / total) * 100));
}
