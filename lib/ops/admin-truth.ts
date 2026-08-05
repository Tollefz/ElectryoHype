/**
 * Single source of truth for admin catalog / import metrics.
 * All dashboards should prefer these counts over local ad-hoc queries.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  DONE_OK_STATUSES,
  IN_FLIGHT_STATUSES,
  PIPELINE_BUCKETS,
  PIPELINE_BUCKET_LABELS,
  type PipelineBucket,
  statusToBucket,
} from "@/lib/ops/pipeline-status";
import {
  resolveJourneyStage,
  summarizeFailureReasons,
  type FailureReasonGroup,
  type ImportJourneyStage,
} from "@/lib/ops/import-failure-reasons";

export type PipelineCounts = Record<PipelineBucket, number> & {
  total: number;
  /** review + approved (awaiting publish) — Desk "importReview" */
  awaitingAdmin: number;
  /** queued + processing + AI stages */
  inPipeline: number;
};

export type ActivityWindow = {
  since: string;
  productsAnalyzed: number;
  imported: number;
  published: number;
  review: number;
  rejectedOrFailed: number;
  topImportCategory: { category: string; count: number } | null;
  topFailCategory: { category: string; count: number } | null;
  /** Minutes estimated from counted AI ops (45s analyze + 4m publish). Null if no ops. */
  estimatedMinutesSaved: number | null;
};

export type CatalogTruth = {
  productsTotal: number;
  productsActive: number;
  productsInactive: number;
  productsInStock: number;
};

export type AdminTruth = {
  generatedAt: string;
  pipeline: PipelineCounts;
  catalog: CatalogTruth;
  activity24h: ActivityWindow;
  activity7d: ActivityWindow;
};

export type BatchProgress = {
  total: number;
  found: number;
  byBucket: Record<PipelineBucket, number>;
  done: number;
  inFlight: number;
  queued: number;
  processing: number;
  /** AI stages only (validating…enriching…) */
  aiAnalyzing: number;
  /** processing status only */
  importing: number;
  review: number;
  approved: number;
  published: number;
  failed: number;
  /** review + approved — ready for admin */
  readyForReview: number;
  /** review + approved + published */
  succeeded: number;
  etaSeconds: number | null;
  /** True only when every known item left in-flight statuses. */
  complete: boolean;
  journeyStage: ImportJourneyStage;
  failureReasons: FailureReasonGroup[];
};

export async function getPipelineCounts(
  ids?: string[] | null
): Promise<PipelineCounts> {
  // ONE groupBy instead of 7× count — critical for Neon transfer
  const rows = await prisma.importQueueItem.groupBy({
    by: ["status"],
    where: ids && ids.length > 0 ? { id: { in: ids } } : undefined,
    _count: { _all: true },
  });

  const pipeline = Object.fromEntries(
    PIPELINE_BUCKETS.map((b) => [b, 0])
  ) as Record<PipelineBucket, number>;

  for (const row of rows) {
    const bucket = statusToBucket(row.status);
    if (!bucket) continue;
    pipeline[bucket] += row._count._all;
  }

  const total = Object.values(pipeline).reduce((a, b) => a + b, 0);
  const awaitingAdmin = pipeline.review + pipeline.ready_publish;
  const inPipeline =
    pipeline.queued + pipeline.importing + pipeline.ai_analyzing;

  return { ...pipeline, total, awaitingAdmin, inPipeline };
}

async function buildActivityWindow(ms: number): Promise<ActivityWindow> {
  const since = new Date(Date.now() - ms);
  const sinceIso = since.toISOString();

  const [
    scanAgg,
    imported,
    published,
    reviewCreated,
    failed,
    autonomyAnalyzed,
  ] = await Promise.all([
    prisma.buyerScanRun.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { scanned: true },
    }),
    prisma.importQueueItem.count({
      where: {
        createdAt: { gte: since },
        status: { notIn: ["failed"] },
      },
    }),
    prisma.importQueueItem.count({
      where: { updatedAt: { gte: since }, status: "published" },
    }),
    prisma.importQueueItem.count({
      where: { updatedAt: { gte: since }, status: "review" },
    }),
    prisma.importQueueItem.count({
      where: {
        updatedAt: { gte: since },
        status: "failed",
      },
    }),
    prisma.autonomyRun.findMany({
      where: { startedAt: { gte: since } },
      select: { summary: true },
      take: 40,
    }),
  ]);

  let productsAnalyzed = scanAgg._sum.scanned || 0;
  for (const run of autonomyAnalyzed) {
    const s = run.summary as { productsAnalyzed?: number } | null;
    productsAnalyzed += Number(s?.productsAnalyzed || 0);
  }

  const recentImports = await prisma.importQueueItem.findMany({
    where: { createdAt: { gte: since }, status: { not: "failed" } },
    select: { mappedDraft: true, title: true, status: true },
    take: 500,
  });
  const recentFails = await prisma.importQueueItem.findMany({
    where: { updatedAt: { gte: since }, status: "failed" },
    select: { mappedDraft: true, title: true },
    take: 200,
  });

  const catCount = (rows: Array<{ mappedDraft: unknown; title: string | null }>) => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const draft = row.mappedDraft as { category?: string } | null;
      const cat = (draft?.category || "").trim() || "Ukategorisert";
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    const top = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? { category: top[0], count: top[1] } : null;
  };

  const analyzedOps = productsAnalyzed;
  const publishedOps = published;
  const estimatedMinutesSaved =
    analyzedOps + publishedOps > 0
      ? Math.round(analyzedOps * 0.75 + publishedOps * 4)
      : null;

  return {
    since: sinceIso,
    productsAnalyzed,
    imported,
    published,
    review: reviewCreated,
    rejectedOrFailed: failed,
    topImportCategory: catCount(recentImports),
    topFailCategory: catCount(recentFails),
    estimatedMinutesSaved,
  };
}

