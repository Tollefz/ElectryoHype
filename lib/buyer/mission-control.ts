/**
 * AI Mission Control — read-only observability for Product Hunt.
 * Never mutates AI state, queue, or catalog.
 */

import "server-only";

import { SupplierJobStatus, SupplierJobType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getBuyerHuntWorkerStatus,
  type BuyerHuntWorkerMetrics,
} from "@/lib/buyer/buyer-worker";
import {
  parseScanRequest,
  emptyRejectBreakdown,
} from "@/lib/buyer/category-missions";
import {
  parseDiscoveryValidation,
  type DiscoveryDecisionRecord,
} from "@/lib/buyer/discovery-validation";
import { computeMerchBrain } from "@/lib/buyer/merch-brain";
import {
  applyAiMemoryNudge,
  getAiMemory,
  scoreAiMemory,
} from "@/lib/buyer/ai-memory";
import { getStoreDna } from "@/lib/buyer/store-dna";
import { getAiFeedback } from "@/lib/buyer/ai-feedback";
import { getStoreIdentityMissionSnapshot } from "@/lib/identity";
import type { StoreIdentityMissionSnapshot } from "@/lib/identity";
import { familyLabel, matchFamily } from "@/lib/intelligence/families";
import { getWorkerObservability } from "@/lib/suppliers/workers/jobs";
import { adminErrorCountLastHour, getAdminErrorRing } from "@/lib/admin/admin-logger";

export type MissionControlSnapshot = {
  generatedAt: string;
  readOnly: true;
  /** Active buyer publish job (if any) — for phase strip. */
  publishJob: {
    id: string;
    status: string;
    processed: number;
    total: number;
    productsPerMin: number | null;
  } | null;
  worker: BuyerHuntWorkerMetrics & {
    stalePendingAlert: boolean;
  };
  discovery: {
    activeFamily: {
      familyId: string;
      label: string;
      groupLabel: string;
      query: string;
      reason: string;
      needScore: number | null;
      fatiguePct: number | null;
    } | null;
    nextFamilies: Array<{
      familyId: string;
      label: string;
      groupLabel: string;
      query: string;
      reason: string;
    }>;
    groupQuotas: Array<{ groupId: string; label: string; pct: number }>;
    whyChosen: string[];
    deferred: Array<{
      familyId: string;
      label: string;
      groupLabel: string;
      needScore: number;
      reasons: string[];
      fatiguePct: number;
    }>;
    lastDecisionAt: string | null;
  };
  scanner: {
    scanRunId: string | null;
    status: string | null;
    stageLabel: string | null;
    supplierLabel: string | null;
    seedQuery: string | null;
    cjSearchQuery: string | null;
    scanned: number;
    kept: number;
    filtered: number;
    target: number;
    productsPerMin: number | null;
    rejectBreakdown: Record<string, number>;
    error: string | null;
    checkpoint: {
      page: number | null;
      seedIdx: number | null;
      supplierIdx: number | null;
    };
  };
  candidates: {
    total: number;
    lastHour: number;
    last24h: number;
    byFamily: Array<{ familyId: string; label: string; count: number }>;
    byCategory: Array<{ category: string; count: number }>;
    topFamilies: Array<{ familyId: string; label: string; count: number }>;
    underrepresented: Array<{
      familyId: string;
      label: string;
      needScore: number;
      catalogHave: number;
      reasons: string[];
    }>;
  };
  merchTop: Array<{
    id: string;
    title: string;
    rank: number | null;
    butikkscore: number;
    shopMatchPct: number;
    pillars: Array<{
      id: string;
      label: string;
      points: number;
      max: number;
      detail?: string;
    }>;
    recommendation: string;
    memoryNudge: number;
    memoryWhy: string[];
  }>;
  economy: {
    avgMarginPct: number | null;
    medianMarginPct: number | null;
    belowTarget: number;
    priceErrors: number;
    landedCostErrors: number;
    currencyErrors: number;
    avgEconomicConfidence: number | null;
    sampleSize: number;
  };
  system: {
    apiLatencyMs: number | null;
    dbOk: boolean;
    cjCallsNote: string;
    cacheHitRate: string;
    reactQueryCache: string;
    queueSize: number;
    memory: {
      rssMb: number | null;
      heapUsedMb: number | null;
    };
    cpu: {
      loadAvg1: number | null;
      note: string;
    };
    errorsLastHour: number;
  };
  /** AI Store Memory — hunt experience (not chat, not process heap) */
  aiMemory: {
    memoryScore: number;
    published: number;
    rejected: number;
    liked: number;
    disliked: number;
    deleted: number;
    learnedLast30d: number;
    patternCount: number;
    rebuiltAt: string;
    topPositive: Array<{
      label: string;
      kind: string;
      experience: number;
      why: string[];
      published: number;
      rejected: number;
    }>;
    topNegative: Array<{
      label: string;
      kind: string;
      experience: number;
      why: string[];
      published: number;
      rejected: number;
    }>;
  };
  /** Store DNA — observed catalog identity (not Product Focus intent) */
  storeDna: {
    rebuiltAt: string;
    productCount: number;
    traits: Array<{
      id: string;
      label: string;
      pct: number;
      productCount: number;
    }>;
    changeWeek: Array<{
      id: string;
      label: string;
      from: number;
      to: number;
      delta: number;
    }>;
    changeMonth: Array<{
      id: string;
      label: string;
      from: number;
      to: number;
      delta: number;
    }>;
    strengthens: Array<{
      productId: string;
      title: string;
      why: string;
      alignment: number;
    }>;
      weakens: Array<{
      productId: string;
      title: string;
      why: string;
      alignment: number;
    }>;
  };
  /** Store Identity Fit — would a customer expect this here? */
  storeIdentity: StoreIdentityMissionSnapshot;
  /** Performance Feedback — learn from sales/margin/refunds */
  aiFeedback: {
    rebuiltAt: string;
    topPerforming: Array<{
      label: string;
      confidence: number;
      unitsSold: number;
      why: string[];
    }>;
    worstPerforming: Array<{
      label: string;
      confidence: number;
      unitsSold: number;
      why: string[];
    }>;
    learningNow: Array<{ label: string; confidence: number; why: string[] }>;
    positive: Array<{ label: string; confidence: number; why: string[] }>;
    negative: Array<{ label: string; confidence: number; why: string[] }>;
    confidenceOverTime: Array<{ at: string; avgConfidence: number }>;
    familyHistory: Array<{
      label: string;
      points: Array<{ at: string; confidence: number }>;
    }>;
    stubs: { clicksViews: string; trueReturns: string };
  };
  timeline: Array<{
    at: string;
    kind:
      | "discovery"
      | "scanner"
      | "worker"
      | "candidate"
      | "publish"
      | "error";
    title: string;
    detail?: string;
  }>;
};

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10;
  }
  return Math.round(sorted[mid]! * 10) / 10;
}

