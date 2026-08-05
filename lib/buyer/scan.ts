/**
 * Digital Buyer continuous scan engine.
 * Checkpointed batches via workers — does not block the rest of the system.
 * Reuses Merchandiser scoring; never duplicates vendor logic.
 */

import "server-only";

import type { Prisma, SupplierName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCatalogProvider,
  listActiveCatalogSupplierIds,
} from "@/lib/suppliers/registry";
import type {
  CatalogSupplierId,
  SupplierSearchResult,
} from "@/lib/suppliers/provider";
import { getOrCreateShopProfile } from "@/lib/suppliers/merchandiser/shop-profile";
import { analyzeSearchProduct } from "@/lib/suppliers/merchandiser/scoring";
import { buildScanSeeds } from "@/lib/suppliers/merchandiser/seeds";
import {
  getOrCreateStoreMemory,
  memoryFitScore,
  refreshStoreMemory,
} from "@/lib/autonomy/memory";
import { computeShopMatch } from "@/lib/buyer/match";
import { filterBuyerCandidate } from "@/lib/buyer/filter";
import { productFingerprint } from "@/lib/buyer/fingerprint";
import { summarizeDiscovery, tagDiscovery } from "@/lib/buyer/discovery";
import {
  BatchTimer,
  aggregateTopBottlenecks,
  formatBatchTimingLog,
  logBatchTiming,
  setFallbackBatchTimer,
  topBottlenecks,
  type BatchTimingReport,
} from "@/lib/buyer/batch-timing";
import {
  flushBuyerCandidateWrites,
  type PendingBuyerWrite,
} from "@/lib/buyer/batch-writes";
import type { BuyerCheckpoint } from "@/lib/buyer/types";
import {
  DISCOVERY_FAMILY_QUERIES,
  emptyDiscoveryState,
  loadDiscoveryContext,
  missionDiscoveryFilter,
  parseDiscoveryState,
  recordDiscoveryYield,
  resolveNextDiscoverySeed,
  type DiscoveryState,
} from "@/lib/buyer/discovery-scheduler";
import {
  buildDiscoverySummary,
  mergeObservedMetrics,
  parseDiscoveryValidation,
  type DiscoveryDecisionRecord,
  type DiscoveryObservedMetrics,
} from "@/lib/buyer/discovery-validation";
import { enqueueSupplierJob } from "@/lib/suppliers/workers/jobs";
import { logError } from "@/lib/utils/logger";
import {
  emptyRejectBreakdown,
  getCategoryMission,
  isMissionSize,
  mergeRejectReasons,
  missionSizeFromTarget,
  parseScanRequest,
  resolveMissionTargetCount,
  stageLabel,
  type BuyerMissionSize,
  type BuyerQuantityChoice,
  type BuyerScanProgress,
  type BuyerScanResultSummary,
  type BuyerMissionHistoryRow,
  type RejectBucketId,
} from "@/lib/buyer/category-missions";
import type { ScanSeed } from "@/lib/suppliers/merchandiser/seeds";
import { scanCeilingForKeptTarget } from "@/lib/buyer/hunt-targets";

export { scanCeilingForKeptTarget } from "@/lib/buyer/hunt-targets";

const BATCH_EVAL_LIMIT = 40;
const PAGE_SIZE = 20;
/** Match Discovery Scheduler stay-window — do not page one CJ query forever. */
const MAX_PAGES_PER_FAMILY = 3;
const MAX_SEEN_KEYS = 2500;

function asRequest(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

/** Stop competing scans and cancel their pending batch jobs so the new mission owns the queue. */
export async function supersedeActiveBuyerScans(opts?: {
  storeId?: string | null;
  reason?: string;
}): Promise<{ superseded: string[]; cancelledJobs: number }> {
  const reason = opts?.reason || "Avbrutt — ny mission startet";
  const active = await prisma.buyerScanRun.findMany({
    where: {
      ...(opts?.storeId ? { storeId: opts.storeId } : {}),
      status: { in: ["queued", "running", "paused"] },
    },
    select: { id: true },
  });
  if (!active.length) return { superseded: [], cancelledJobs: 0 };

  const ids = active.map((r) => r.id);
  await prisma.buyerScanRun.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "failed",
      error: reason,
      finishedAt: new Date(),
    },
  });

  const pendingJobs = await prisma.supplierJob.findMany({
    where: {
      type: "buyer_scan_batch",
      status: { in: ["pending", "failed", "locked", "running"] },
    },
    select: { id: true, payload: true, status: true },
  });

  let cancelledJobs = 0;
  for (const job of pendingJobs) {
    const payload = asRequest(job.payload);
    const scanRunId = typeof payload.scanRunId === "string" ? payload.scanRunId : "";
    if (!scanRunId || !ids.includes(scanRunId)) continue;
    await prisma.supplierJob.update({
      where: { id: job.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        finishedAt: new Date(),
        progressMessage: reason,
        lastError: reason,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });
    cancelledJobs += 1;
  }

  return { superseded: ids, cancelledJobs };
}

function readRejectBreakdown(raw: unknown): Record<RejectBucketId, number> {
  const base = emptyRejectBreakdown();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, number>;
  for (const k of Object.keys(base) as RejectBucketId[]) {
    if (typeof o[k] === "number") base[k] = o[k];
  }
  return base;
}

function buildMissionSeeds(
  categoryId: string | null | undefined,
  profile: Awaited<ReturnType<typeof getOrCreateShopProfile>>
): ScanSeed[] {
  const mission = categoryId ? getCategoryMission(categoryId) : null;
  if (mission) {
    return mission.seeds.map((s) => ({
      shelf: mission.shelf,
      query: s.query,
      sortBy: s.sortBy,
    }));
  }
  return buildScanSeeds(profile);
}

function toSupplierName(id: CatalogSupplierId): SupplierName {
  return id as SupplierName;
}

function parseCheckpoint(raw: unknown): BuyerCheckpoint {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<BuyerCheckpoint>;
  return {
    supplierIdx: Number(o.supplierIdx || 0),
    seedIdx: Number(o.seedIdx || 0),
    page: Math.max(1, Number(o.page || 1)),
    seenKeys: Array.isArray(o.seenKeys) ? o.seenKeys.map(String) : [],
    discovery: o.discovery
      ? parseDiscoveryState(o.discovery)
      : emptyDiscoveryState(),
  };
}

export type StartBuyerScanOptions = {
  storeId?: string | null;
  targetScanCount?: number;
  /**
   * Desired number of GOOD (kept/ranked) candidates.
   * Scan continues until kept reaches this, catalog is exhausted,
   * or targetScanCount (ceiling) is hit — quality is never lowered.
   */
  targetKeptCount?: number;
  /** Process first batch inline (dev/manual); otherwise enqueue worker. */
  processInline?: boolean;
  /** Category mission id — AI builds this category */
  categoryId?: string | null;
  quantityChoice?: BuyerQuantityChoice;
  missionSize?: BuyerMissionSize;
  startedBy?: string;
};

async function writeProgress(
  scanRunId: string,
  req: Record<string, unknown>,
  progress: BuyerScanProgress
) {
  await prisma.buyerScanRun.update({
    where: { id: scanRunId },
    data: {
      request: { ...req, progress } as unknown as Prisma.InputJsonValue,
    },
  });
}