export async function getCatalogTruth(storeId?: string | null): Promise<CatalogTruth> {
  const where = storeId ? { storeId } : {};
  // 2 queries instead of 3 — total + active; in-stock still needs its own filter
  const [byActive, productsInStock] = await Promise.all([
    prisma.product.groupBy({
      by: ["isActive"],
      where,
      _count: { _all: true },
    }),
    prisma.product.count({
      where: {
        ...where,
        isActive: true,
        OR: [
          { supplierStatus: "available" },
          { supplierStatus: "unknown", stock: { gt: 0 } },
          { supplierInventory: { gt: 0 } },
        ],
      },
    }),
  ]);

  let productsActive = 0;
  let productsInactive = 0;
  for (const row of byActive) {
    if (row.isActive) productsActive = row._count._all;
    else productsInactive = row._count._all;
  }
  const productsTotal = productsActive + productsInactive;

  return {
    productsTotal,
    productsActive,
    productsInactive,
    productsInStock,
  };
}

export async function getAdminTruth(opts?: {
  storeId?: string | null;
}): Promise<AdminTruth> {
  const [pipeline, catalog, activity24h, activity7d] = await Promise.all([
    getPipelineCounts(),
    getCatalogTruth(opts?.storeId),
    buildActivityWindow(24 * 60 * 60 * 1000),
    buildActivityWindow(7 * 24 * 60 * 60 * 1000),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    pipeline,
    catalog,
    activity24h,
    activity7d,
  };
}

/** Progress for a specific import batch (queue item ids). */
export async function getBatchProgress(ids: string[]): Promise<BatchProgress> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const emptyBuckets = Object.fromEntries(
    PIPELINE_BUCKETS.map((b) => [b, 0])
  ) as Record<PipelineBucket, number>;

  if (unique.length === 0) {
    return {
      total: 0,
      found: 0,
      byBucket: emptyBuckets,
      done: 0,
      inFlight: 0,
      queued: 0,
      processing: 0,
      aiAnalyzing: 0,
      importing: 0,
      review: 0,
      approved: 0,
      published: 0,
      failed: 0,
      readyForReview: 0,
      succeeded: 0,
      etaSeconds: null,
      complete: true,
      journeyStage: "done",
      failureReasons: [],
    };
  }

  const [rows, failedRows, stageRows] = await Promise.all([
    prisma.importQueueItem.groupBy({
      by: ["status"],
      where: { id: { in: unique } },
      _count: { _all: true },
    }),
    prisma.importQueueItem.findMany({
      where: { id: { in: unique }, status: "failed" },
      select: { error: true, reviewReason: true },
      take: 500,
    }),
    prisma.importQueueItem.groupBy({
      by: ["pipelineStage"],
      where: { id: { in: unique }, status: { notIn: ["failed", "published"] } },
      _count: { _all: true },
    }),
  ]);

  const byBucket = { ...emptyBuckets };
  let found = 0;
  for (const row of rows) {
    const bucket = statusToBucket(row.status);
    if (!bucket) continue;
    byBucket[bucket] += row._count._all;
    found += row._count._all;
  }

  const queued = byBucket.queued;
  const importing = byBucket.importing;
  const aiAnalyzing = byBucket.ai_analyzing;
  const processing = importing + aiAnalyzing;
  const inFlight = queued + processing;
  const review = byBucket.review;
  const approved = byBucket.ready_publish;
  const published = byBucket.published;
  const failed = byBucket.failed;
  const readyForReview = review + approved;
  const succeeded = review + approved + published;
  const done = succeeded + failed;
  // Complete when every found item left in-flight (don't wait forever for missing ids)
  const complete = inFlight === 0 && found > 0 && done === found;

  const etaSeconds =
    inFlight > 0 ? Math.max(5, Math.round(inFlight * 8)) : complete ? 0 : null;

  const failureReasons = summarizeFailureReasons(
    failedRows.map((r) => r.error || r.reviewReason)
  );

  let journeyStage = resolveJourneyStage({
    phase: complete ? "done" : "processing",
    queued,
    importing,
    aiAnalyzing,
    review,
    approved,
    published,
    failed,
    complete,
  });

  // Refine from pipelineStage when AI/category work is active
  if (!complete) {
    const stageMap = Object.fromEntries(
      stageRows.map((r) => [r.pipelineStage || "", r._count._all])
    );
    if ((stageMap.enrich || stageMap.enriching || 0) > 0 || aiAnalyzing > 0) {
      journeyStage = "ai_analyzing";
    } else if ((stageMap.categorize || stageMap.category || 0) > 0) {
      journeyStage = "categorizing";
    } else if ((stageMap.quality_check || stageMap.review || 0) > 0 && inFlight === 0) {
      journeyStage = "preparing_review";
    }
  }
  return {
    total: unique.length,
    found,
    byBucket,
    done,
    inFlight,
    queued,
    processing,
    aiAnalyzing,
    importing,
    review,
    approved,
    published,
    failed,
    readyForReview,
    succeeded,
    etaSeconds,
    complete,
    journeyStage,
    failureReasons,
  };
}