function familyFromCandidate(row: {
  title: string | null;
  scores: unknown;
  snapshot: unknown;
}): { familyId: string; label: string; category: string } {
  const scores = asObj(row.scores);
  const assortment = asObj(scores.assortment);
  const focus = asObj(scores.productFocus);
  const snap = asObj(row.snapshot);
  const category =
    (typeof snap.categoryHint === "string" && snap.categoryHint) ||
    (typeof snap.category === "string" && snap.category) ||
    "Ukjent";
  const title = (row.title || "").trim() || "Uten tittel";
  const fromScores =
    (typeof assortment.familyId === "string" && assortment.familyId) ||
    (typeof focus.familyId === "string" && focus.familyId) ||
    null;
  const id = fromScores || matchFamily(title, category) || "unknown";
  return {
    familyId: id,
    label: id === "unknown" ? "Ukjent" : familyLabel(id),
    category,
  };
}

function merchPillarsForCandidate(
  row: {
    title: string | null;
    shopMatchPct: number;
    overallScore: number;
    scores: unknown;
    pricing: unknown;
    snapshot: unknown;
    risks: unknown;
    supplier?: string | null;
    fingerprint?: string | null;
  },
  aiMemory: Awaited<ReturnType<typeof getAiMemory>> | null
) {
  const scores = asObj(row.scores);
  const pricing = asObj(row.pricing);
  const snap = asObj(row.snapshot);
  const assortment = asObj(scores.assortment);
  const focus = asObj(scores.productFocus);
  const economic = asObj(pricing.economic);
  const title = (row.title || "").trim() || "Uten tittel";

  const marginPct =
    num(pricing.estimatedMarginPct) ??
    num(pricing.marginPct) ??
    num(economic.marginPct);
  const retailNOK =
    num(pricing.estimatedRetailNOK) ??
    num(pricing.retailNOK) ??
    num(economic.retailNOK);
  const landedCostNOK =
    num(pricing.landedCostNOK) ?? num(economic.landedCostNOK);
  const profitNOK =
    num(pricing.estimatedMarginNOK) ??
    num(pricing.marginNOK) ??
    num(economic.marginNOK) ??
    (retailNOK != null && landedCostNOK != null
      ? retailNOK - landedCostNOK
      : null);

  const brain = computeMerchBrain({
    title,
    categoryHint:
      typeof snap.categoryHint === "string"
        ? snap.categoryHint
        : typeof snap.category === "string"
          ? snap.category
          : null,
    shopMatchPct: row.shopMatchPct,
    overallScore: row.overallScore,
    assortmentTotal: num(assortment.total),
    productFocusScore: num(focus.score),
    marginPct,
    profitNOK,
    landedCostNOK,
    retailNOK,
    deliveryHint:
      typeof snap.deliveryTime === "string" ? snap.deliveryTime : null,
    stock: num(snap.stock),
    economicConfidence:
      num(pricing.economicConfidence) ?? num(economic.confidence),
  });

  const shopRow = {
    id: "shop_match",
    label: "Butikkmatch",
    points: Math.round((Math.min(100, Math.max(0, row.shopMatchPct)) / 100) * 18),
    max: 18,
    detail: `${Math.round(row.shopMatchPct)}%`,
  };

  let butikkscore = brain.butikkscore;
  let memoryNudge = 0;
  let memoryWhy: string[] = [];
  const pillars = [
    shopRow,
    ...brain.breakdown.map((b) => ({
      id: String(b.id),
      label: b.label,
      points: b.points,
      max: b.max,
      detail: b.detail,
    })),
  ];

  if (aiMemory) {
    const mem = scoreAiMemory(aiMemory, {
      title,
      supplier: row.supplier,
      fingerprint: row.fingerprint,
      categoryHint:
        typeof snap.categoryHint === "string"
          ? snap.categoryHint
          : typeof snap.category === "string"
            ? snap.category
            : null,
    });
    const applied = applyAiMemoryNudge(brain.butikkscore, mem);
    butikkscore = applied.butikkscore;
    memoryNudge = applied.memoryNudge;
    memoryWhy = applied.memoryWhy;
    if (memoryNudge !== 0 || memoryWhy.length) {
      pillars.push({
        id: "memory",
        label: "AI Memory",
        points: memoryNudge,
        max: 3,
        detail: memoryWhy[0],
      });
    }
  }

  return {
    butikkscore,
    recommendation: brain.recommendation,
    pillars,
    memoryNudge,
    memoryWhy,
  };
}