/** Start a checkpointed discovery scan and enqueue first batch. */
export async function startBuyerScan(opts: StartBuyerScanOptions = {}) {
  // One mission at a time — otherwise workers drain oldest jobs and Robin sees a frozen board
  await supersedeActiveBuyerScans({
    storeId: opts.storeId,
    reason: "Avbrutt — ny mission startet",
  });

  const mission = opts.categoryId ? getCategoryMission(opts.categoryId) : null;
  const missionSize: BuyerMissionSize =
    opts.missionSize ||
    (isMissionSize(opts.quantityChoice)
      ? opts.quantityChoice
      : opts.targetScanCount
        ? missionSizeFromTarget(opts.targetScanCount)
        : "quick");

  const quantityChoice: BuyerQuantityChoice = opts.quantityChoice ?? missionSize;

  const targetKeptCount =
    opts.targetKeptCount != null && Number.isFinite(opts.targetKeptCount)
      ? Math.min(50_000, Math.max(10, Math.round(opts.targetKeptCount)))
      : null;

  const targetScanCount = Math.min(
    1_000_000,
    Math.max(
      10,
      opts.targetScanCount ||
        (targetKeptCount != null
          ? scanCeilingForKeptTarget(targetKeptCount)
          : resolveMissionTargetCount(quantityChoice, mission))
    )
  );

  const suppliers = listActiveCatalogSupplierIds();
  const baseProgress = (stage: BuyerScanProgress["stage"]): BuyerScanProgress => ({
    stage,
    stageLabel: stageLabel(stage),
    supplierLabel: null,
    seedQuery: null,
    current: 0,
    total: targetScanCount,
    kept: 0,
    filtered: 0,
    rejectBreakdown: emptyRejectBreakdown(),
    categoryId: mission?.id || null,
    categoryLabel: mission ? `${mission.emoji} ${mission.label}` : "Full katalog",
    subcategoryPlan: mission?.subcategories || [],
    quantityChoice,
    missionSize,
  });

  const run = await prisma.buyerScanRun.create({
    data: {
      storeId: opts.storeId || null,
      status: "running",
      targetScanCount,
      startedAt: new Date(),
      suppliers,
      request: {
        targetScanCount,
        targetKeptCount,
        startedBy: opts.startedBy || "digital_buyer",
        categoryId: mission?.id || null,
        categoryLabel: mission?.label || null,
        quantityChoice,
        missionSize,
        subcategoryPlan: mission?.subcategories || [],
        progress: baseProgress("connecting_suppliers"),
        result: null,
      },
      checkpoint: {
        supplierIdx: 0,
        seedIdx: 0,
        page: 1,
        seenKeys: [],
        discovery: {
          familyScanCounts: {},
          groupScanCounts: {},
          recentFamilies: [],
          queryVariantIdx: {},
          currentFamilyId: null,
          currentQuery: null,
          pagesOnCurrent: 0,
          emptyStreak: 0,
        },
      },
    },
  });

  const req = asRequest(
    (
      await prisma.buyerScanRun.findUnique({
        where: { id: run.id },
        select: { request: true },
      })
    )?.request
  );

  await writeProgress(run.id, req, baseProgress("connecting_suppliers"));
  await writeProgress(run.id, req, baseProgress("reading_profile"));
  await getOrCreateShopProfile(opts.storeId).catch(() => undefined);
  await writeProgress(run.id, req, baseProgress("reading_memory"));
  await refreshStoreMemory(opts.storeId).catch(() => undefined);
  await writeProgress(run.id, req, baseProgress("scanning"));

  // Never inline massive missions
  const processInline =
    opts.processInline === true &&
    (targetScanCount <= 100 ||
      (targetKeptCount != null && targetKeptCount <= 25));

  if (processInline) {
    let guard = 0;
    while (guard < 500) {
      guard += 1;
      const result = await processBuyerScanBatch(run.id);
      if (result.done) break;
    }
    return prisma.buyerScanRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  await enqueueSupplierJob({
    type: "buyer_scan_batch",
    idempotencyKey: `buyer_scan_batch:${run.id}:${Date.now()}`,
    payload: { scanRunId: run.id },
  });

  return prisma.buyerScanRun.findUniqueOrThrow({ where: { id: run.id } });
}

export type ProcessBatchResult = {
  done: boolean;
  scannedDelta: number;
  keptDelta: number;
  filteredDelta: number;
  scanned: number;
  target: number;
};

/**
 * Process one batch of evaluations, update checkpoint, enqueue next if needed.
 */
export async function processBuyerScanBatch(
  scanRunId: string
): Promise<ProcessBatchResult> {
  const run = await prisma.buyerScanRun.findUnique({ where: { id: scanRunId } });
  if (!run) throw new Error("BuyerScanRun not found");
  if (run.status === "completed" || run.status === "failed" || run.status === "paused") {
    return {
      done: true,
      scannedDelta: 0,
      keptDelta: 0,
      filteredDelta: 0,
      scanned: run.scanned,
      target: run.targetScanCount,
    };
  }

  const timer = new BatchTimer();
  setFallbackBatchTimer(timer);
  timer.start();
  const scannedBefore = run.scanned;
  let scannedDelta = 0;
  let keptDelta = 0;
  let filteredDelta = 0;

  const profile = await timer.measureAsync("database", () =>
    getOrCreateShopProfile(run.storeId)
  );
  const memory = await timer.measureAsync("memory", () =>
    getOrCreateStoreMemory(run.storeId)
  );
  const req = asRequest(run.request);
  const categoryId =
    typeof req.categoryId === "string" ? req.categoryId : null;
  /** Fallback static seeds only if Discovery Scheduler cannot load context */
  const fallbackSeeds = buildMissionSeeds(categoryId, profile);
  const supplierIds = (
    Array.isArray(run.suppliers) ? (run.suppliers as string[]) : listActiveCatalogSupplierIds()
  ).filter(Boolean) as CatalogSupplierId[];
  let rejectBreakdown = readRejectBreakdown(
    (req.progress as BuyerScanProgress | undefined)?.rejectBreakdown
  );

  if (supplierIds.length === 0) {
    timer.stop();
    setFallbackBatchTimer(null);
    await prisma.buyerScanRun.update({
      where: { id: scanRunId },
      data: {
        status: "failed",
        error: "Ingen leverandører",
        finishedAt: new Date(),
      },
    });
    return {
      done: true,
      scannedDelta: 0,
      keptDelta: 0,
      filteredDelta: 0,
      scanned: run.scanned,
      target: run.targetScanCount,
    };
  }

  let cp = parseCheckpoint(run.checkpoint);
  let discovery: DiscoveryState = parseDiscoveryState(cp.discovery);
  let discoveryPlan: BuyerScanProgress["discoveryPlan"] =
    (req.progress as BuyerScanProgress | undefined)?.discoveryPlan || null;
  let discoveryValidation = parseDiscoveryValidation(req.discoveryValidation);
  const discoveryCtx = await timer.measureAsync("discovery", () =>
    loadDiscoveryContext(run.storeId).catch(() => null)
  );
  const missionFilter = missionDiscoveryFilter(categoryId);
  const seen = new Set(cp.seenKeys);
  scannedDelta = 0;
  keptDelta = 0;
  filteredDelta = 0;
  let exhausted = false;
  const targetKeptEarly =
    typeof req.targetKeptCount === "number" && Number.isFinite(req.targetKeptCount)
      ? Number(req.targetKeptCount)
      : null;

  /** Prefetch next CJ page (same query) while flushing DB — Discovery order unchanged. */
  let cjPrefetch: {
    key: string;
    promise: Promise<SupplierSearchResult>;
  } | null = null;

  const cjSearchKey = (
    supplierId: string,
    query: string,
    sortBy: string,
    page: number
  ) => `${supplierId}|${query}|${sortBy}|${page}`;

  // One-shot: wipe carried ranks from prior finalize so live board uses fresh scores
  if (!req.ranksInvalidatedForHunt) {
    await timer.measureAsync("database", async () => {
      await prisma.buyerCandidate.updateMany({
        where: { scanRunId, rank: { not: null } },
        data: { rank: null },
      });
      req.ranksInvalidatedForHunt = true;
      await prisma.buyerScanRun.update({
        where: { id: scanRunId },
        data: {
          request: req as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  // AI Memory / Store DNA / Feedback are display-time nudges — not invoked in hunt batch.
  // Keep buckets at 0 so logs make the absence explicit.

  const recordDecision = (decision: DiscoveryDecisionRecord | null) => {
    if (!decision) return;
    discoveryValidation = {
      ...discoveryValidation,
      decisions: [...discoveryValidation.decisions, decision].slice(-200),
    };
  };

  const noteObservedYield = (
    familyId: string | null | undefined,
    sample: Omit<DiscoveryObservedMetrics, "sampleCount">
  ) => {
    if (!familyId) return;
    discoveryValidation = {
      ...discoveryValidation,
      observedByFamily: {
        ...discoveryValidation.observedByFamily,
        [familyId]: mergeObservedMetrics(
          discoveryValidation.observedByFamily[familyId],
          sample
        ),
      },
    };
  };

  try {
    while (scannedDelta < BATCH_EVAL_LIMIT) {
      if (run.scanned + scannedDelta >= run.targetScanCount) break;
      if (
        targetKeptEarly != null &&
        run.kept + keptDelta >= targetKeptEarly
      ) {
        break;
      }

      if (cp.supplierIdx >= supplierIds.length) {
        exhausted = true;
        break;
      }

      const supplierId = supplierIds[cp.supplierIdx];
      const provider = getCatalogProvider(supplierId);
      if (!(await provider.isConfigured())) {
        cp.supplierIdx += 1;
        cp.seedIdx = 0;
        cp.page = 1;
        discovery = {
          ...discovery,
          currentFamilyId: null,
          currentQuery: null,
          pagesOnCurrent: 0,
          emptyStreak: 0,
        };
        continue;
      }

      // Discovery Scheduler picks family/query — not static seed round-robin
      let seed: {
        query: string;
        sortBy: import("@/lib/suppliers/provider").SupplierSortBy;
        shelf: import("@/lib/suppliers/merchandiser/types").MerchandiserShelf;
        familyId?: string;
        label?: string;
      };

      if (discoveryCtx) {
        // Reuse current family while paging — but never beyond MAX_PAGES_PER_FAMILY.
        // Previously reusePaging ignored pagesOnCurrent, so MagSafe could run 300+
        // products on one query without Discovery decisions or rotation.
        const pagesOnCurrent = discovery.pagesOnCurrent || 0;
        const reusePaging =
          cp.page > 1 &&
          Boolean(discovery.currentFamilyId) &&
          Boolean(discovery.currentQuery) &&
          pagesOnCurrent < MAX_PAGES_PER_FAMILY;
        if (reusePaging) {
          const def =
            DISCOVERY_FAMILY_QUERIES.find(
              (f) => f.familyId === discovery.currentFamilyId
            ) || DISCOVERY_FAMILY_QUERIES[0];
          seed = {
            query: discovery.currentQuery!,
            sortBy: def.sortBy,
            shelf: def.shelf,
            familyId: discovery.currentFamilyId!,
            label: def.label,
          };
          discovery = {
            ...discovery,
            pagesOnCurrent: pagesOnCurrent + 1,
          };
        } else {
          const forceAdvance =
            cp.page > 1 && pagesOnCurrent >= MAX_PAGES_PER_FAMILY;
          const resolved = timer.measureSync("discovery", () =>
            resolveNextDiscoverySeed({
              state: discovery,
              snapshot: discoveryCtx.snapshot,
              targets: discoveryCtx.targets,
              bounds: discoveryCtx.bounds,
              starsByFamily: discoveryCtx.starsByFamily,
              customFamilies: discoveryCtx.customFamilies,
              forceAdvance,
              observedByFamily: discoveryValidation.observedByFamily,
              ...missionFilter,
            })
          );
          discovery = resolved.state;
          discoveryPlan = resolved.plan;
          recordDecision(resolved.decision);
          seed = resolved.seed;
          if (forceAdvance || resolved.decision?.switchedFamily) {
            cp.page = 1;
          }
        }
      } else {
        const fb = fallbackSeeds[cp.seedIdx];
        if (!fb) {
          cp.supplierIdx += 1;
          cp.seedIdx = 0;
          cp.page = 1;
          continue;
        }
        seed = fb;
      }

      const searchKey = cjSearchKey(
        supplierId,
        seed.query,
        String(seed.sortBy),
        cp.page
      );
      let result: SupplierSearchResult;
      if (cjPrefetch && cjPrefetch.key === searchKey) {
        result = await timer.measureAsync("cjSearch", () => cjPrefetch!.promise);
        cjPrefetch = null;
      } else {
        cjPrefetch = null;
        result = await timer.measureAsync("cjSearch", () =>
          provider.searchProducts({
            query: seed.query,
            sortBy: seed.sortBy,
            page: cp.page,
            pageSize: PAGE_SIZE,
          })
        );
      }

      if (!result.products.length) {
        discovery = {
          ...discovery,
          emptyStreak: (discovery.emptyStreak || 0) + 1,
        };
        if (
          discovery.emptyStreak >= Math.max(8, DISCOVERY_FAMILY_QUERIES.length)
        ) {
          cp.supplierIdx += 1;
          cp.seedIdx = 0;
          cp.page = 1;
          discovery = {
            ...discovery,
            currentFamilyId: null,
            currentQuery: null,
            pagesOnCurrent: 0,
            emptyStreak: 0,
          };
        } else if (discoveryCtx) {
          const next = timer.measureSync("discovery", () =>
            resolveNextDiscoverySeed({
              state: discovery,
              snapshot: discoveryCtx.snapshot,
              targets: discoveryCtx.targets,
              bounds: discoveryCtx.bounds,
              starsByFamily: discoveryCtx.starsByFamily,
              customFamilies: discoveryCtx.customFamilies,
              forceAdvance: true,
              observedByFamily: discoveryValidation.observedByFamily,
              ...missionFilter,
            })
          );
          discovery = next.state;
          discoveryPlan = next.plan;
          recordDecision(next.decision);
          cp.page = 1;
          cp.seedIdx += 1;
        } else {
          cp.seedIdx += 1;
          cp.page = 1;
          if (cp.seedIdx >= fallbackSeeds.length) {
            cp.supplierIdx += 1;
            cp.seedIdx = 0;
          }
        }
        continue;
      }

      discovery = { ...discovery, emptyStreak: 0 };
      let pageYield = 0;
      const pendingWrites: PendingBuyerWrite[] = [];

      for (const p of result.products) {
        if (scannedDelta >= BATCH_EVAL_LIMIT) break;
        if (run.scanned + scannedDelta >= run.targetScanCount) break;
        if (
          targetKeptEarly != null &&
          run.kept + keptDelta >= targetKeptEarly
        ) {
          break;
        }

        const key = `${supplierId}:${p.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        scannedDelta += 1;
        pageYield += 1;

        const analysis = analyzeSearchProduct(p, {
          profile,
          shelf: seed.shelf,
        });

        const memFit = timer.measureSync("memory", () =>
          memoryFitScore(memory, {
            title: p.title,
            categoryHint: analysis.categoryHint,
            shelf: seed.shelf,
            retailNOK: analysis.pricing.estimatedRetailNOK,
            premiumPotential: analysis.pricing.premiumPotential,
          })
        );

        const match = timer.measureSync("matching", () =>
          computeShopMatch({
            analysis,
            profile,
            memory,
            memoryFit: memFit.score,
          })
        );

        const imageCount = p.imageUrl ? 1 : 0;

        const gate = filterBuyerCandidate({
          analysis,
          shopMatchPct: match.pct,
          imageCount,
          stock: p.stock ?? null,
          stage: "search",
        });

        const fp = productFingerprint(p.title);
        const tags = tagDiscovery(analysis, analysis.categoryHint);
        const snapshot = {
          id: p.id,
          title: p.title,
          imageUrl: p.imageUrl,
          images: p.imageUrl ? [p.imageUrl] : [],
          price: p.price,
          currency: p.currency,
          category: p.category,
          stock: p.stock,
          deliveryTime: p.deliveryTime || null,
          variantCount: p.variantCount || 0,
          supplierUrl: p.supplierUrl || null,
          shelf: seed.shelf,
          categoryHint: analysis.categoryHint || null,
        } as Prisma.InputJsonValue;

        const supplierName = toSupplierName(supplierId);

        if (!gate.pass) {
          filteredDelta += 1;
          rejectBreakdown = mergeRejectReasons(rejectBreakdown, gate.reasons);
          pendingWrites.push({
            kind: "filtered",
            storeId: run.storeId,
            scanRunId,
            supplier: supplierName,
            supplierProductId: p.id,
            title: p.title,
            imageUrl: p.imageUrl || null,
            supplierPrice: p.price,
            supplierCurrency: p.currency || "USD",
            overallScore: analysis.scores.overall,
            shopMatchPct: match.pct,
            shopMatchWhy: match.why,
            scores: analysis.scores as unknown as Prisma.InputJsonValue,
            reasons: analysis.reasons as unknown as Prisma.InputJsonValue,
            risks: analysis.risks as unknown as Prisma.InputJsonValue,
            pricing: analysis.pricing as unknown as Prisma.InputJsonValue,
            discoveryTags: tags as unknown as Prisma.InputJsonValue,
            fingerprint: fp,
            filterReasons: gate.reasons,
            snapshot,
          });
          continue;
        }

        keptDelta += 1;

        // Discovery validation — observed product pillars for this search family
        {
          const pricing =
            analysis.pricing && typeof analysis.pricing === "object"
              ? (analysis.pricing as Record<string, unknown>)
              : {};
          const margin =
            typeof pricing.marginPct === "number"
              ? pricing.marginPct
              : typeof pricing.estimatedMarginPct === "number"
                ? pricing.estimatedMarginPct
                : null;
          const retail =
            typeof pricing.retailNOK === "number"
              ? pricing.retailNOK
              : typeof pricing.estimatedRetailNOK === "number"
                ? pricing.estimatedRetailNOK
                : null;
          const landed =
            typeof pricing.landedCostNOK === "number"
              ? pricing.landedCostNOK
              : null;
          const profit =
            typeof pricing.marginNOK === "number"
              ? pricing.marginNOK
              : retail != null && landed != null
                ? retail - landed
                : null;
          let deliveryDays: number | null = null;
          const dt = p.deliveryTime || null;
          if (dt) {
            const m = String(dt).match(/(\d+)\s*[-–]?\s*(\d+)?/);
            if (m) {
              const a = Number(m[1]);
              const b = m[2] ? Number(m[2]) : a;
              if (Number.isFinite(a)) deliveryDays = Math.round((a + b) / 2);
            }
          }
          noteObservedYield(seed.familyId, {
            shopMatchPct: match.pct,
            profitNOK: profit,
            marginPct: margin,
            deliveryDays,
            supplierRiskPct: null,
            demandScore: null,
            inventoryScore:
              typeof p.stock === "number"
                ? p.stock <= 0
                  ? 5
                  : p.stock < 20
                    ? 40
                    : p.stock < 150
                      ? 75
                      : 90
                : null,
            merchScore: null,
          });
        }

        pendingWrites.push({
          kind: "kept",
          storeId: run.storeId,
          scanRunId,
          supplier: supplierName,
          supplierProductId: p.id,
          title: p.title,
          imageUrl: p.imageUrl || null,
          supplierPrice: p.price,
          supplierCurrency: p.currency || "USD",
          overallScore: analysis.scores.overall,
          shopMatchPct: match.pct,
          shopMatchWhy: [...match.why, ...memFit.why],
          scores: analysis.scores as unknown as Prisma.InputJsonValue,
          reasons: analysis.reasons as unknown as Prisma.InputJsonValue,
          risks: analysis.risks as unknown as Prisma.InputJsonValue,
          pricing: analysis.pricing as unknown as Prisma.InputJsonValue,
          discoveryTags: tags as unknown as Prisma.InputJsonValue,
          fingerprint: fp,
          snapshot,
          shelf: seed.shelf,
          categoryHint: analysis.categoryHint || null,
          market: {
            ...analysis.market,
            shopMatchPct: match.pct,
          } as unknown as Prisma.InputJsonValue,
          visual: analysis.visual as unknown as Prisma.InputJsonValue,
          explanation: `Butikk-match ${match.pct}%. ${analysis.explanation}`,
          merchReasons: [...analysis.reasons, ...match.why.slice(0, 2)],
        });
      }

      if (seed.familyId) {
        discovery = recordDiscoveryYield(discovery, seed.familyId, pageYield);
      }

      // Next page or Discovery Scheduler advances to next family
      const willContinuePaging =
        cp.page < (result.totalPages || cp.page) &&
        result.products.length >= PAGE_SIZE;

      // Prefetch next page BEFORE flush so CJ QPS wait overlaps with DB writes
      if (willContinuePaging) {
        const nextPage = cp.page + 1;
        const nextKey = cjSearchKey(
          supplierId,
          seed.query,
          String(seed.sortBy),
          nextPage
        );
        cjPrefetch = {
          key: nextKey,
          promise: provider.searchProducts({
            query: seed.query,
            sortBy: seed.sortBy,
            page: nextPage,
            pageSize: PAGE_SIZE,
          }),
        };
      } else {
        cjPrefetch = null;
      }

      await timer.measureAsync("database", () =>
        flushBuyerCandidateWrites(pendingWrites)
      );

      if (willContinuePaging) {
        cp.page += 1;
      } else if (discoveryCtx) {
        const next = timer.measureSync("discovery", () =>
          resolveNextDiscoverySeed({
            state: discovery,
            snapshot: discoveryCtx.snapshot,
            targets: discoveryCtx.targets,
            bounds: discoveryCtx.bounds,
            starsByFamily: discoveryCtx.starsByFamily,
            customFamilies: discoveryCtx.customFamilies,
            forceAdvance: true,
            observedByFamily: discoveryValidation.observedByFamily,
            ...missionFilter,
          })
        );
        discovery = next.state;
        discoveryPlan = next.plan;
        recordDecision(next.decision);
        cp.page = 1;
        cp.seedIdx += 1;
      } else {
        cp.seedIdx += 1;
        cp.page = 1;
        if (cp.seedIdx >= fallbackSeeds.length) {
          cp.supplierIdx += 1;
          cp.seedIdx = 0;
        }
      }
    }

    if (cp.supplierIdx >= supplierIds.length) exhausted = true;

    const scanned = run.scanned + scannedDelta;
    const kept = run.kept + keptDelta;
    const filtered = run.filtered + filteredDelta;
    const targetKept =
      typeof req.targetKeptCount === "number" && Number.isFinite(req.targetKeptCount)
        ? Number(req.targetKeptCount)
        : null;
    const keptGoalReached = targetKept != null && kept >= targetKept;
    const done =
      keptGoalReached || scanned >= run.targetScanCount || exhausted;

    cp.seenKeys = [...seen].slice(-MAX_SEEN_KEYS);
    cp.discovery = discovery;

    const activeSupplier = supplierIds[Math.min(cp.supplierIdx, supplierIds.length - 1)];
    const activeSeedQuery =
      discovery.currentQuery ||
      discoveryPlan?.now?.query ||
      fallbackSeeds[Math.min(cp.seedIdx, Math.max(0, fallbackSeeds.length - 1))]
        ?.query ||
      null;
    const missionSize = isMissionSize(req.missionSize)
      ? req.missionSize
      : missionSizeFromTarget(run.targetScanCount);

    // Night missions pause during daytime — resume via nightly cron (checkpoint preserved)
    const hour = new Date().getHours();
    const pauseForDay =
      !done && missionSize === "night" && hour >= 7 && hour < 22;

    const stage: BuyerScanProgress["stage"] = pauseForDay
      ? "paused"
      : done
        ? "filtering"
        : scannedDelta > 0
          ? "analyzing"
          : "scanning";

    const progress: BuyerScanProgress = {
      stage,
      stageLabel: stageLabel(stage, {
        supplier: activeSupplier || null,
        seed: activeSeedQuery,
      }),
      supplierLabel: activeSupplier || null,
      seedQuery: activeSeedQuery,
      current: scanned,
      total: run.targetScanCount,
      kept,
      filtered,
      rejectBreakdown,
      categoryId,
      categoryLabel:
        typeof req.categoryLabel === "string" ? req.categoryLabel : null,
      subcategoryPlan: Array.isArray(req.subcategoryPlan)
        ? req.subcategoryPlan.map(String)
        : [],
      quantityChoice: (req.quantityChoice as BuyerQuantityChoice) || missionSize,
      missionSize,
      discoveryPlan: discoveryPlan
        ? {
            now: discoveryPlan.now
              ? {
                  familyId: discoveryPlan.now.familyId,
                  label: discoveryPlan.now.label,
                  groupId: discoveryPlan.now.groupId,
                  groupLabel: discoveryPlan.now.groupLabel,
                  query: discoveryPlan.now.query,
                  reason: discoveryPlan.now.reason,
                }
              : null,
            queue: discoveryPlan.queue.map((q) => ({
              familyId: q.familyId,
              label: q.label,
              groupId: q.groupId,
              groupLabel: q.groupLabel,
              query: q.query,
              reason: q.reason,
            })),
            groupSharePct: discoveryPlan.groupSharePct,
            updatedAt: discoveryPlan.updatedAt,
            lastDecision: discoveryPlan.lastDecision || null,
          }
        : null,
    };

    await timer.measureAsync("database", () =>
      prisma.buyerScanRun.update({
        where: { id: scanRunId },
        data: {
          scanned,
          kept,
          filtered,
          checkpoint: cp as unknown as Prisma.InputJsonValue,
          // Stay "running" through finalize so Robin sees Quality Gate → Review live
          status: pauseForDay ? "paused" : "running",
          finishedAt: null,
          error: null,
          request: {
            ...req,
            missionSize,
            progress,
            discoveryValidation,
          } as unknown as Prisma.InputJsonValue,
        },
      })
    );

    if (done) {
      await finalizeBuyerScan(scanRunId);
    } else if (!pauseForDay) {
      await enqueueSupplierJob({
        type: "buyer_scan_batch",
        idempotencyKey: `buyer_scan_batch:${scanRunId}:${scanned}`,
        payload: { scanRunId },
      });
    }

    return {
      done,
      scannedDelta,
      keptDelta,
      filteredDelta,
      scanned,
      target: run.targetScanCount,
    };
  } catch (error) {
    logError(error, "[buyer/scan]");
    const message = error instanceof Error ? error.message : "Scan feilet";
    const isRateLimit =
      /too many requests|qps|429|rate/i.test(message) ||
      (error instanceof Error &&
        "statusCode" in error &&
        (error as { statusCode?: number }).statusCode === 429);

    // Rate limits must not kill the mission — checkpoint stays, resume after backoff
    if (isRateLimit) {
      const req = asRequest(
        (
          await prisma.buyerScanRun.findUnique({
            where: { id: scanRunId },
            select: { request: true },
          })
        )?.request
      );
      await prisma.buyerScanRun.update({
        where: { id: scanRunId },
        data: {
          status: "running",
          error: `CJ rate limit — venter og fortsetter. (${message})`,
          finishedAt: null,
          checkpoint: cp as unknown as Prisma.InputJsonValue,
          request: {
            ...req,
            progress: {
              ...((req.progress as object) || {}),
              stage: "scanning",
              stageLabel: "Venter på CJ (rate limit)…",
            },
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await enqueueSupplierJob({
        type: "buyer_scan_batch",
        idempotencyKey: `buyer_scan_batch:${scanRunId}:retry:${Date.now()}`,
        payload: { scanRunId },
        runAfter: new Date(Date.now() + 5_000),
      });
      return {
        done: false,
        scannedDelta,
        keptDelta,
        filteredDelta,
        scanned: run.scanned + scannedDelta,
        target: run.targetScanCount,
      };
    }

    await prisma.buyerScanRun.update({
      where: { id: scanRunId },
      data: {
        status: "failed",
        error: message,
        finishedAt: new Date(),
        checkpoint: cp as unknown as Prisma.InputJsonValue,
      },
    });
    throw error;
  } finally {
    timer.stop();
    setFallbackBatchTimer(null);
    const batchNo = Math.floor(scannedBefore / BATCH_EVAL_LIMIT) + 1;
    const report = timer.report({
      batchNo,
      scanRunId,
      scannedBefore,
      scannedDelta,
      keptDelta,
      filteredDelta,
    });
    logBatchTiming(report);
    await persistBatchTimingReport(scanRunId, report).catch(() => undefined);
  }
}

const BUYER_BATCH_TIMING_SETTING = "buyer_batch_timing";

async function persistBatchTimingReport(
  scanRunId: string,
  report: BatchTimingReport
): Promise<void> {
  const existing = await prisma.setting.findUnique({
    where: { key: BUYER_BATCH_TIMING_SETTING },
  });
  const prev =
    existing?.value &&
    typeof existing.value === "object" &&
    !Array.isArray(existing.value)
      ? (existing.value as Record<string, unknown>)
      : {};
  const reports = Array.isArray(prev.reports)
    ? (prev.reports as BatchTimingReport[])
    : [];
  const nextReports = [...reports, report].slice(-40);
  const top10 = aggregateTopBottlenecks(nextReports, 10);
  const value = {
    updatedAt: new Date().toISOString(),
    scanRunId,
    last: report,
    lastLog: formatBatchTimingLog(report),
    lastTop: topBottlenecks(report, 10),
    reports: nextReports,
    top10,
  };
  await prisma.setting.upsert({
    where: { key: BUYER_BATCH_TIMING_SETTING },
    create: { key: BUYER_BATCH_TIMING_SETTING, value },
    update: { value },
  });

  // Also keep last few on the scan request for Mission Control / audit
  const run = await prisma.buyerScanRun.findUnique({
    where: { id: scanRunId },
    select: { request: true },
  });
  if (!run) return;
  const req = asRequest(run.request);
  const prevTimings = Array.isArray(req.batchTimings)
    ? (req.batchTimings as BatchTimingReport[])
    : [];
  req.batchTimings = [...prevTimings, report].slice(-12);
  await prisma.buyerScanRun.update({
    where: { id: scanRunId },
    data: { request: req as unknown as Prisma.InputJsonValue },
  });
}

/** Rank board, pick multi-supplier winners, attach discovery summary. */
export async function finalizeBuyerScan(scanRunId: string) {
  const run = await prisma.buyerScanRun.findUnique({ where: { id: scanRunId } });
  if (!run) return;

  const req = asRequest(run.request);
  const prevProgress = (req.progress || {}) as Partial<BuyerScanProgress>;
  let rejectBreakdown = readRejectBreakdown(prevProgress.rejectBreakdown);

  const setStage = async (stage: BuyerScanProgress["stage"]) => {
    const progress: BuyerScanProgress = {
      stage,
      stageLabel: stageLabel(stage),
      supplierLabel: prevProgress.supplierLabel || null,
      seedQuery: prevProgress.seedQuery || null,
      current: run.scanned,
      total: run.targetScanCount,
      kept: run.kept,
      filtered: run.filtered,
      rejectBreakdown,
      categoryId: typeof req.categoryId === "string" ? req.categoryId : null,
      categoryLabel: typeof req.categoryLabel === "string" ? req.categoryLabel : null,
      subcategoryPlan: Array.isArray(req.subcategoryPlan)
        ? req.subcategoryPlan.map(String)
        : [],
      quantityChoice: (req.quantityChoice as BuyerQuantityChoice) || null,
      missionSize: isMissionSize(req.missionSize)
        ? req.missionSize
        : missionSizeFromTarget(run.targetScanCount),
      huntThinking: prevProgress.huntThinking || null,
      discoveryPlan: prevProgress.discoveryPlan || null,
    };
    await prisma.buyerScanRun.update({
      where: { id: scanRunId },
      data: {
        request: { ...req, progress } as unknown as Prisma.InputJsonValue,
      },
    });
    Object.assign(req, { progress });
  };

  await setStage("filtering");
  await setStage("scoring");

  const ranked = await prisma.buyerCandidate.findMany({
    where: { scanRunId, status: "ranked" },
    orderBy: [{ shopMatchPct: "desc" }, { overallScore: "desc" }],
  });

  // Multi-supplier: group by fingerprint, keep best as isBestInGroup
  const byFp = new Map<string, typeof ranked>();
  for (const c of ranked) {
    const fp = c.fingerprint || c.id;
    const list = byFp.get(fp) || [];
    list.push(c);
    byFp.set(fp, list);
  }

  let duplicateCount = 0;
  for (const [, group] of byFp) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      const pa = a.supplierPrice ?? Infinity;
      const pb = b.supplierPrice ?? Infinity;
      if (b.shopMatchPct !== a.shopMatchPct) return b.shopMatchPct - a.shopMatchPct;
      if (pa !== pb) return pa - pb;
      return b.overallScore - a.overallScore;
    });
    const winner = sorted[0];
    for (const c of sorted) {
      if (c.id !== winner.id) duplicateCount += 1;
      await prisma.buyerCandidate.update({
        where: { id: c.id },
        data: { isBestInGroup: c.id === winner.id },
      });
    }
  }
  rejectBreakdown = {
    ...rejectBreakdown,
    duplicates: (rejectBreakdown.duplicates || 0) + duplicateCount,
  };

  // Store-builder re-rank — family first, build a complete shop
  const { buildCatalogSnapshot } = await import("@/lib/buyer/assortment-score");
  const { rankAsStoreBuilder } = await import("@/lib/buyer/hunt-store-builder");
  const { getAssortmentStrategy, targetMap, boundsMap } = await import(
    "@/lib/buyer/assortment-strategy"
  );
  const {
    getProductFocus,
    starsMap,
    scoreProductFocus,
    matchFamilyWithCustoms,
    familyTier,
  } = await import("@/lib/buyer/product-focus");
  const { getStoreIdentityContext } = await import("@/lib/identity");
  const catalogProducts = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(run.storeId ? { storeId: run.storeId } : {}),
    },
    select: { name: true, category: true, isActive: true },
    take: 8000,
  });
  const assortmentSnapshot = buildCatalogSnapshot(catalogProducts);
  const [assortmentStrategy, productFocusCfg, identityContext] =
    await Promise.all([
      getAssortmentStrategy(),
      getProductFocus(),
      getStoreIdentityContext(run.storeId).catch(() => null),
    ]);
  const assortmentTargets = targetMap(
    assortmentStrategy,
    assortmentSnapshot.totalActive
  );
  const assortmentBounds = boundsMap(
    assortmentStrategy,
    assortmentSnapshot.totalActive
  );
  const focusStars = starsMap(productFocusCfg);

  const board = await prisma.buyerCandidate.findMany({
    where: { scanRunId, status: "ranked", isBestInGroup: true },
    orderBy: [{ shopMatchPct: "desc" }, { overallScore: "desc" }],
  });

  const { ordered: merchOrdered, thinking: huntThinking } = rankAsStoreBuilder(
    board.map((c) => {
      const snap = c.snapshot as {
        categoryHint?: string;
        category?: string;
        deliveryHint?: string;
        deliveryTime?: string;
        stock?: number;
        listedCount?: number;
        rating?: number;
      } | null;
      const pricing =
        c.pricing && typeof c.pricing === "object"
          ? (c.pricing as Record<string, unknown>)
          : {};
      const margin =
        typeof pricing.marginPct === "number"
          ? pricing.marginPct
          : typeof pricing.estimatedMarginPct === "number"
            ? pricing.estimatedMarginPct
            : typeof pricing.grossMarginPct === "number"
              ? pricing.grossMarginPct
              : null;
      const retail =
        typeof pricing.retailNOK === "number"
          ? pricing.retailNOK
          : typeof pricing.estimatedRetailNOK === "number"
            ? pricing.estimatedRetailNOK
            : null;
      const landed =
        typeof pricing.landedCostNOK === "number"
          ? pricing.landedCostNOK
          : null;
      const profit =
        typeof pricing.marginNOK === "number"
          ? pricing.marginNOK
          : retail != null && landed != null
            ? retail - landed
            : null;
      const econ =
        pricing.economic && typeof pricing.economic === "object"
          ? (pricing.economic as { confidence?: number })
          : null;
      return {
        id: c.id,
        title: c.title || "",
        categoryHint: snap?.categoryHint || snap?.category || null,
        shopMatchPct: c.shopMatchPct,
        overallScore: c.overallScore,
        supplier: c.supplier,
        marginPct: margin,
        deliveryHint: snap?.deliveryHint || snap?.deliveryTime || null,
        profitNOK: profit,
        landedCostNOK: landed,
        retailNOK: retail,
        stock: snap?.stock ?? null,
        listedCount: snap?.listedCount ?? null,
        rating: snap?.rating ?? null,
        economicConfidence:
          typeof pricing.economicConfidence === "number"
            ? pricing.economicConfidence
            : econ?.confidence ?? null,
      };
    }),
    assortmentSnapshot,
    assortmentTargets,
    assortmentBounds,
    {
      starsByFamily: focusStars,
      cooldownGap: 2,
      identityContext,
      matchFamilyFn: (title, cat) =>
        matchFamilyWithCustoms(title, cat, productFocusCfg.customFamilies),
      scoreFocusFn: ({ familyId, stars, shopMatchPct }) =>
        scoreProductFocus({
          familyId,
          stars: stars as 0 | 1 | 2 | 3 | 4 | 5,
          shopMatchPct,
          tier: familyId
            ? familyTier(familyId, productFocusCfg.customFamilies)
            : "core",
        }),
    }
  );

  // Persist live «AI tenker» snapshot on the scan run
  try {
    const reqNow =
      run.request && typeof run.request === "object"
        ? (run.request as Record<string, unknown>)
        : {};
    const progressNow =
      reqNow.progress && typeof reqNow.progress === "object"
        ? (reqNow.progress as Record<string, unknown>)
        : {};
    await prisma.buyerScanRun.update({
      where: { id: scanRunId },
      data: {
        request: {
          ...reqNow,
          progress: {
            ...progressNow,
            huntThinking,
          },
        } as Prisma.InputJsonValue,
      },
    });
  } catch {
    /* non-fatal */
  }

  let rank = 1;
  for (const row of merchOrdered) {
    const whyExtra = [
      ...row.assortment.why.slice(0, 3),
      ...row.productFocusWhy.slice(0, 2),
    ];
    const prevWhy = Array.isArray(board.find((b) => b.id === row.id)?.shopMatchWhy)
      ? (board.find((b) => b.id === row.id)!.shopMatchWhy as string[])
      : [];
    await prisma.buyerCandidate.update({
      where: { id: row.id },
      data: {
        rank: rank++,
        // Blend shop match toward merch so board sorts consistently
        shopMatchPct: Math.round(
          row.shopMatchPct * 0.55 + row.merchScore * 0.45
        ),
        shopMatchWhy: [
          ...prevWhy.filter(
            (w) =>
              !String(w).startsWith("Sortiment:") &&
              !String(w).startsWith("Produktfokus:") &&
              !String(w).startsWith("Butikkbygger:")
          ),
          ...whyExtra.map((w) =>
            w.startsWith("Produktfokus") || w.startsWith("Butikkbygger") || w.startsWith("Hunt")
              ? w
              : `Sortiment: ${w}`
          ),
        ].slice(0, 10),
        scores: {
          ...((board.find((b) => b.id === row.id)?.scores as object) || {}),
          merchScore: row.merchScore,
          assortment: {
            total: row.assortment.total,
            categoryBalance: row.assortment.categoryBalance,
            diversity: row.assortment.diversity,
            ecosystem: row.assortment.ecosystem,
            crossSell: row.assortment.crossSell,
            coverageGap: row.assortment.coverageGap,
            familyId: row.assortment.familyId,
            have: row.assortment.have,
            target: row.assortment.target,
            softMax: row.assortment.softMax,
            hardMax: row.assortment.hardMax,
            pastHard: row.assortment.pastHard,
          },
          productFocus: {
            score: row.productFocusScore,
            stars: row.productFocusStars,
            familyId: row.productFocusFamilyId,
            why: row.productFocusWhy,
          },
          identityFit: row.identityFit
            ? {
                score: row.identityFit.score,
                band: row.identityFit.band,
                why: row.identityFit.why,
                reasons: row.identityFit.reasons,
                familyId: row.identityFit.familyId,
                normallyBlockPublish: row.identityFit.normallyBlockPublish,
                signals: row.identityFit.signals.slice(0, 8),
              }
            : null,
          butikkscore: row.merchScore,
        } as Prisma.InputJsonValue,
      },
    });
  }

  await setStage("seo");
  await setStage("pricing");
  await setStage("quality_gate");
  await setStage("importing");
  await setStage("review");
  const withHints = board.map((c) => ({
    discoveryTags: c.discoveryTags,
    categoryHint:
      typeof c.snapshot === "object" && c.snapshot && "category" in (c.snapshot as object)
        ? String((c.snapshot as { category?: string }).category || "")
        : null,
  }));

  const discovery = summarizeDiscovery(withHints);

  const avgConfidence =
    board.length > 0
      ? Math.round(
          board.reduce((s, c) => s + (c.shopMatchPct + c.overallScore) / 2, 0) /
            board.length
        )
      : null;

  const passedQg = board.filter((c) => c.shopMatchPct >= 65 && c.overallScore >= 55)
    .length;

  const queued = await prisma.buyerCandidate.count({
    where: { scanRunId, status: "queued" },
  });
  const importedStatus = await prisma.buyerCandidate.count({
    where: { scanRunId, status: { in: ["queued", "imported"] } },
  });
  const dismissed = await prisma.buyerCandidate.count({
    where: { scanRunId, status: "dismissed" },
  });

  const readyToPublish = await prisma.importQueueItem.count({
    where: { status: { in: ["approved", "review"] } },
  });
  const published = await prisma.importQueueItem.count({
    where: { status: "published" },
  });
  const approvedImprovements = await prisma.storeImprovement.count({
    where: { status: { in: ["approved", "applied"] } },
  }).catch(() => 0);
  const rejectedImprovements = await prisma.storeImprovement.count({
    where: { status: "rejected" },
  }).catch(() => 0);

  const durationSec =
    run.startedAt
      ? Math.max(
          1,
          Math.round(
            ((run.finishedAt ? new Date(run.finishedAt) : new Date()).getTime() -
              new Date(run.startedAt).getTime()) /
              1000
          )
        )
      : null;

  const mission = typeof req.categoryId === "string"
    ? getCategoryMission(req.categoryId)
    : null;

  const missionSize = isMissionSize(req.missionSize)
    ? req.missionSize
    : missionSizeFromTarget(run.targetScanCount);

  // Tier mix from seed plan (strategy signal)
  const tierMix = { premium: 0, mid: 0, budget: 0 };
  if (mission) {
    for (const s of mission.seeds) {
      if (s.tier === "premium") tierMix.premium += 1;
      else if (s.tier === "budget") tierMix.budget += 1;
      else tierMix.mid += 1;
    }
  }

  const result: BuyerScanResultSummary = {
    analyzed: run.scanned,
    discarded: run.filtered + duplicateCount,
    candidates: board.length,
    passedAi: board.length,
    passedQualityGate: passedQg,
    imported: Math.max(queued, importedStatus),
    readyToPublish,
    published,
    approved: approvedImprovements,
    rejected: rejectedImprovements + dismissed,
    avgConfidence,
    durationSec,
    subcategoriesCovered: mission?.subcategories.length || 0,
    tierMix,
    missionSize,
    categoryLabel: typeof req.categoryLabel === "string" ? req.categoryLabel : mission?.label || null,
  };

  // AI Product Hunt Report — factual mix + averages (no LLM)
  const { buildProductHuntReport } = await import("@/lib/buyer/hunt-report");
  const publishedFromHunt = await prisma.buyerCandidate.count({
    where: { scanRunId, status: "imported" },
  });
  const huntReport = buildProductHuntReport({
    scanRunId,
    analyzed: run.scanned,
    discarded: run.filtered + duplicateCount + dismissed,
    published: publishedFromHunt,
    approvedCandidates: passedQg,
    candidates: board.map((c) => ({
      title: c.title || "",
      status: c.status,
      shopMatchPct: c.shopMatchPct,
      overallScore: c.overallScore,
      pricing: c.pricing,
      snapshot: c.snapshot,
      scores: c.scores,
    })),
    familyTargets: assortmentTargets,
  });
  console.log(`[buyer/hunt-report]\n${huntReport.text}`);

  // Discovery Summary — validation of scheduler decisions (no algorithm change)
  const discVal = parseDiscoveryValidation(req.discoveryValidation);
  const cpFinal = parseCheckpoint(run.checkpoint);
  const discState = parseDiscoveryState(cpFinal.discovery);
  const familyLabels: Record<string, string> = {};
  for (const f of DISCOVERY_FAMILY_QUERIES) {
    familyLabels[f.familyId] = f.label;
  }
  const discoverySummary = buildDiscoverySummary({
    scanRunId,
    decisions: discVal.decisions,
    familyScanCounts: discState.familyScanCounts,
    groupScanCounts: discState.groupScanCounts,
    familyLabels,
  });
  console.log(`[buyer/discovery-summary]\n${discoverySummary.text}`);
  const discoveryValidation = {
    ...discVal,
    summary: discoverySummary,
  };

  const progress: BuyerScanProgress = {
    stage: "done",
    stageLabel: stageLabel("done"),
    supplierLabel: null,
    seedQuery: null,
    current: run.scanned,
    total: run.targetScanCount,
    kept: run.kept,
    filtered: run.filtered,
    rejectBreakdown,
    categoryId: typeof req.categoryId === "string" ? req.categoryId : null,
    categoryLabel: typeof req.categoryLabel === "string" ? req.categoryLabel : null,
    subcategoryPlan: Array.isArray(req.subcategoryPlan)
      ? req.subcategoryPlan.map(String)
      : mission?.subcategories || [],
    quantityChoice: (req.quantityChoice as BuyerQuantityChoice) || missionSize,
    missionSize,
  };

  await prisma.buyerScanRun.update({
    where: { id: scanRunId },
    data: {
      status: "completed",
      finishedAt: new Date(),
      discovery: discovery as unknown as Prisma.InputJsonValue,
      request: {
        ...req,
        missionSize,
        progress,
        result,
        huntReport,
        discoveryValidation,
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function listBuyerMissionHistory(opts?: {
  storeId?: string | null;
  limit?: number;
}): Promise<BuyerMissionHistoryRow[]> {
  const rows = await prisma.buyerScanRun.findMany({
    where: opts?.storeId ? { storeId: opts.storeId } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(50, opts?.limit || 20),
  });

  return rows.map((run) => {
    const req = asRequest(run.request);
    const progress =
      req.progress && typeof req.progress === "object"
        ? (req.progress as Partial<BuyerScanProgress>)
        : {};
    const result =
      req.result && typeof req.result === "object"
        ? (req.result as BuyerScanResultSummary)
        : null;
    const missionSize = isMissionSize(req.missionSize)
      ? req.missionSize
      : missionSizeFromTarget(run.targetScanCount);
    const durationSec =
      result?.durationSec ??
      (run.startedAt
        ? Math.max(
            1,
            Math.round(
              ((run.finishedAt ? new Date(run.finishedAt) : new Date()).getTime() -
                new Date(run.startedAt).getTime()) /
                1000
            )
          )
        : null);

    const analyzed =
      result?.analyzed ??
      (typeof progress.current === "number" ? progress.current : null) ??
      run.scanned;
    const discarded =
      result?.discarded ??
      (typeof progress.filtered === "number" ? progress.filtered : null) ??
      run.filtered;
    const candidates =
      result?.candidates ??
      (typeof progress.kept === "number" ? progress.kept : null) ??
      run.kept;

    let stopReason: string | null = null;
    if (run.status === "failed") {
      stopReason = run.error || "Mission feilet";
    } else if (run.status === "paused") {
      stopReason = progress.stageLabel || "Pauset — fortsetter neste natt";
    } else if (run.status === "running" || run.status === "queued") {
      stopReason = progress.stageLabel || "Kjører…";
    }

    return {
      id: run.id,
      date: (run.finishedAt || run.startedAt || run.createdAt).toISOString(),
      category:
        (typeof req.categoryLabel === "string" && req.categoryLabel) ||
        result?.categoryLabel ||
        "Full katalog",
      missionSize,
      status: run.status,
      durationSec,
      analyzed,
      discarded,
      candidates,
      imported: result?.imported ?? 0,
      published: result?.published ?? 0,
      approved: result?.approved ?? 0,
      rejected: result?.rejected ?? 0,
      stopReason,
    };
  });
}

/**
 * Night Deep Scan when Autonomy is AUTO or SEMI.
 * Resumes paused checkpointed runs; never stops at 25/100.
 */
export async function ensureNightDeepScan(opts?: {
  storeId?: string | null;
  categoryId?: string | null;
}) {
  const { getOrCreateAutonomyPolicy } = await import("@/lib/autonomy/policy");
  const policy = await getOrCreateAutonomyPolicy(opts?.storeId);
  if (policy.mode !== "auto" && policy.mode !== "semi") {
    return { skipped: true as const, reason: "autonomy not semi/auto" };
  }

  const existing = await prisma.buyerScanRun.findFirst({
    where: {
      ...(opts?.storeId ? { storeId: opts.storeId } : {}),
      status: { in: ["running", "paused"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const req = asRequest(existing.request);
    const size = isMissionSize(req.missionSize)
      ? req.missionSize
      : missionSizeFromTarget(existing.targetScanCount);
    const isMassive = size === "night" || size === "deep" || existing.targetScanCount >= 10_000;

    if (existing.status === "paused" && isMassive) {
      await prisma.buyerScanRun.update({
        where: { id: existing.id },
        data: {
          status: "running",
          request: {
            ...req,
            progress: {
              ...((req.progress as object) || {}),
              stage: "scanning",
              stageLabel: stageLabel("scanning"),
            },
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await enqueueSupplierJob({
        type: "buyer_scan_batch",
        idempotencyKey: `buyer_scan_batch:${existing.id}:resume:${Date.now()}`,
        payload: { scanRunId: existing.id },
      });
      return { resumed: true as const, scanId: existing.id, missionSize: size };
    }

    if (existing.status === "running") {
      return { continuing: true as const, scanId: existing.id, missionSize: size };
    }
  }

  // Prefer favorite category from memory when building overnight
  let categoryId = opts?.categoryId || null;
  if (!categoryId) {
    try {
      const memory = await getOrCreateStoreMemory(opts?.storeId);
      const fav = memory.favoriteCategories?.[0];
      if (fav) {
        const match = getCategoryMission(
          fav.toLowerCase().includes("gaming")
            ? "gaming"
            : fav.toLowerCase().includes("mobil")
              ? "mobil"
              : fav.toLowerCase().includes("kontor")
                ? "kontor"
                : ""
        );
        categoryId = match?.id || "gaming";
      } else {
        categoryId = "gaming";
      }
    } catch {
      categoryId = "gaming";
    }
  }

  const scan = await startBuyerScan({
    storeId: opts?.storeId,
    categoryId,
    missionSize: "night",
    quantityChoice: "night",
    targetScanCount: 1_000_000,
    processInline: false,
    startedBy: "night_mission",
  });

  return { started: true as const, scanId: scan.id, missionSize: "night" as const };
}

export async function getLatestBuyerScan(storeId?: string | null) {
  return prisma.buyerScanRun.findFirst({
    where: storeId ? { storeId } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

async function cancelPendingBatchesForScan(
  scanRunId: string,
  reason: string
): Promise<number> {
  const pendingJobs = await prisma.supplierJob.findMany({
    where: {
      type: "buyer_scan_batch",
      status: { in: ["pending", "failed", "locked"] },
    },
    select: { id: true, payload: true },
  });
  let cancelled = 0;
  for (const job of pendingJobs) {
    const payload = asRequest(job.payload);
    if (payload.scanRunId !== scanRunId) continue;
    await prisma.supplierJob.update({
      where: { id: job.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        finishedAt: new Date(),
        progressMessage: reason,
        lastError: reason,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });
    cancelled += 1;
  }
  return cancelled;
}

/**
 * Pause mission: stop claiming new batches, keep checkpoint/page/seed/progress.
 */
export async function pauseBuyerMission(opts?: {
  scanRunId?: string | null;
}): Promise<{
  ok: true;
  scanId: string;
  status: string;
  checkpoint: BuyerCheckpoint;
  cancelledJobs: number;
}> {
  const run = opts?.scanRunId
    ? await prisma.buyerScanRun.findUnique({ where: { id: opts.scanRunId } })
    : await getLatestBuyerScan();
  if (!run) throw new Error("Ingen aktiv mission");
  if (run.status !== "running" && run.status !== "queued") {
    throw new Error(`Kan ikke pause — status er ${run.status}`);
  }

  const req = asRequest(run.request);
  const cp = parseCheckpoint(run.checkpoint);
  const progress = {
    ...((req.progress as object) || {}),
    stage: "paused" as const,
    stageLabel: "Pauset av deg — checkpoint lagret. Fortsett når du er klar.",
    current: run.scanned,
    total: run.targetScanCount,
    kept: run.kept,
    filtered: run.filtered,
  };

  await prisma.buyerScanRun.update({
    where: { id: run.id },
    data: {
      status: "paused",
      // checkpoint already persisted — write explicitly so pause is durable
      checkpoint: cp as unknown as Prisma.InputJsonValue,
      request: {
        ...req,
        progress,
        pausedAt: new Date().toISOString(),
        pauseReason: "manual",
      } as unknown as Prisma.InputJsonValue,
      error: null,
    },
  });

  const cancelledJobs = await cancelPendingBatchesForScan(
    run.id,
    "Pauset — ingen nye batches"
  );

  return {
    ok: true,
    scanId: run.id,
    status: "paused",
    checkpoint: cp,
    cancelledJobs,
  };
}

/**
 * Resume from checkpoint — do not re-analyze already seen products.
 */
export async function resumeBuyerMission(opts?: {
  scanRunId?: string | null;
}): Promise<{
  ok: true;
  scanId: string;
  status: string;
  checkpoint: BuyerCheckpoint;
}> {
  const run = opts?.scanRunId
    ? await prisma.buyerScanRun.findUnique({ where: { id: opts.scanRunId } })
    : await getLatestBuyerScan();
  if (!run) throw new Error("Ingen mission å fortsette");
  if (run.status !== "paused") {
    throw new Error(`Kan ikke fortsette — status er ${run.status}`);
  }

  const req = asRequest(run.request);
  const cp = parseCheckpoint(run.checkpoint);
  const progress = {
    ...((req.progress as object) || {}),
    stage: "scanning" as const,
    stageLabel: stageLabel("scanning"),
    current: run.scanned,
    total: run.targetScanCount,
    kept: run.kept,
    filtered: run.filtered,
  };

  await prisma.buyerScanRun.update({
    where: { id: run.id },
    data: {
      status: "running",
      error: null,
      finishedAt: null,
      request: {
        ...req,
        progress,
        resumedAt: new Date().toISOString(),
        pauseReason: null,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await enqueueSupplierJob({
    type: "buyer_scan_batch",
    idempotencyKey: `buyer_scan_batch:${run.id}:resume:${Date.now()}`,
    payload: { scanRunId: run.id },
  });

  return { ok: true, scanId: run.id, status: "running", checkpoint: cp };
}

/**
 * Stop mission permanently — checkpoint kept for history, no more batches.
 */
export async function stopBuyerMission(opts?: {
  scanRunId?: string | null;
  reason?: string;
}): Promise<{
  ok: true;
  scanId: string;
  status: string;
  cancelledJobs: number;
}> {
  const run = opts?.scanRunId
    ? await prisma.buyerScanRun.findUnique({ where: { id: opts.scanRunId } })
    : await getLatestBuyerScan();
  if (!run) throw new Error("Ingen mission å stoppe");
  if (
    run.status !== "running" &&
    run.status !== "queued" &&
    run.status !== "paused"
  ) {
    throw new Error(`Kan ikke stoppe — status er ${run.status}`);
  }

  const reason = opts?.reason || "Stoppet av deg";
  const req = asRequest(run.request);
  const cp = parseCheckpoint(run.checkpoint);

  await prisma.buyerScanRun.update({
    where: { id: run.id },
    data: {
      status: "failed",
      error: reason,
      finishedAt: new Date(),
      checkpoint: cp as unknown as Prisma.InputJsonValue,
      request: {
        ...req,
        progress: {
          ...((req.progress as object) || {}),
          stage: "failed",
          stageLabel: reason,
          current: run.scanned,
          total: run.targetScanCount,
          kept: run.kept,
          filtered: run.filtered,
        },
        stoppedAt: new Date().toISOString(),
        stopReason: reason,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const cancelledJobs = await cancelPendingBatchesForScan(run.id, reason);
  return { ok: true, scanId: run.id, status: "failed", cancelledJobs };
}

/** Live mission metrics + top candidates while scan runs. */
export async function getLiveMissionSnapshot(opts?: {
  storeId?: string | null;
  scanRunId?: string | null;
  candidateLimit?: number;
}) {
  const scan = opts?.scanRunId
    ? await prisma.buyerScanRun.findUnique({ where: { id: opts.scanRunId } })
    : await getLatestBuyerScan(opts?.storeId);
  if (!scan) {
    return {
      scan: null,
      metrics: null,
      worker: null,
      candidates: [] as Awaited<ReturnType<typeof listBuyerRanking>>,
      topFinds: [] as Awaited<ReturnType<typeof listBuyerRanking>>,
      imported: 0,
      published: 0,
    };
  }

  const parsed = parseScanRequest(scan.request);
  const { getBuyerHuntWorkerStatus } = await import("@/lib/buyer/buyer-worker");
  const worker = await getBuyerHuntWorkerStatus().catch(() => null);

  // Prefer processing-window speed from the worker (excludes idle stalls).
  const productsPerMin =
    worker?.productsPerMin != null && worker.productsPerMin > 0
      ? worker.productsPerMin
      : 0;
  const remaining = Math.max(0, scan.targetScanCount - scan.scanned);
  const etaMinutes =
    productsPerMin > 0 ? Math.round(remaining / productsPerMin) : null;

  const cp = parseCheckpoint(scan.checkpoint);
  const candidates = await listBuyerRanking({
    storeId: opts?.storeId,
    scanRunId: scan.id,
    limit: opts?.candidateLimit ?? 40,
  });
  const topFinds = await prisma.buyerCandidate.findMany({
    where: {
      scanRunId: scan.id,
      status: "ranked",
      isBestInGroup: true,
      shopMatchPct: { gte: 90 },
    },
    orderBy: [{ shopMatchPct: "desc" }, { overallScore: "desc" }],
    take: 12,
  });

  const result = parsed.result;
  return {
    scan,
    progress: parsed.progress,
    result,
    huntReport: parsed.huntReport,
    worker,
    metrics: {
      productsPerMin,
      remaining,
      etaMinutes,
      scanned: scan.scanned,
      kept: scan.kept,
      filtered: scan.filtered,
      target: scan.targetScanCount,
      analyzed: scan.scanned,
      discarded: scan.filtered,
      candidates: scan.kept,
      imported: result?.imported ?? 0,
      published: result?.published ?? 0,
      pendingJobs: worker?.pendingJobs ?? 0,
      claimedJobs: worker?.claimedJobs ?? 0,
      jobsPerMinute: worker?.jobsPerMinute ?? 0,
      avgWaitMs: worker?.avgWaitMs ?? null,
      avgRuntimeMs: worker?.avgRuntimeMs ?? null,
      lastActiveWorker: worker?.lastActiveWorker ?? null,
      lastActiveAt: worker?.lastActiveAt ?? null,
      checkpoint: {
        page: cp.page,
        seedIdx: cp.seedIdx,
        supplierIdx: cp.supplierIdx,
      },
    },
    candidates,
    topFinds,
    rejectBreakdown:
      parsed.progress?.rejectBreakdown || emptyRejectBreakdown(),
  };
}

/**
 * Prefer active hunt; else latest finished scan that still has reviewable
 * candidates. Stopped hunts are stored as `failed` — they must still surface
 * their ranked candidates in Produktkjøper (not an empty older `completed`).
 */
export async function resolveBuyerRankingScanId(
  storeId?: string | null
): Promise<string | null> {
  const storeFilter = storeId ? { storeId } : {};

  const active = await prisma.buyerScanRun.findFirst({
    where: {
      ...storeFilter,
      status: { in: ["running", "paused", "queued"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (active) return active.id;

  // completed + failed (stop mission). Skip empty shells whose rows moved
  // via upsert unique (supplier, supplierProductId) to a newer scan.
  const finished = await prisma.buyerScanRun.findMany({
    where: {
      ...storeFilter,
      status: { in: ["completed", "failed"] },
    },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    take: 30,
    select: { id: true },
  });

  for (const scan of finished) {
    const hasReviewable = await prisma.buyerCandidate.findFirst({
      where: {
        scanRunId: scan.id,
        status: "ranked",
        isBestInGroup: true,
        ...storeFilter,
      },
      select: { id: true },
    });
    if (hasReviewable) return scan.id;
  }

  return null;
}

export async function listBuyerRanking(opts?: {
  storeId?: string | null;
  limit?: number;
  minMatch?: number;
  /** When omitted, scopes to latest active/completed mission */
  scanRunId?: string | null;
  /** Escape hatch for admin tools that want all-time ranking */
  allScans?: boolean;
}) {
  const scanRunId = opts?.allScans
    ? null
    : opts?.scanRunId !== undefined
      ? opts.scanRunId
      : await resolveBuyerRankingScanId(opts?.storeId);

  return prisma.buyerCandidate.findMany({
    where: {
      ...(opts?.storeId ? { storeId: opts.storeId } : {}),
      ...(scanRunId ? { scanRunId } : {}),
      status: "ranked",
      isBestInGroup: true,
      ...(opts?.minMatch != null ? { shopMatchPct: { gte: opts.minMatch } } : {}),
    },
    orderBy: [{ rank: "asc" }, { shopMatchPct: "desc" }, { overallScore: "desc" }],
    take: Math.min(200, opts?.limit || 50),
  });
}

/** Drain batches for one scan until done or maxBatches — used by ops / verification. */
export async function drainBuyerScan(
  scanRunId: string,
  opts?: { maxBatches?: number; preferWorkers?: boolean }
): Promise<{
  batches: number;
  done: boolean;
  scanned: number;
  kept: number;
  filtered: number;
  status: string;
}> {
  const maxBatches = opts?.maxBatches ?? 500;
  let batches = 0;
  let done = false;

  while (batches < maxBatches) {
    const run = await prisma.buyerScanRun.findUnique({ where: { id: scanRunId } });
    if (!run) break;
    if (run.status === "completed" || run.status === "failed") {
      done = true;
      break;
    }
    if (run.status === "paused") {
      break;
    }

    if (opts?.preferWorkers !== false) {
      const { runSupplierWorkers } = await import("@/lib/suppliers/workers/jobs");
      await runSupplierWorkers({
        concurrency: 1,
        limit: 1,
        types: ["buyer_scan_batch"],
        preferScanRunId: scanRunId,
      });
    } else {
      const result = await processBuyerScanBatch(scanRunId);
      done = result.done;
    }

    batches += 1;
    const after = await prisma.buyerScanRun.findUnique({ where: { id: scanRunId } });
    if (!after || after.status === "completed" || after.status === "failed") {
      done = true;
      break;
    }
    if (after.status === "paused") break;
    if (after.scanned >= after.targetScanCount) {
      done = true;
      break;
    }
  }

  const final = await prisma.buyerScanRun.findUniqueOrThrow({ where: { id: scanRunId } });
  return {
    batches,
    done: done || final.status === "completed",
    scanned: final.scanned,
    kept: final.kept,
    filtered: final.filtered,
    status: final.status,
  };
}
