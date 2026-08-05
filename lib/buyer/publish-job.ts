/**
 * Buyer publish job — persistent progress for «Publiser valgte».
 * UI creates the job; Buyer Hunt Worker owns the full lifecycle.
 */

import "server-only";

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  approveAndPublishCandidates,
  type ApprovePublishItemResult,
} from "@/lib/buyer/approve-and-publish";
import { resolveBuyerRankingScanId } from "@/lib/buyer/scan";
import {
  formatFriendlySupplierError,
  isApiPointsExhausted,
} from "@/lib/buyer/cj-errors";
import type {
  BuyerPublishJobSnapshot,
  BuyerPublishLogLine,
  BuyerPublishSelectionFilter,
} from "@/lib/buyer/publish-job-types";
import {
  BUYER_PUBLISH_JOB_KEY,
  BUYER_REPUBLISH_JOB_KEY,
  publishJobSettingKey,
  type BuyerPublishJobKind,
} from "@/lib/buyer/publish-job-constants";

export type { BuyerPublishJobSnapshot, BuyerPublishLogLine, BuyerPublishJobKind };
export {
  BUYER_PUBLISH_JOB_KEY,
  BUYER_REPUBLISH_JOB_KEY,
  publishJobSettingKey,
};

const DEFAULT_BATCH = 25;
const LOCK_MS = 120_000;
const MAX_EVENTS = 30;
/** Job looks stalled if no worker heartbeat for this long while running. */
export const PUBLISH_STALL_MS = 2 * 60_000;

const CATEGORY_GROUPS = new Set([
  "gaming",
  "mobil",
  "audio",
  "kontor",
  "hjem",
]);

type PersistedJob = {
  id: string;
  kind: BuyerPublishJobKind;
  requestId: string;
  status: "running" | "done" | "error";
  candidateIds: string[];
  candidateTitles: string[];
  cursor: number;
  published: number;
  failed: number;
  skipped: number;
  batchSize: number;
  batchIndex: number;
  events: BuyerPublishLogLine[];
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
  stopReason: string | null;
  stopDetail: string | null;
  thumbUp: boolean;
  lockedUntil: string | null;
  actorEmail: string | null;
  selectionFilter: BuyerPublishSelectionFilter | null;
  lastWorkerTickAt: string | null;
  lastPublishedProductId: string | null;
  lastPublishedProductName: string | null;
  nextBatchProductName: string | null;
  /** Tallied outcome reasons for final report */
  reasonCounts: Record<string, number>;
  cjErrors: number;
  shopifyErrors: number;
  retries: number;
};

function logPublishComplete(job: PersistedJob) {
  const endMs = job.finishedAt
    ? new Date(job.finishedAt).getTime()
    : Date.now();
  const durationMs = Math.max(0, endMs - new Date(job.startedAt).getTime());
  const durationMin = Math.round((durationMs / 60_000) * 10) / 10;
  const processed = job.published + job.skipped + job.failed;
  const avgPpm =
    durationMs > 0
      ? Math.round((processed / (durationMs / 60_000)) * 10) / 10
      : null;
  const topReasons = Object.entries(job.reasonCounts || {})
    .filter(([k]) => k !== "published")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => `${count}× ${reason}`);

  const label = job.kind === "republish" ? "Republish complete" : "Publish complete";
  console.log(
    `[buyer-publish] ${label}\n` +
      `Total: ${job.candidateIds.length}\n` +
      `Published: ${job.published}\n` +
      `Skipped: ${job.skipped}\n` +
      `Failed: ${job.failed}\n` +
      `Duration: ${durationMin} min\n` +
      `Average PPM: ${avgPpm ?? "—"}\n` +
      `Shopify errors: ${job.shopifyErrors}\n` +
      `CJ errors: ${job.cjErrors}\n` +
      `Retries: ${job.retries}\n` +
      `Top failure reasons:\n${
        topReasons.length ? topReasons.map((r) => `  - ${r}`).join("\n") : "  - (none)"
      }`
  );
  publishLog(label, {
    jobId: job.id,
    kind: job.kind,
    total: job.candidateIds.length,
    published: job.published,
    skipped: job.skipped,
    failed: job.failed,
    durationMin,
    avgPpm,
    shopifyErrors: job.shopifyErrors,
    cjErrors: job.cjErrors,
    retries: job.retries,
    topReasons,
  });
}