/**
 * Full read-only Mission Control snapshot.
 */
export async function getMissionControlSnapshot(): Promise<MissionControlSnapshot> {
  const now = new Date();
  const since1h = new Date(now.getTime() - 60 * 60_000);
  const since24h = new Date(now.getTime() - 24 * 60 * 60_000);

  const dbStarted = Date.now();
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const apiLatencyMs = Date.now() - dbStarted;

  const scan = await prisma.buyerScanRun.findFirst({
    orderBy: { createdAt: "desc" },
  });

  const [
    worker,
    workersObs,
    totalCandidates,
    lastHour,
    last24h,
    recentForDist,
    topCandidates,
    recentJobs,
    published24h,
    aiMemory,
    storeDna,
    aiFeedback,
    publishSnap,
    storeIdentity,
  ] = await Promise.all([
    getBuyerHuntWorkerStatus(),
    getWorkerObservability().catch(() => null),
    prisma.buyerCandidate.count({
      where: scan?.id ? { scanRunId: scan.id } : undefined,
    }),
    prisma.buyerCandidate.count({
      where: {
        createdAt: { gte: since1h },
        ...(scan?.id ? { scanRunId: scan.id } : {}),
      },
    }),
    prisma.buyerCandidate.count({
      where: {
        createdAt: { gte: since24h },
        ...(scan?.id ? { scanRunId: scan.id } : {}),
      },
    }),
    prisma.buyerCandidate.findMany({
      where: {
        createdAt: { gte: since24h },
        ...(scan?.id ? { scanRunId: scan.id } : {}),
      },
      select: {
        title: true,
        scores: true,
        snapshot: true,
        createdAt: true,
      },
      take: 800,
      orderBy: { createdAt: "desc" },
    }),
    prisma.buyerCandidate.findMany({
      where: {
        status: "ranked",
        isBestInGroup: true,
        ...(scan?.id ? { scanRunId: scan.id } : {}),
      },
      orderBy:
        scan?.status === "running" || scan?.status === "queued"
          ? [{ shopMatchPct: "desc" }, { overallScore: "desc" }]
          : [{ rank: "asc" }, { shopMatchPct: "desc" }],
      take: 20,
      select: {
        id: true,
        title: true,
        rank: true,
        shopMatchPct: true,
        overallScore: true,
        scores: true,
        pricing: true,
        snapshot: true,
        risks: true,
        supplier: true,
        fingerprint: true,
      },
    }),
    prisma.supplierJob.findMany({
      where: {
        type: SupplierJobType.buyer_scan_batch,
        updatedAt: { gte: since24h },
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        status: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        updatedAt: true,
        lastError: true,
        progressMessage: true,
      },
    }),
    prisma.product.count({
      where: {
        isActive: true,
        updatedAt: { gte: since24h },
        OR: [
          { autoImport: true },
          { supplierProductId: { not: null } },
        ],
      },
    }),
    getAiMemory().catch(() => null),
    getStoreDna().catch(() => null),
    getAiFeedback().catch(() => null),
    import("@/lib/buyer/publish-job")
      .then((m) => m.getBuyerPublishJob())
      .catch(() => null),
    getStoreIdentityMissionSnapshot().catch(() => null),
  ]);

  const publishJobSnap = publishSnap
    ? {
        id: publishSnap.id,
        status: publishSnap.status,
        processed: publishSnap.processed,
        total: publishSnap.totalProducts,
        productsPerMin: publishSnap.productsPerMin,
      }
    : null;

  const parsed = parseScanRequest(scan?.request);
  const req = asObj(scan?.request);
  const discoveryValidation = parseDiscoveryValidation(req.discoveryValidation);
  const plan = parsed.progress?.discoveryPlan ?? null;
  const lastDecision: DiscoveryDecisionRecord | null =
    plan?.lastDecision ||
    discoveryValidation.decisions[discoveryValidation.decisions.length - 1] ||
    null;

  const cp = asObj(scan?.checkpoint);

  const familyCounts = new Map<string, { label: string; count: number }>();
  const categoryCounts = new Map<string, number>();
  for (const row of recentForDist) {
    const f = familyFromCandidate(row);
    const prev = familyCounts.get(f.familyId);
    if (prev) prev.count += 1;
    else familyCounts.set(f.familyId, { label: f.label, count: 1 });
    categoryCounts.set(f.category, (categoryCounts.get(f.category) || 0) + 1);
  }

  const byFamily = [...familyCounts.entries()]
    .map(([familyId, v]) => ({ familyId, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count);
  const byCategory = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const deferredUnder = (lastDecision?.deferred || [])
    .filter((d) => d.catalogHave < 3 || d.needScore >= 40)
    .sort((a, b) => b.needScore - a.needScore)
    .slice(0, 12)
    .map((d) => ({
      familyId: d.familyId,
      label: d.label,
      needScore: d.needScore,
      catalogHave: d.catalogHave,
      reasons: d.reasons.slice(0, 3),
    }));

  const merchTop = topCandidates.map((c) => {
    const merch = merchPillarsForCandidate(c, aiMemory);
    return {
      id: c.id,
      title: (c.title || "").trim() || "Uten tittel",
      rank: c.rank,
      butikkscore: merch.butikkscore,
      shopMatchPct: Math.round(c.shopMatchPct),
      pillars: merch.pillars,
      recommendation: merch.recommendation,
      memoryNudge: merch.memoryNudge,
      memoryWhy: merch.memoryWhy,
    };
  });

  const economySample = await prisma.buyerCandidate.findMany({
    where: { createdAt: { gte: since24h }, status: "ranked" },
    select: { pricing: true },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  const allMargins: number[] = [];
  const allConf: number[] = [];
  let below = 0;
  let priceErr = 0;
  let landedErr = 0;
  let fxErr = 0;
  for (const c of economySample) {
    const pricing = asObj(c.pricing);
    const economic = asObj(pricing.economic);
    const flags = Array.isArray(economic.flags)
      ? economic.flags.map(String)
      : [];
    const margin =
      num(pricing.estimatedMarginPct) ??
      num(pricing.marginPct) ??
      num(economic.marginPct);
    if (margin != null) {
      allMargins.push(margin);
      if (margin < 35) below += 1;
    }
    const conf = num(pricing.economicConfidence) ?? num(economic.confidence);
    if (conf != null) allConf.push(conf);
    if (
      flags.includes("price_changed") ||
      flags.includes("economic_control_failed") ||
      flags.includes("sale_below_landed") ||
      flags.includes("negative_margin")
    ) {
      priceErr += 1;
    }
    if (
      flags.includes("freight_changed") ||
      flags.includes("freight_exceeds_product")
    ) {
      landedErr += 1;
    }
    if (flags.includes("fx_stale") || asObj(economic.fx).stale === true) {
      fxErr += 1;
    }
  }

  const mem =
    typeof process !== "undefined" && typeof process.memoryUsage === "function"
      ? process.memoryUsage()
      : null;
  const loadAvgFn = (
    process as NodeJS.Process & { loadavg?: () => number[] }
  ).loadavg;
  const load =
    typeof loadAvgFn === "function" ? loadAvgFn.call(process) : null;

  const timeline: MissionControlSnapshot["timeline"] = [];

  for (const d of discoveryValidation.decisions.slice(-30)) {
    timeline.push({
      at: d.at,
      kind: "discovery",
      title: `Discovery → ${d.label}`,
      detail: d.whyChosen.slice(0, 2).join(" · ") || d.query,
    });
  }

  for (const j of recentJobs) {
    const at = (j.finishedAt || j.startedAt || j.updatedAt).toISOString();
    if (j.status === SupplierJobStatus.succeeded) {
      timeline.push({
        at,
        kind: "worker",
        title: "Worker batch ferdig",
        detail: j.id,
      });
    } else if (j.status === SupplierJobStatus.failed || j.status === SupplierJobStatus.dead) {
      timeline.push({
        at,
        kind: "error",
        title: `Worker ${j.status}`,
        detail: j.lastError || j.progressMessage || j.id,
      });
    } else if (
      j.status === SupplierJobStatus.running ||
      j.status === SupplierJobStatus.locked
    ) {
      timeline.push({
        at,
        kind: "scanner",
        title: "Scanner batch aktiv",
        detail: j.progressMessage || j.id,
      });
    }
  }

  // Candidate bursts — hourly buckets last 24h
  const hourBuckets = new Map<string, number>();
  for (const row of recentForDist) {
    const key = new Date(row.createdAt);
    key.setMinutes(0, 0, 0);
    const iso = key.toISOString();
    hourBuckets.set(iso, (hourBuckets.get(iso) || 0) + 1);
  }
  for (const [at, count] of hourBuckets) {
    if (count > 0) {
      timeline.push({
        at,
        kind: "candidate",
        title: `${count} nye kandidater`,
        detail: "siste 24t (timebøtte)",
      });
    }
  }

  if (published24h > 0) {
    timeline.push({
      at: now.toISOString(),
      kind: "publish",
      title: `${published24h} aktive/oppdaterte produkter (24t)`,
      detail: "katalog (read-only teller)",
    });
  }

  if (scan?.error) {
    timeline.push({
      at: scan.updatedAt.toISOString(),
      kind: "error",
      title: "Scan-feil",
      detail: scan.error.slice(0, 200),
    });
  }

  for (const err of getAdminErrorRing().slice(0, 15)) {
    timeline.push({
      at: err.timestamp,
      kind: "error",
      title: err.label || err.kind,
      detail: err.message.slice(0, 160),
    });
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const stalePendingAlert =
    worker.pendingJobs > 0 && worker.status === "stopped";

  const cjQuery =
    plan?.now?.query ||
    parsed.progress?.seedQuery ||
    lastDecision?.query ||
    null;

  return {
    generatedAt: now.toISOString(),
    readOnly: true,
    publishJob: publishJobSnap,
    worker: {
      ...worker,
      stalePendingAlert,
    },
    discovery: {
      activeFamily: plan?.now
        ? {
            familyId: plan.now.familyId,
            label: plan.now.label,
            groupLabel: plan.now.groupLabel,
            query: plan.now.query,
            reason: plan.now.reason,
            needScore: lastDecision?.needScore ?? null,
            fatiguePct: lastDecision?.factors.fatiguePct ?? null,
          }
        : lastDecision
          ? {
              familyId: lastDecision.familyId,
              label: lastDecision.label,
              groupLabel: lastDecision.groupLabel,
              query: lastDecision.query,
              reason: lastDecision.whyChosen[0] || lastDecision.note,
              needScore: lastDecision.needScore,
              fatiguePct: lastDecision.factors.fatiguePct,
            }
          : null,
      nextFamilies: (plan?.queue || []).slice(0, 10).map((q) => ({
        familyId: q.familyId,
        label: q.label,
        groupLabel: q.groupLabel,
        query: q.query,
        reason: q.reason,
      })),
      groupQuotas: plan?.groupSharePct || [],
      whyChosen: lastDecision?.whyChosen || [],
      deferred: (lastDecision?.deferred || []).slice(0, 12).map((d) => ({
        familyId: d.familyId,
        label: d.label,
        groupLabel: d.groupLabel,
        needScore: d.needScore,
        reasons: d.reasons.slice(0, 3),
        fatiguePct: d.fatiguePct,
      })),
      lastDecisionAt: lastDecision?.at ?? null,
    },
    scanner: {
      scanRunId: scan?.id ?? null,
      status: scan?.status ?? null,
      stageLabel: parsed.progress?.stageLabel ?? null,
      supplierLabel: parsed.progress?.supplierLabel ?? null,
      seedQuery: parsed.progress?.seedQuery ?? null,
      cjSearchQuery: cjQuery,
      scanned: scan?.scanned ?? 0,
      kept: scan?.kept ?? 0,
      filtered: scan?.filtered ?? 0,
      target: scan?.targetScanCount ?? 0,
      productsPerMin: worker.productsPerMin,
      rejectBreakdown:
        parsed.progress?.rejectBreakdown || emptyRejectBreakdown(),
      error: scan?.error ?? null,
      checkpoint: {
        page: typeof cp.page === "number" ? cp.page : null,
        seedIdx: typeof cp.seedIdx === "number" ? cp.seedIdx : null,
        supplierIdx: typeof cp.supplierIdx === "number" ? cp.supplierIdx : null,
      },
    },
    candidates: {
      total: totalCandidates,
      lastHour,
      last24h,
      byFamily: byFamily.slice(0, 30),
      byCategory: byCategory.slice(0, 20),
      topFamilies: byFamily.slice(0, 20),
      underrepresented: deferredUnder,
    },
    merchTop,
    economy: {
      avgMarginPct:
        allMargins.length > 0
          ? Math.round(
              (allMargins.reduce((a, b) => a + b, 0) / allMargins.length) * 10
            ) / 10
          : null,
      medianMarginPct: median(allMargins),
      belowTarget: below,
      priceErrors: priceErr,
      landedCostErrors: landedErr,
      currencyErrors: fxErr,
      avgEconomicConfidence:
        allConf.length > 0
          ? Math.round(
              (allConf.reduce((a, b) => a + b, 0) / allConf.length) * 10
            ) / 10
          : null,
      sampleSize: economySample.length,
    },
    system: {
      apiLatencyMs,
      dbOk,
      cjCallsNote:
        "CJ-kall telles ikke sentralt ennå — se scanner query + worker jobs/min",
      cacheHitRate: "Ikke instrumentert (server)",
      reactQueryCache: "Klient-side — se nettverksfanen i nettleseren",
      queueSize:
        worker.pendingJobs +
        worker.claimedJobs +
        (workersObs?.queueLength ?? 0),
      memory: {
        rssMb: mem ? Math.round(mem.rss / (1024 * 1024)) : null,
        heapUsedMb: mem ? Math.round(mem.heapUsed / (1024 * 1024)) : null,
      },
      cpu: {
        loadAvg1: load && Number.isFinite(load[0]) ? load[0] : null,
        note:
          process.platform === "win32"
            ? "loadavg er begrenset på Windows"
            : "1-min load average",
      },
      errorsLastHour: adminErrorCountLastHour(),
    },
    aiMemory: {
      memoryScore: aiMemory?.stats.memoryScore ?? 50,
      published: aiMemory?.stats.published ?? 0,
      rejected: aiMemory?.stats.rejected ?? 0,
      liked: aiMemory?.stats.liked ?? 0,
      disliked: aiMemory?.stats.disliked ?? 0,
      deleted: aiMemory?.stats.deleted ?? 0,
      learnedLast30d: aiMemory?.stats.learnedLast30d ?? 0,
      patternCount: aiMemory?.stats.patternCount ?? 0,
      rebuiltAt: aiMemory?.rebuiltAt ?? now.toISOString(),
      topPositive: (aiMemory?.topPositive || []).slice(0, 8).map((p) => ({
        label: p.label,
        kind: p.kind,
        experience: p.experience,
        why: p.why,
        published: p.published,
        rejected: p.rejected,
      })),
      topNegative: (aiMemory?.topNegative || []).slice(0, 8).map((p) => ({
        label: p.label,
        kind: p.kind,
        experience: p.experience,
        why: p.why,
        published: p.published,
        rejected: p.rejected,
      })),
    },
    storeDna: {
      rebuiltAt: storeDna?.rebuiltAt ?? now.toISOString(),
      productCount: storeDna?.productCount ?? 0,
      traits: (storeDna?.traits || []).map((t) => ({
        id: t.id,
        label: t.label,
        pct: t.pct,
        productCount: t.productCount,
      })),
      changeWeek: storeDna?.changeWeek || [],
      changeMonth: storeDna?.changeMonth || [],
      strengthens: (storeDna?.strengthens || []).slice(0, 10).map((s) => ({
        productId: s.productId,
        title: s.title,
        why: s.why,
        alignment: s.alignment,
      })),
      weakens: (storeDna?.weakens || []).slice(0, 10).map((s) => ({
        productId: s.productId,
        title: s.title,
        why: s.why,
        alignment: s.alignment,
      })),
    },
    storeIdentity: storeIdentity || {
      rebuiltAt: now.toISOString(),
      contextStoreName: "Butikken",
      catalogProductCount: 0,
      lowFitCandidates: [],
      commonReasons: [],
      rejectedCategoryHints: [],
      strengthensProfile: [],
      avgFitRecent: null,
      rejectBandCount: 0,
      weakBandCount: 0,
    },
    aiFeedback: {
      rebuiltAt: aiFeedback?.rebuiltAt ?? now.toISOString(),
      topPerforming: (aiFeedback?.topPerforming || []).map((e) => ({
        label: e.label,
        confidence: e.confidence,
        unitsSold: e.unitsSold,
        why: e.why,
      })),
      worstPerforming: (aiFeedback?.worstPerforming || []).map((e) => ({
        label: e.label,
        confidence: e.confidence,
        unitsSold: e.unitsSold,
        why: e.why,
      })),
      learningNow: (aiFeedback?.learningNow || []).map((e) => ({
        label: e.label,
        confidence: e.confidence,
        why: e.why,
      })),
      positive: (aiFeedback?.positive || []).map((e) => ({
        label: e.label,
        confidence: e.confidence,
        why: e.why,
      })),
      negative: (aiFeedback?.negative || []).map((e) => ({
        label: e.label,
        confidence: e.confidence,
        why: e.why,
      })),
      confidenceOverTime: (aiFeedback?.confidenceOverTime || []).map((h) => ({
        at: h.at,
        avgConfidence: h.avgConfidence,
      })),
      familyHistory: (aiFeedback?.familyHistory || []).slice(0, 10).map((f) => ({
        label: f.label,
        points: f.points,
      })),
      stubs: aiFeedback?.stubs || {
        clicksViews: "Stub",
        trueReturns: "Stub",
      },
    },
    timeline: timeline.slice(0, 80),
  };
}
