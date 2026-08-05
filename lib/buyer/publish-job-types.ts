/**
 * Client-safe types for buyer publish job (no server-only imports).
 * All live fields come from the persisted job — UI must not invent progress.
 */

export type BuyerPublishLogLine = {
  at: string;
  level: "ok" | "warn" | "err";
  message: string;
};

export type BuyerPublishSelectionFilter = {
  group?: string;
  q?: string;
  minMatch?: number;
  minMargin?: number;
  excludeCount?: number;
};

export type BuyerPublishJobKind = "publish" | "republish";

export type BuyerPublishJobSnapshot = {
  id: string;
  /** Which Setting / pipeline lane owns this job. */
  kind: BuyerPublishJobKind;
  status: "running" | "done" | "error";
  /** Alias totalProducts */
  total: number;
  totalProducts: number;
  cursor: number;
  published: number;
  failed: number;
  skipped: number;
  inProgress: number;
  processed: number;
  remaining: number;
  productsPerMin: number | null;
  etaSeconds: number | null;
  pct: number;
  batchSize: number;
  batchIndex: number;
  currentBatch: number;
  totalBatches: number;
  batchTotal: number;
  busy: boolean;
  stalled: boolean;
  heartbeatAgeMs: number;
  lastHeartbeat: string | null;
  lastWorkerTickAt: string | null;
  lastPublishedProductId: string | null;
  lastPublishedProductName: string | null;
  nextBatchProductName: string | null;
  stopReason: string | null;
  stopDetail: string | null;
  requestId: string | null;
  selectionFilter: BuyerPublishSelectionFilter | null;
  /** Event log (max 30). */
  events: BuyerPublishLogLine[];
  logs: BuyerPublishLogLine[];
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  elapsedSeconds: number;
  error: string | null;
  thumbUp: boolean;
};

/** Client-only start phases (before jobId exists). */
export type PublishStartPhase =
  | "idle"
  | "starting"
  | "creating"
  | "created"
  | "waiting_worker"
  | "error";