function publishLog(message: string, extra?: Record<string, unknown>) {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[buyer-publish] ${message}${suffix}`);
}

function pushEvent(
  events: BuyerPublishLogLine[],
  line: BuyerPublishLogLine
): BuyerPublishLogLine[] {
  return [...events, line].slice(-MAX_EVENTS);
}

function asJob(value: unknown): PersistedJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !Array.isArray(v.candidateIds)) return null;
  const ids = v.candidateIds.filter((x): x is string => typeof x === "string");
  const titlesRaw = Array.isArray(v.candidateTitles) ? v.candidateTitles : [];
  const titles = titlesRaw.map((t) => (typeof t === "string" ? t : ""));
  while (titles.length < ids.length) titles.push("");

  const filterRaw = v.selectionFilter;
  let selectionFilter: BuyerPublishSelectionFilter | null = null;
  if (filterRaw && typeof filterRaw === "object" && !Array.isArray(filterRaw)) {
    const f = filterRaw as Record<string, unknown>;
    selectionFilter = {
      group: typeof f.group === "string" ? f.group : undefined,
      q: typeof f.q === "string" ? f.q : undefined,
      minMatch: typeof f.minMatch === "number" ? f.minMatch : undefined,
      minMargin: typeof f.minMargin === "number" ? f.minMargin : undefined,
      excludeCount: Array.isArray(f.excludeIds)
        ? f.excludeIds.length
        : typeof f.excludeCount === "number"
          ? f.excludeCount
          : 0,
    };
  }

  const legacyLogs = Array.isArray(v.logs)
    ? (v.logs as BuyerPublishLogLine[])
    : [];
  const events = Array.isArray(v.events)
    ? (v.events as BuyerPublishLogLine[]).slice(-MAX_EVENTS)
    : legacyLogs.slice(-MAX_EVENTS);

  const kind: BuyerPublishJobKind =
    v.kind === "republish" ? "republish" : "publish";

  return {
    id: v.id,
    kind,
    requestId:
      typeof v.requestId === "string" ? v.requestId : `req-${v.id}`,
    status: v.status === "done" || v.status === "error" ? v.status : "running",
    candidateIds: ids,
    candidateTitles: titles.slice(0, ids.length),
    cursor: Math.max(0, Number(v.cursor) || 0),
    published: Math.max(0, Number(v.published) || 0),
    failed: Math.max(0, Number(v.failed) || 0),
    skipped: Math.max(0, Number(v.skipped) || 0),
    batchSize: Math.min(100, Math.max(5, Number(v.batchSize) || DEFAULT_BATCH)),
    batchIndex: Math.max(0, Number(v.batchIndex) || 0),
    events,
    startedAt:
      typeof v.startedAt === "string" ? v.startedAt : new Date().toISOString(),
    updatedAt:
      typeof v.updatedAt === "string" ? v.updatedAt : new Date().toISOString(),
    finishedAt: typeof v.finishedAt === "string" ? v.finishedAt : null,
    error: typeof v.error === "string" ? v.error : null,
    stopReason: typeof v.stopReason === "string" ? v.stopReason : null,
    stopDetail: typeof v.stopDetail === "string" ? v.stopDetail : null,
    thumbUp: v.thumbUp !== false,
    lockedUntil: typeof v.lockedUntil === "string" ? v.lockedUntil : null,
    actorEmail: typeof v.actorEmail === "string" ? v.actorEmail : null,
    selectionFilter,
    lastWorkerTickAt:
      typeof v.lastWorkerTickAt === "string" ? v.lastWorkerTickAt : null,
    lastPublishedProductId:
      typeof v.lastPublishedProductId === "string"
        ? v.lastPublishedProductId
        : null,
    lastPublishedProductName:
      typeof v.lastPublishedProductName === "string"
        ? v.lastPublishedProductName
        : null,
    nextBatchProductName:
      typeof v.nextBatchProductName === "string"
        ? v.nextBatchProductName
        : null,
    reasonCounts:
      v.reasonCounts && typeof v.reasonCounts === "object" && !Array.isArray(v.reasonCounts)
        ? Object.fromEntries(
            Object.entries(v.reasonCounts as Record<string, unknown>)
              .filter(([, n]) => typeof n === "number")
              .map(([k, n]) => [k, Number(n)])
          )
        : {},
    cjErrors: Math.max(0, Number(v.cjErrors) || 0),
    shopifyErrors: Math.max(0, Number(v.shopifyErrors) || 0),
    retries: Math.max(0, Number(v.retries) || 0),
  };
}

async function loadJob(
  kind: BuyerPublishJobKind = "publish"
): Promise<PersistedJob | null> {
  const key = publishJobSettingKey(kind);
  const row = await prisma.setting.findUnique({
    where: { key },
  });
  const job = asJob(row?.value);
  if (!job) return null;
  // Normalize kind from Setting key if older jobs omit it
  if (job.kind !== kind) job.kind = kind;
  return job;
}

async function saveJob(job: PersistedJob): Promise<void> {
  const key = publishJobSettingKey(job.kind || "publish");
  const value = job as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

async function resolveCandidateIdsLean(input: {
  ids?: string[];
  selection?: {
    group?: string;
    q?: string;
    minMatch?: number;
    minMargin?: number;
    excludeIds?: string[];
  };
}): Promise<{
  ids: string[];
  titles: string[];
  selectionFilter: BuyerPublishSelectionFilter | null;
}> {
  const direct = (input.ids || []).filter(Boolean);
  if (direct.length) {
    const capped = direct.slice(0, 50_000);
    const rows = await prisma.buyerCandidate.findMany({
      where: { id: { in: capped } },
      select: { id: true, title: true },
    });
    const titleById = new Map(rows.map((r) => [r.id, r.title || ""]));
    return {
      ids: capped,
      titles: capped.map((id) => titleById.get(id) || ""),
      selectionFilter: { excludeCount: 0 },
    };
  }

  const sel = input.selection;
  if (!sel) {
    return { ids: [], titles: [], selectionFilter: null };
  }

  const exclude = new Set((sel.excludeIds || []).filter(Boolean));
  const scanRunId = await resolveBuyerRankingScanId();
  if (!scanRunId) {
    throw new Error("Ingen ranking-scan å publisere fra");
  }

  const group = (sel.group || "all").toLowerCase();
  const q = (sel.q || "").trim();
  const minMatch = sel.minMatch;

  const rows = await prisma.buyerCandidate.findMany({
    where: {
      scanRunId,
      status: "ranked",
      isBestInGroup: true,
      ...(minMatch != null && Number.isFinite(minMatch)
        ? { shopMatchPct: { gte: minMatch } }
        : {}),
      ...(q
        ? { title: { contains: q, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: [
      { rank: "asc" },
      { shopMatchPct: "desc" },
      { overallScore: "desc" },
      { id: "asc" },
    ],
    take: 50_000,
    select: { id: true, title: true, pricing: true },
  });

  let filtered = rows;
  if (CATEGORY_GROUPS.has(group)) {
    const { resolveProductFamilyIds } = await import(
      "@/lib/buyer/preference-signals"
    );
    filtered = rows.filter((r) =>
      resolveProductFamilyIds(r.title || "").includes(group)
    );
  } else if (group !== "all") {
    const { resolveBuyerSelectionIds } = await import(
      "@/lib/buyer/review-board"
    );
    const resolved = await resolveBuyerSelectionIds({
      group: sel.group,
      q: sel.q,
      minMatch: sel.minMatch,
      minMargin: sel.minMargin,
      excludeIds: sel.excludeIds,
      limit: 50_000,
    });
    const titleRows = await prisma.buyerCandidate.findMany({
      where: { id: { in: resolved.ids } },
      select: { id: true, title: true },
    });
    const titleById = new Map(titleRows.map((r) => [r.id, r.title || ""]));
    return {
      ids: resolved.ids,
      titles: resolved.ids.map((id) => titleById.get(id) || ""),
      selectionFilter: {
        group: sel.group,
        q: sel.q,
        minMatch: sel.minMatch,
        minMargin: sel.minMargin,
        excludeCount: exclude.size,
      },
    };
  }

  if (sel.minMargin != null && Number.isFinite(sel.minMargin)) {
    filtered = filtered.filter((r) => {
      const pricing = r.pricing as { marginPct?: number } | null;
      const m = pricing?.marginPct;
      return typeof m === "number" && m >= sel.minMargin!;
    });
  }

  const picked = filtered.filter((r) => !exclude.has(r.id)).slice(0, 50_000);
  return {
    ids: picked.map((r) => r.id),
    titles: picked.map((r) => r.title || ""),
    selectionFilter: {
      group: sel.group,
      q: sel.q,
      minMatch: sel.minMatch,
      minMargin: sel.minMargin,
      excludeCount: exclude.size,
    },
  };
}

function isDuplicateMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("finnes allerede") ||
    m.includes("duplikat") ||
    m.includes("duplicate") ||
    m.includes("unique constraint") ||
    m.includes("allerede publisert") ||
    m.includes("already published") ||
    m.includes("existing catalog product")
  );
}

function classifyOutcome(
  o: ApprovePublishItemResult
): "published" | "failed" | "skipped" {
  if (o.status === "published" || o.status === "would_publish") return "published";
  if (o.status === "needs_control" || o.status === "would_need_control") {
    return "skipped";
  }
  if (
    isDuplicateMessage(o.message || "") ||
    o.problems.some(isDuplicateMessage)
  ) {
    return "skipped";
  }
  return "failed";
}

function isRecoverableSupplierStop(message: string): boolean {
  if (isApiPointsExhausted(message)) return true;
  const friendly = formatFriendlySupplierError(message);
  return (
    friendly?.kind === "api_points" ||
    friendly?.kind === "rate_limit" ||
    friendly?.kind === "network" ||
    friendly?.kind === "auth"
  );
}

function toSnapshot(job: PersistedJob): BuyerPublishJobSnapshot {
  const total = job.candidateIds.length;
  const processed = Math.min(job.cursor, total);
  const remaining = Math.max(0, total - processed);
  const batchSize = job.batchSize || DEFAULT_BATCH;
  const totalBatches =
    total > 0 ? Math.max(1, Math.ceil(total / batchSize)) : 0;
  const busy =
    job.status === "running" &&
    !!job.lockedUntil &&
    new Date(job.lockedUntil).getTime() > Date.now();
  const inProgress = busy ? Math.min(batchSize, remaining) : 0;
  const currentBatch =
    job.status === "done"
      ? totalBatches
      : remaining > 0
        ? Math.min(totalBatches, job.batchIndex + 1)
        : Math.max(1, job.batchIndex);
  const endMs = job.finishedAt
    ? new Date(job.finishedAt).getTime()
    : Date.now();
  const elapsedSeconds = Math.max(
    0,
    Math.round((endMs - new Date(job.startedAt).getTime()) / 1000)
  );
  const productsPerMin =
    processed > 0 && elapsedSeconds > 0
      ? Math.round((processed / (elapsedSeconds / 60)) * 10) / 10
      : null;
  const etaSeconds =
    productsPerMin && productsPerMin > 0 && remaining > 0
      ? Math.round((remaining / productsPerMin) * 60)
      : null;
  const pct =
    job.status === "done"
      ? 100
      : total > 0
        ? Math.min(99, Math.round((processed / total) * 100))
        : 0;

  const lastHeartbeat = job.lastWorkerTickAt || job.updatedAt;
  const heartbeatAgeMs = Math.max(
    0,
    Date.now() - new Date(lastHeartbeat).getTime()
  );
  const stalled =
    job.status === "running" &&
    !busy &&
    heartbeatAgeMs >= PUBLISH_STALL_MS;

  const nextFromCursor =
    remaining > 0
      ? job.candidateTitles[job.cursor] ||
        job.nextBatchProductName ||
        null
      : null;

  return {
    id: job.id,
    kind: job.kind || "publish",
    status: job.status,
    total,
    totalProducts: total,
    cursor: job.cursor,
    published: job.published,
    failed: job.failed,
    skipped: job.skipped,
    inProgress,
    processed,
    remaining,
    productsPerMin,
    etaSeconds,
    pct,
    batchSize,
    batchIndex: job.batchIndex,
    currentBatch,
    totalBatches,
    batchTotal: totalBatches,
    busy,
    stalled,
    heartbeatAgeMs,
    lastHeartbeat,
    lastWorkerTickAt: job.lastWorkerTickAt,
    lastPublishedProductId: job.lastPublishedProductId,
    lastPublishedProductName: job.lastPublishedProductName,
    nextBatchProductName: nextFromCursor,
    stopReason: job.stopReason,
    stopDetail: job.stopDetail,
    requestId: job.requestId,
    selectionFilter: job.selectionFilter,
    events: job.events,
    logs: job.events,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
    elapsedSeconds,
    error: job.error,
    thumbUp: job.thumbUp,
  };
}

export async function getBuyerPublishJob(
  kind: BuyerPublishJobKind = "publish"
): Promise<BuyerPublishJobSnapshot | null> {
  const job = await loadJob(kind);
  if (!job) return null;
  return toSnapshot(job);
}

export async function dismissBuyerPublishJob(
  kind: BuyerPublishJobKind = "publish"
): Promise<void> {
  await prisma.setting.deleteMany({
    where: { key: publishJobSettingKey(kind) },
  });
  publishLog(
    kind === "republish" ? "Republish job dismissed" : "Publish job dismissed"
  );
}

/**
 * Create publish job only — worker drains. Never starts batches here.
 */
export async function startBuyerPublishJob(input: {
  ids?: string[];
  selection?: {
    group?: string;
    q?: string;
    minMatch?: number;
    minMargin?: number;
    excludeIds?: string[];
  };
  thumbUp?: boolean;
  batchSize?: number;
  actorEmail?: string | null;
}): Promise<BuyerPublishJobSnapshot> {
  const requestId = `preq-${randomUUID().slice(0, 12)}`;
  publishLog("Publish requested", {
    requestId,
    hasIds: Boolean(input.ids?.length),
    selection: input.selection
      ? {
          group: input.selection.group,
          q: input.selection.q,
          minMatch: input.selection.minMatch,
          exclude: input.selection.excludeIds?.length || 0,
        }
      : null,
    actor: input.actorEmail || null,
  });

  const existing = await loadJob("publish");
  if (existing?.status === "running") {
    publishLog("Publish job already running", {
      requestId,
      jobId: existing.id,
    });
    return toSnapshot(existing);
  }

  let ids: string[];
  let titles: string[];
  let selectionFilter: BuyerPublishSelectionFilter | null;
  try {
    publishLog("Resolving candidates…", { requestId });
    const resolved = await resolveCandidateIdsLean(input);
    ids = resolved.ids;
    titles = resolved.titles;
    selectionFilter = resolved.selectionFilter;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    publishLog("Failed resolving candidates", {
      requestId,
      reason: error.message,
      stack: error.stack?.slice(0, 2000),
    });
    throw error;
  }

  publishLog(`Candidates: ${ids.length}`, { requestId });

  if (!ids.length) {
    publishLog("Failed creating publish job", {
      requestId,
      reason: "Ingen produkter valgt",
    });
    throw new Error("Ingen produkter valgt");
  }

  const now = new Date().toISOString();
  const jobId = `pub-${randomUUID().slice(0, 10)}`;
  const batchSize = Math.min(
    100,
    Math.max(5, input.batchSize || DEFAULT_BATCH)
  );
  const totalBatches = Math.max(1, Math.ceil(ids.length / batchSize));

  const job: PersistedJob = {
    id: jobId,
    kind: "publish",
    requestId,
    status: "running",
    candidateIds: ids,
    candidateTitles: titles,
    cursor: 0,
    published: 0,
    failed: 0,
    skipped: 0,
    batchSize,
    batchIndex: 0,
    events: [
      {
        at: now,
        level: "ok",
        message: `Jobb opprettet — ${ids.length.toLocaleString("no-NO")} produkter · ${totalBatches} batcher`,
      },
    ],
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    error: null,
    stopReason: null,
    stopDetail: null,
    thumbUp: input.thumbUp !== false,
    lockedUntil: null,
    actorEmail: input.actorEmail || null,
    selectionFilter,
    lastWorkerTickAt: null,
    lastPublishedProductId: null,
    lastPublishedProductName: null,
    nextBatchProductName: titles[0] || null,
    reasonCounts: {},
    cjErrors: 0,
    shopifyErrors: 0,
    retries: 0,
  };

  publishLog("Creating publish job…", {
    requestId,
    jobId,
    total: ids.length,
    batchSize,
  });

  try {
    await prisma.$transaction(async (tx) => {
      const value = job as unknown as Prisma.InputJsonValue;
      await tx.setting.upsert({
        where: { key: BUYER_PUBLISH_JOB_KEY },
        create: { key: BUYER_PUBLISH_JOB_KEY, value },
        update: { value },
      });
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    publishLog("Failed creating publish job", {
      requestId,
      reason: error.message,
      stack: error.stack?.slice(0, 2000),
    });
    throw new Error(`Kunne ikke opprette publiseringsjobb: ${error.message}`);
  }

  const verified = await loadJob("publish");
  if (!verified || verified.id !== jobId) {
    publishLog("Failed creating publish job", {
      requestId,
      reason: "Job not found after commit",
      expected: jobId,
      actual: verified?.id ?? null,
    });
    throw new Error("Publiseringsjobb ble ikke lagret");
  }

  publishLog("Publish job created", {
    requestId,
    jobId: verified.id,
    total: verified.candidateIds.length,
  });
  publishLog("Worker notified", {
    requestId,
    jobId: verified.id,
    note: "buyer_publish_job is running — worker will drain batches",
  });

  return toSnapshot(verified);
}

/**
 * Create publish/republish job from explicit IDs — shared by hunt publish + republish.
 * Worker drains via tickBuyerPublishJob({ kind }).
 */
export async function startBuyerPublishJobFromIds(input: {
  kind: BuyerPublishJobKind;
  ids: string[];
  titles?: string[];
  batchSize?: number;
  thumbUp?: boolean;
  actorEmail?: string | null;
  selectionFilter?: BuyerPublishSelectionFilter | null;
}): Promise<BuyerPublishJobSnapshot> {
  const kind = input.kind || "publish";
  const key = publishJobSettingKey(kind);
  const requestId =
    kind === "republish"
      ? `rreq-${randomUUID().slice(0, 12)}`
      : `preq-${randomUUID().slice(0, 12)}`;

  const existing = await loadJob(kind);
  if (existing?.status === "running") {
    return toSnapshot(existing);
  }

  const ids = Array.from(new Set((input.ids || []).filter(Boolean))).slice(
    0,
    50_000
  );
  if (!ids.length) {
    throw new Error("Ingen produkter valgt");
  }

  let titles = (input.titles || []).map((t) => t || "");
  while (titles.length < ids.length) titles.push("");
  titles = titles.slice(0, ids.length);

  const now = new Date().toISOString();
  const jobId =
    kind === "republish"
      ? `repub-${randomUUID().slice(0, 10)}`
      : `pub-${randomUUID().slice(0, 10)}`;
  const batchSize = Math.min(
    100,
    Math.max(5, input.batchSize || DEFAULT_BATCH)
  );
  const totalBatches = Math.max(1, Math.ceil(ids.length / batchSize));

  const job: PersistedJob = {
    id: jobId,
    kind,
    requestId,
    status: "running",
    candidateIds: ids,
    candidateTitles: titles,
    cursor: 0,
    published: 0,
    failed: 0,
    skipped: 0,
    batchSize,
    batchIndex: 0,
    events: [
      {
        at: now,
        level: "ok",
        message: `${kind === "republish" ? "Republiseringsjobb" : "Jobb"} opprettet — ${ids.length.toLocaleString("no-NO")} produkter · ${totalBatches} batcher`,
      },
    ],
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    error: null,
    stopReason: null,
    stopDetail: null,
    thumbUp: input.thumbUp !== false,
    lockedUntil: null,
    actorEmail: input.actorEmail || null,
    selectionFilter: input.selectionFilter || null,
    lastWorkerTickAt: null,
    lastPublishedProductId: null,
    lastPublishedProductName: null,
    nextBatchProductName: titles[0] || null,
    reasonCounts: {},
    cjErrors: 0,
    shopifyErrors: 0,
    retries: 0,
  };

  await prisma.setting.upsert({
    where: { key },
    create: { key, value: job as unknown as Prisma.InputJsonValue },
    update: { value: job as unknown as Prisma.InputJsonValue },
  });

  const verified = await loadJob(kind);
  if (!verified || verified.id !== jobId) {
    throw new Error(
      kind === "republish"
        ? "Republiseringsjobb ble ikke lagret"
        : "Publiseringsjobb ble ikke lagret"
    );
  }

  publishLog(
    kind === "republish" ? "Republish job created" : "Publish job created",
    { requestId, jobId: verified.id, total: verified.candidateIds.length }
  );
  return toSnapshot(verified);
}

/**
 * Emergency resume — clears lock / error pause so worker continues same job.
 */
export async function resumeBuyerPublishJob(
  kind: BuyerPublishJobKind = "publish"
): Promise<BuyerPublishJobSnapshot | null> {
  const job = await loadJob(kind);
  if (!job) return null;

  const now = new Date().toISOString();
  if (job.status === "error") {
    job.status = "running";
  }
  if (job.status !== "running" && job.status !== "done") {
    return toSnapshot(job);
  }
  if (job.status === "done") return toSnapshot(job);

  job.lockedUntil = null;
  job.stopReason = null;
  job.stopDetail = null;
  job.error = null;
  job.updatedAt = now;
  job.lastWorkerTickAt = now;
  job.events = pushEvent(job.events, {
    at: now,
    level: "warn",
    message: "Fortsetter publisering (manuell resume)",
  });
  await saveJob(job);
  publishLog("Publish job resumed", {
    jobId: job.id,
    requestId: job.requestId,
    cursor: job.cursor,
  });
  return toSnapshot(job);
}

/**
 * Process next batch. Worker-owned. Auto-continues after restart
 * as long as status === running (expired locks are ignored).
 */
export async function tickBuyerPublishJob(opts?: {
  batchSize?: number;
  workerId?: string;
  kind?: BuyerPublishJobKind;
}): Promise<BuyerPublishJobSnapshot | null> {
  const kind = opts?.kind || "publish";
  let job = await loadJob(kind);
  if (!job) return null;
  if (job.status !== "running") return toSnapshot(job);

  const now = Date.now();
  // Auto-resume: only skip if lock is still fresh (another worker mid-batch)
  if (job.lockedUntil && new Date(job.lockedUntil).getTime() > now) {
    return toSnapshot(job);
  }

  const batchSize = Math.min(
    100,
    Math.max(5, opts?.batchSize || job.batchSize || DEFAULT_BATCH)
  );
  const slice = job.candidateIds.slice(job.cursor, job.cursor + batchSize);
  const nextBatchNum = job.batchIndex + 1;
  const tickIso = new Date().toISOString();

  job.lockedUntil = new Date(now + LOCK_MS).toISOString();
  job.updatedAt = tickIso;
  job.lastWorkerTickAt = tickIso;
  job.nextBatchProductName =
    job.candidateTitles[job.cursor] || job.nextBatchProductName;
  if (slice.length > 0) {
    job.events = pushEvent(job.events, {
      at: tickIso,
      level: "ok",
      message: `Starter batch ${nextBatchNum}`,
    });
  }
  await saveJob(job);

  if (slice.length === 0) {
    job.status = "done";
    job.finishedAt = new Date().toISOString();
    job.lockedUntil = null;
    job.lastWorkerTickAt = job.finishedAt;
    job.nextBatchProductName = null;
    job.events = pushEvent(job.events, {
      at: job.finishedAt,
      level: "ok",
      message: `Publisering fullført — ${job.published} publisert, ${job.skipped} hoppet over, ${job.failed} feilet`,
    });
    await saveJob(job);
    logPublishComplete(job);
    publishLog("Publish job done", {
      jobId: job.id,
      requestId: job.requestId,
      published: job.published,
    });
    return toSnapshot(job);
  }

  try {
    const result = await approveAndPublishCandidates({
      ids: slice,
      dryRun: false,
      thumbUp: job.thumbUp,
      actorEmail: job.actorEmail,
      limit: slice.length,
    });

    let batchPublished = 0;
    let batchFailed = 0;
    let batchSkipped = 0;
    let skipDup = 0;
    let lastPubId: string | null = null;
    let lastPubName: string | null = null;
    if (!job.reasonCounts) job.reasonCounts = {};

    for (const o of result.outcomes) {
      const kind = classifyOutcome(o);
      const reasonKey =
        kind === "published"
          ? "published"
          : (o.problems[0] || o.message || kind).slice(0, 120);
      job.reasonCounts[reasonKey] = (job.reasonCounts[reasonKey] || 0) + 1;
      if (kind === "published") {
        batchPublished += 1;
        lastPubId = o.candidateId;
        lastPubName = o.title || lastPubName;
      } else if (kind === "skipped") {
        batchSkipped += 1;
        if (isDuplicateMessage(o.message || "")) skipDup += 1;
      } else {
        batchFailed += 1;
        if (/cj|api points|rate limit|leverandør/i.test(o.message || "")) {
          job.cjErrors += 1;
        }
      }
    }

    job.published += batchPublished;
    job.failed += batchFailed;
    job.skipped += batchSkipped;
    job.cursor += slice.length;
    job.batchIndex += 1;
    job.updatedAt = new Date().toISOString();
    job.lastWorkerTickAt = job.updatedAt;
    job.lockedUntil = null;
    if (lastPubId) {
      job.lastPublishedProductId = lastPubId;
      job.lastPublishedProductName = lastPubName;
    }
    job.nextBatchProductName =
      job.cursor < job.candidateIds.length
        ? job.candidateTitles[job.cursor] || null
        : null;

    job.events = pushEvent(job.events, {
      at: job.updatedAt,
      level: "ok",
      message: `Batch ${job.batchIndex} ferdig (${slice.length})`,
    });
    if (batchPublished > 0) {
      job.events = pushEvent(job.events, {
        at: job.updatedAt,
        level: "ok",
        message: `${batchPublished} produkter publisert`,
      });
    }
    if (batchSkipped > 0) {
      job.events = pushEvent(job.events, {
        at: job.updatedAt,
        level: "warn",
        message: `${batchSkipped} hoppet over${skipDup ? ` (${skipDup} duplikat)` : ""}`,
      });
    }
    if (batchFailed > 0) {
      job.events = pushEvent(job.events, {
        at: job.updatedAt,
        level: "err",
        message: `${batchFailed} feilet i batch ${job.batchIndex}`,
      });
    }

    if (batchPublished > 0) {
      try {
        const { tickAssortmentMission } = await import(
          "@/lib/buyer/assortment-strategy"
        );
        await tickAssortmentMission(batchPublished);
      } catch {
        /* optional */
      }
      try {
        const { recordFocusPublishes } = await import(
          "@/lib/buyer/product-focus"
        );
        const pubTitles = result.outcomes
          .filter((o) => o.status === "published")
          .map((o) => o.title || "")
          .filter(Boolean);
        if (pubTitles.length) await recordFocusPublishes(pubTitles);
      } catch {
        /* optional */
      }
    }

    if (job.cursor >= job.candidateIds.length) {
      job.status = "done";
      job.finishedAt = new Date().toISOString();
      job.nextBatchProductName = null;
      job.events = pushEvent(job.events, {
        at: job.finishedAt,
        level: "ok",
        message: `Publisering fullført — ${job.published} publisert, ${job.skipped} hoppet over, ${job.failed} feilet`,
      });
      logPublishComplete(job);
    }

    await saveJob(job);
    return toSnapshot(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const friendly = formatFriendlySupplierError(message);
    job.lockedUntil = null;
    job.updatedAt = new Date().toISOString();
    job.lastWorkerTickAt = job.updatedAt;

    if (isRecoverableSupplierStop(message)) {
      // Pause without advancing cursor — worker / Fortsett retries same batch
      job.status = "error";
      job.stopReason = friendly?.title || "CJ API utilgjengelig";
      job.stopDetail = friendly?.detail || message;
      job.error = job.stopReason;
      job.cjErrors += 1;
      job.retries += 1;
      job.events = pushEvent(job.events, {
        at: job.updatedAt,
        level: "err",
        message: `Publiseringen stoppet: ${job.stopReason}`,
      });
      await saveJob(job);
      publishLog("Publish job paused", {
        jobId: job.id,
        requestId: job.requestId,
        reason: job.stopReason,
        detail: message.slice(0, 500),
      });
      return toSnapshot(job);
    }

    job.events = pushEvent(job.events, {
      at: job.updatedAt,
      level: "err",
      message: `Batch feilet: ${message.slice(0, 180)}`,
    });
    job.cursor += slice.length;
    job.failed += slice.length;
    job.batchIndex += 1;
    job.nextBatchProductName =
      job.cursor < job.candidateIds.length
        ? job.candidateTitles[job.cursor] || null
        : null;
    if (job.cursor >= job.candidateIds.length) {
      job.status = "done";
      job.finishedAt = job.updatedAt;
    }
    await saveJob(job);
    return toSnapshot(job);
  }
}