/**
 * Evidence-only morning brief lines from real activity (no filler).
 */
export function buildEvidenceMorningBrief(truth: AdminTruth): string {
  const a = truth.activity24h;
  const lines: string[] = ["God morgen.", ""];

  const facts: string[] = [];
  if (a.productsAnalyzed > 0) {
    facts.push(
      `${a.productsAnalyzed.toLocaleString("no-NO")} produkter analysert.`
    );
  }
  if (a.imported > 0) {
    facts.push(`${a.imported.toLocaleString("no-NO")} importert til kø.`);
  }
  if (a.published > 0) {
    facts.push(`${a.published.toLocaleString("no-NO")} publisert.`);
  }
  if (a.review > 0) {
    facts.push(`${a.review.toLocaleString("no-NO")} i review.`);
  }
  if (a.rejectedOrFailed > 0) {
    facts.push(`${a.rejectedOrFailed.toLocaleString("no-NO")} feilet / avvist.`);
  }
  if (a.topImportCategory) {
    facts.push(
      `Flest importer: ${a.topImportCategory.category} (${a.topImportCategory.count}).`
    );
  }
  if (a.topFailCategory) {
    facts.push(
      `Flest feil: ${a.topFailCategory.category} (${a.topFailCategory.count}).`
    );
  }
  if (a.estimatedMinutesSaved != null && a.estimatedMinutesSaved > 0) {
    const hours = Math.round((a.estimatedMinutesSaved / 60) * 10) / 10;
    facts.push(`Estimert spart tid (AI-operasjoner): ${hours} t.`);
  }

  if (facts.length === 0) {
    lines.push("Ingen katalogaktivitet siste 24 timer.");
    lines.push("Ikke nok data til morgenbrief.");
  } else {
    lines.push("Siste 24 timer:");
    lines.push("");
    lines.push(...facts);
  }

  const p = truth.pipeline;
  lines.push("");
  lines.push("Nå:");
  if (p.review > 0) {
    lines.push(
      `${p.review.toLocaleString("no-NO")} ${PIPELINE_BUCKET_LABELS.review.toLowerCase()}.`
    );
  }
  if (p.ready_publish > 0) {
    lines.push(
      `${p.ready_publish.toLocaleString("no-NO")} ${PIPELINE_BUCKET_LABELS.ready_publish.toLowerCase()}.`
    );
  }
  if (p.queued > 0) {
    lines.push(
      `${p.queued.toLocaleString("no-NO")} ${PIPELINE_BUCKET_LABELS.queued.toLowerCase()}.`
    );
  }
  if (p.failed > 0) {
    lines.push(
      `${p.failed.toLocaleString("no-NO")} ${PIPELINE_BUCKET_LABELS.failed.toLowerCase()}.`
    );
  }

  return lines.join("\n");
}

export {
  PIPELINE_BUCKET_LABELS,
  PIPELINE_BUCKETS,
  IN_FLIGHT_STATUSES,
  DONE_OK_STATUSES,
};
