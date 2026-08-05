/**
 * Digital Buyer V4 — high-volume review board (workflow layer).
 * Aggregates + pages ranked candidates without loading the full set into React.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveBuyerRankingScanId } from "@/lib/buyer/scan";
import {
  toBuyerCard,
  type BuyerCardOptions,
  type DeskBuyerCandidate,
  type DeskBuyerCandidateCard,
} from "@/lib/ops/desk-buyer-groups";
import type {
  BuyerReviewGroupId,
  BuyerReviewOverview,
  BuyerReviewSort,
} from "@/lib/buyer/review-types";
import { getPreferenceContext } from "@/lib/buyer/admin-preferences";
import type { PreferenceContext } from "@/lib/buyer/explainable-match";

function matchPct(c: DeskBuyerCandidateCard): number {
  return c.explainPct ?? c.shopMatchPct;
}

export type {
  BuyerReviewGroupId,
  BuyerReviewOverview,
  BuyerReviewSort,
} from "@/lib/buyer/review-types";

export type BuyerReviewPageResult = {
  scanRunId: string | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  group: BuyerReviewGroupId;
  sort: BuyerReviewSort;
  items: DeskBuyerCandidateCard[];
};

const CAT_META: Record<string, { label: string; emoji: string }> = {
  gaming: { label: "Gaming", emoji: "🎮" },
  mobil: { label: "Mobil", emoji: "📱" },
  audio: { label: "Audio", emoji: "🎧" },
  kontor: { label: "Kontor", emoji: "💻" },
  hjem: { label: "Hjem", emoji: "🏠" },
  tilbehor: { label: "Tilbehør", emoji: "🧰" },
  andre: { label: "Andre", emoji: "📦" },
};

function asCandidate(row: {
  id: string;
  title: string | null;
  imageUrl: string | null;
  supplier: string;
  supplierPrice: number | null;
  overallScore: number;
  shopMatchPct: number;
  shopMatchWhy: unknown;
  discoveryTags: unknown;
  risks: unknown;
  reasons: unknown;
  pricing: unknown;
  scores: unknown;
  snapshot: unknown;
  merchandiserRecId: string | null;
  rank: number | null;
  createdAt: Date;
  fingerprint?: string | null;
}): DeskBuyerCandidate {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.imageUrl,
    supplier: row.supplier,
    supplierPrice: row.supplierPrice,
    overallScore: row.overallScore,
    shopMatchPct: row.shopMatchPct,
    shopMatchWhy: row.shopMatchWhy,
    discoveryTags: row.discoveryTags,
    risks: row.risks,
    reasons: row.reasons,
    pricing: row.pricing,
    scores: row.scores,
    snapshot: row.snapshot,
    merchandiserRecId: row.merchandiserRecId,
    rank: row.rank,
    createdAt: row.createdAt,
    fingerprint: row.fingerprint ?? null,
  };
}

function isPremium(c: DeskBuyerCandidateCard): boolean {
  return (
    matchPct(c) >= 85 &&
    c.confidence >= 80 &&
    (c.marginPct == null || c.marginPct >= 35) &&
    c.overallScore >= 70
  );
}

function isAiConfident(c: DeskBuyerCandidateCard): boolean {
  return (
    matchPct(c) >= 88 &&
    c.confidence >= 80 &&
    (c.recommendation === "Importer." ||
      c.recommendation === "Velg" ||
      c.canImport) &&
    (c.marginPct == null || c.marginPct >= 35)
  );
}

function isReady(c: DeskBuyerCandidateCard): boolean {
  return (
    c.canImport &&
    (c.recommendation === "Importer." || c.recommendation === "Velg") &&
    matchPct(c) >= 75
  );
}

function isHighMargin(c: DeskBuyerCandidateCard): boolean {
  return c.marginPct != null && c.marginPct >= 50;
}

function needsReview(c: DeskBuyerCandidateCard): boolean {
  return (
    (c.recommendation !== "Importer." && c.recommendation !== "Velg") ||
    c.confidence < 65 ||
    matchPct(c) < 70 ||
    !c.canImport
  );
}

/** Exceptional buy: high match + high margin + import-ready. */
function isFantastic(c: DeskBuyerCandidateCard): boolean {
  return (
    matchPct(c) >= 90 &&
    (c.marginPct ?? 0) >= 55 &&
    c.confidence >= 75 &&
    c.canImport
  );
}

function isLowScore(c: DeskBuyerCandidateCard): boolean {
  return matchPct(c) < 65 || c.overallScore < 55;
}

function isNewSince(c: DeskBuyerCandidateCard, sinceIso?: string | null): boolean {
  if (!c.createdAt) return false;
  const created = new Date(c.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  if (sinceIso) {
    const since = new Date(sinceIso).getTime();
    if (Number.isFinite(since)) return created >= since;
  }
  // Fallback: last 48h
  return Date.now() - created < 48 * 60 * 60 * 1000;
}

function matchesGroup(
  c: DeskBuyerCandidateCard,
  group: BuyerReviewGroupId,
  opts?: { sinceIso?: string | null }
): boolean {
  switch (group) {
    case "all":
      return true;
    case "ai-confident":
      return isAiConfident(c);
    case "premium":
      return isPremium(c);
    case "ready":
      return isReady(c);
    case "high-margin":
      return isHighMargin(c);
    case "margin-60":
      return c.marginPct != null && c.marginPct >= 60;
    case "score-90":
      return matchPct(c) >= 90;
    case "perfect-match":
      return matchPct(c) >= 95;
    case "fantastic":
      return isFantastic(c);
    case "low-score":
      return isLowScore(c);
    case "needs-review":
      return needsReview(c);
    case "new":
      return isNewSince(c, opts?.sinceIso);
    case "gaming":
    case "mobil":
    case "audio":
    case "kontor":
    case "hjem":
      return c.categoryId === group;
    default:
      return true;
  }
}

async function loadScanCards(opts?: {
  storeId?: string | null;
  scanRunId?: string | null;
}): Promise<{ scanRunId: string | null; cards: DeskBuyerCandidateCard[] }> {
  const scanRunId =
    opts?.scanRunId !== undefined
      ? opts.scanRunId
      : await resolveBuyerRankingScanId(opts?.storeId);

  if (!scanRunId) return { scanRunId: null, cards: [] };

  const prefs = await getPreferenceContext(opts?.storeId);

  const rows = await prisma.buyerCandidate.findMany({
    where: {
      scanRunId,
      status: "ranked",
      isBestInGroup: true,
      ...(opts?.storeId ? { storeId: opts.storeId } : {}),
    },
    orderBy: [{ rank: "asc" }, { shopMatchPct: "desc" }, { overallScore: "desc" }, { id: "asc" }],
    take: 50_000,
    select: {
      id: true,
      title: true,
      imageUrl: true,
      supplier: true,
      supplierPrice: true,
      overallScore: true,
      shopMatchPct: true,
      shopMatchWhy: true,
      discoveryTags: true,
      risks: true,
      reasons: true,
      pricing: true,
      scores: true,
      snapshot: true,
      merchandiserRecId: true,
      rank: true,
      createdAt: true,
      fingerprint: true,
    },
  });

  // Assortment saturation from current ranked pool (cheap, no supplier API)
  const { resolveProductFamilyIds } = await import(
    "@/lib/buyer/preference-signals"
  );
  const familyCounts: Record<string, number> = {};
  for (const row of rows) {
    for (const fid of resolveProductFamilyIds(row.title || "")) {
      familyCounts[fid] = (familyCounts[fid] || 0) + 1;
    }
  }
  const prefsWithPool = {
    ...prefs,
    familyCounts,
    poolSize: rows.length,
  };

  // Live Sortimentstrategi context (targets vs published catalog)
  let assortmentCtx: BuyerCardOptions["assortment"] = null;
  let productFocusCtx: BuyerCardOptions["productFocus"] = null;
  try {
    const { getAssortmentStrategy, boundsMap, loadCatalogSnapshotForStore } =
      await import("@/lib/buyer/assortment-strategy");
    const [strategy, snapshot] = await Promise.all([
      getAssortmentStrategy(),
      loadCatalogSnapshotForStore(opts?.storeId),
    ]);
    const bounds = boundsMap(strategy, snapshot.totalActive);
    assortmentCtx = {
      snapshot,
      targets: Object.fromEntries(
        Object.entries(bounds).map(([k, v]) => [k, v.target])
      ),
      bounds,
    };
  } catch {
    /* strategy optional */
  }
  try {
    const { getProductFocus, starsMap } = await import(
      "@/lib/buyer/product-focus"
    );
    const focus = await getProductFocus();
    productFocusCtx = {
      starsByFamily: starsMap(focus),
      customFamilies: focus.customFamilies,
    };
  } catch {
    /* focus optional */
  }

  let aiMemory: import("@/lib/buyer/ai-memory").AiMemorySnapshot | null = null;
  let storeDna: import("@/lib/buyer/store-dna").StoreDnaSnapshot | null = null;
  let aiFeedback: import("@/lib/buyer/ai-feedback").AiFeedbackSnapshot | null =
    null;
  try {
    const { getAiMemory } = await import("@/lib/buyer/ai-memory");
    aiMemory = await getAiMemory({ storeId: opts?.storeId });
  } catch {
    /* memory optional */
  }
  try {
    const { getStoreDna } = await import("@/lib/buyer/store-dna");
    storeDna = await getStoreDna({ storeId: opts?.storeId });
  } catch {
    /* dna optional */
  }
  try {
    const { getAiFeedback } = await import("@/lib/buyer/ai-feedback");
    aiFeedback = await getAiFeedback({ storeId: opts?.storeId });
  } catch {
    /* feedback optional */
  }

  const catalogTitles = [
    ...rows.map((r) => (r.title || "").trim()).filter(Boolean),
  ];
  try {
    const published = await prisma.product.findMany({
      where: { isActive: true },
      select: { name: true },
      take: 3000,
    });
    for (const p of published) {
      if (p.name) catalogTitles.push(p.name);
    }
  } catch {
    /* optional */
  }

  const cards: DeskBuyerCandidateCard[] = [];
  for (const row of rows) {
    try {
      cards.push(
        toBuyerCard(asCandidate(row), {
          prefs: prefsWithPool,
          assortment: assortmentCtx,
          productFocus: productFocusCtx,
          catalogTitles,
          aiMemory,
          storeDna,
          aiFeedback,
        })
      );
    } catch {
      /* skip */
    }
  }
  return { scanRunId, cards };
}

export async function getBuyerReviewOverview(opts?: {
  storeId?: string | null;
  scanRunId?: string | null;
  sinceIso?: string | null;
}): Promise<BuyerReviewOverview> {
  const { scanRunId, cards } = await loadScanCards(opts);

  const byCatMap = new Map<string, number>();
  let premium = 0;
  let ready = 0;
  let aiConfident = 0;
  let highMargin = 0;
  let margin60 = 0;
  let score90 = 0;
  let perfectMatch = 0;
  let fantastic = 0;
  let lowScore = 0;
  let needs = 0;
  let newSince = 0;

  for (const c of cards) {
    byCatMap.set(c.categoryId, (byCatMap.get(c.categoryId) || 0) + 1);
    if (isPremium(c)) premium += 1;
    if (isReady(c)) ready += 1;
    if (isAiConfident(c)) aiConfident += 1;
    if (isHighMargin(c)) highMargin += 1;
    if (c.marginPct != null && c.marginPct >= 60) margin60 += 1;
    if (matchPct(c) >= 90) score90 += 1;
    if (matchPct(c) >= 95) perfectMatch += 1;
    if (isFantastic(c)) fantastic += 1;
    if (isLowScore(c)) lowScore += 1;
    if (needsReview(c)) needs += 1;
    if (isNewSince(c, opts?.sinceIso)) newSince += 1;
  }

  const byCategory = [...byCatMap.entries()]
    .map(([id, count]) => ({
      id,
      label: CAT_META[id]?.label || id,
      emoji: CAT_META[id]?.emoji || "📦",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const cat = (id: string) => byCatMap.get(id) || 0;

  // Decision-first groups (start here) — then category depth
  const groups: BuyerReviewOverview["groups"] = [
    { id: "perfect-match", label: "Best Match", emoji: "🎯", count: perfectMatch },
    { id: "fantastic", label: "Fantastiske kjøp", emoji: "💎", count: fantastic },
    { id: "premium", label: "Premium", emoji: "🟢", count: premium },
    { id: "high-margin", label: "Høy margin", emoji: "📈", count: highMargin },
    { id: "ai-confident", label: "AI anbefaler", emoji: "✨", count: aiConfident },
    { id: "needs-review", label: "Trenger review", emoji: "👀", count: needs },
    { id: "low-score", label: "Lav score", emoji: "⬇", count: lowScore },
    { id: "margin-60", label: "Margin >60 %", emoji: "💰", count: margin60 },
    { id: "score-90", label: "AI score >90", emoji: "🔥", count: score90 },
    { id: "new", label: "Nye siden sist", emoji: "🆕", count: newSince },
    { id: "gaming", label: "Gaming", emoji: "🎮", count: cat("gaming") },
    { id: "mobil", label: "Mobil", emoji: "📱", count: cat("mobil") },
    { id: "audio", label: "Audio", emoji: "🎧", count: cat("audio") },
    { id: "kontor", label: "Kontor", emoji: "💻", count: cat("kontor") },
  ];

  return {
    scanRunId,
    total: cards.length,
    newSince,
    premium,
    ready,
    aiConfident,
    highMargin,
    margin60,
    score90,
    needsReview: needs,
    byCategory,
    groups,
  };
}

function matchesTextQuery(c: DeskBuyerCandidateCard, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = `${c.title} ${c.taxonomyPath} ${c.categoryLabel} ${c.supplier}`.toLowerCase();
  if (hay.includes(needle)) return true;
  const tokens = needle.split(/\s+/).filter((t) => t.length > 2);
  return tokens.length > 0 && tokens.some((t) => hay.includes(t));
}

export type BuyerReviewFilterOpts = {
  group?: BuyerReviewGroupId | string | null;
  sinceIso?: string | null;
  q?: string | null;
  minMatch?: number | null;
  minMargin?: number | null;
  minConfidence?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  supplier?: string | null;
  premiumOnly?: boolean;
  readyOnly?: boolean;
  hasVideo?: boolean;
  manyImages?: boolean;
  hasAi?: boolean;
};

function applyReviewFilters(
  cards: DeskBuyerCandidateCard[],
  opts: BuyerReviewFilterOpts
): DeskBuyerCandidateCard[] {
  const group = (opts.group || "all") as BuyerReviewGroupId;
  let filtered = cards.filter((c) =>
    matchesGroup(c, group, { sinceIso: opts.sinceIso })
  );

  if (opts.q) filtered = filtered.filter((c) => matchesTextQuery(c, opts.q!));
  if (opts.minMatch != null) {
    filtered = filtered.filter((c) => matchPct(c) >= opts.minMatch!);
  }
  if (opts.minMargin != null) {
    filtered = filtered.filter(
      (c) => c.marginPct != null && c.marginPct >= opts.minMargin!
    );
  }
  if (opts.minConfidence != null) {
    filtered = filtered.filter((c) => c.confidence >= opts.minConfidence!);
  }
  if (opts.minPrice != null) {
    filtered = filtered.filter(
      (c) => c.retailNOK != null && c.retailNOK >= opts.minPrice!
    );
  }
  if (opts.maxPrice != null) {
    filtered = filtered.filter(
      (c) => c.retailNOK != null && c.retailNOK <= opts.maxPrice!
    );
  }
  if (opts.supplier) {
    const s = opts.supplier.toLowerCase();
    filtered = filtered.filter((c) => c.supplier.toLowerCase().includes(s));
  }
  if (opts.premiumOnly) filtered = filtered.filter(isPremium);
  if (opts.readyOnly) filtered = filtered.filter(isReady);
  if (opts.hasVideo) filtered = filtered.filter((c) => (c.videos?.length || 0) > 0);
  if (opts.manyImages)
    filtered = filtered.filter((c) => (c.images?.length || 0) >= 3);
  if (opts.hasAi) {
    filtered = filtered.filter(
      (c) => c.whyChosen.length > 0 || c.recommendation.length > 0
    );
  }
  return filtered;
}

export async function listBuyerReviewPage(opts: {
  storeId?: string | null;
  scanRunId?: string | null;
  page?: number;
  pageSize?: number;
  sort?: BuyerReviewSort | string | null;
} & BuyerReviewFilterOpts): Promise<BuyerReviewPageResult> {
  const page = Math.max(1, Math.round(opts.page || 1));
  const pageSize = Math.min(200, Math.max(20, Math.round(opts.pageSize || 100)));
  const group = (opts.group || "all") as BuyerReviewGroupId;
  const sort = (opts.sort || "match") as BuyerReviewSort;

  const { scanRunId, cards } = await loadScanCards({
    storeId: opts.storeId,
    scanRunId: opts.scanRunId,
  });

  let filtered = applyReviewFilters(cards, opts);
  filtered = sortCards(filtered, sort);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    scanRunId,
    page: safePage,
    pageSize,
    total,
    totalPages,
    group,
    sort,
    items,
  };
}

/** Live «AI tenker» from latest (or given) scan progress. */
export async function getHuntThinking(opts?: {
  scanRunId?: string | null;
}): Promise<{
  covered: string[];
  seeking: string[];
  updatedAt: string;
} | null> {
  const run = opts?.scanRunId
    ? await prisma.buyerScanRun.findUnique({
        where: { id: opts.scanRunId },
        select: { request: true },
      })
    : await prisma.buyerScanRun.findFirst({
        orderBy: { startedAt: "desc" },
        select: { request: true },
      });
  if (!run?.request || typeof run.request !== "object") return null;
  const req = run.request as Record<string, unknown>;
  const progress =
    req.progress && typeof req.progress === "object"
      ? (req.progress as Record<string, unknown>)
      : null;
  const ht = progress?.huntThinking;
  if (!ht || typeof ht !== "object") return null;
  const o = ht as Record<string, unknown>;
  return {
    covered: Array.isArray(o.covered) ? o.covered.map(String) : [],
    seeking: Array.isArray(o.seeking) ? o.seeking.map(String) : [],
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
  };
}

/** Live Discovery Scheduler plan from scan progress. */
export async function getDiscoveryPlan(opts?: {
  scanRunId?: string | null;
}): Promise<{
  now: {
    familyId: string;
    label: string;
    groupLabel: string;
    query: string;
    reason: string;
  } | null;
  queue: Array<{
    familyId: string;
    label: string;
    groupLabel: string;
    query: string;
    reason: string;
  }>;
  groupSharePct: Array<{ groupId: string; label: string; pct: number }>;
  updatedAt: string;
  lastDecision: unknown | null;
} | null> {
  const run = opts?.scanRunId
    ? await prisma.buyerScanRun.findUnique({
        where: { id: opts.scanRunId },
        select: { request: true },
      })
    : await prisma.buyerScanRun.findFirst({
        orderBy: { startedAt: "desc" },
        select: { request: true },
      });
  if (!run?.request || typeof run.request !== "object") return null;
  const req = run.request as Record<string, unknown>;
  const progress =
    req.progress && typeof req.progress === "object"
      ? (req.progress as Record<string, unknown>)
      : null;
  const dp = progress?.discoveryPlan;
  if (!dp || typeof dp !== "object") return null;
  const o = dp as Record<string, unknown>;
  const nowRaw = o.now && typeof o.now === "object" ? (o.now as Record<string, unknown>) : null;
  return {
    now: nowRaw
      ? {
          familyId: String(nowRaw.familyId || ""),
          label: String(nowRaw.label || ""),
          groupLabel: String(nowRaw.groupLabel || ""),
          query: String(nowRaw.query || ""),
          reason: String(nowRaw.reason || ""),
        }
      : null,
    queue: Array.isArray(o.queue)
      ? o.queue.map((q) => {
          const item = q as Record<string, unknown>;
          return {
            familyId: String(item.familyId || ""),
            label: String(item.label || ""),
            groupLabel: String(item.groupLabel || ""),
            query: String(item.query || ""),
            reason: String(item.reason || ""),
          };
        })
      : [],
    groupSharePct: Array.isArray(o.groupSharePct)
      ? o.groupSharePct.map((g) => {
          const item = g as Record<string, unknown>;
          return {
            groupId: String(item.groupId || ""),
            label: String(item.label || ""),
            pct: Number(item.pct || 0),
          };
        })
      : [],
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
    lastDecision: o.lastDecision && typeof o.lastDecision === "object" ? o.lastDecision : null,
  };
}

function sortCards(
  cards: DeskBuyerCandidateCard[],
  sort: BuyerReviewSort
): DeskBuyerCandidateCard[] {
  const arr = [...cards];
  const cmpNum = (a: number | null | undefined, b: number | null | undefined) =>
    (b ?? -1) - (a ?? -1);
  switch (sort) {
    case "score":
      return arr.sort((a, b) => cmpNum(a.overallScore, b.overallScore));
    case "margin":
      return arr.sort((a, b) => cmpNum(a.marginPct, b.marginPct));
    case "newest":
      return arr.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      );
    case "price":
      return arr.sort((a, b) => (a.retailNOK ?? 1e12) - (b.retailNOK ?? 1e12));
    case "category":
      return arr.sort(
        (a, b) =>
          a.categoryLabel.localeCompare(b.categoryLabel, "nb") ||
          cmpNum(matchPct(a), matchPct(b))
      );
    case "rank":
      return arr.sort(
        (a, b) =>
          (a.rank ?? 1e9) - (b.rank ?? 1e9) ||
          cmpNum(matchPct(a), matchPct(b))
      );
    case "match":
    default:
      // Default: store-builder order (rank), then match — not peak SKU score
      return arr.sort(
        (a, b) =>
          (a.rank ?? 1e9) - (b.rank ?? 1e9) ||
          cmpNum(
            matchPct(a) + (a.assortmentScore ?? 0) * 0.6,
            matchPct(b) + (b.assortmentScore ?? 0) * 0.6
          ) ||
          cmpNum(a.assortmentScore, b.assortmentScore) ||
          cmpNum(a.overallScore, b.overallScore)
      );
  }
}

/** Bulk dismiss / reject / restore candidates (never deletes). */
export async function decideBuyerCandidates(input: {
  ids: string[];
  decision: "dismissed" | "rejected" | "ranked";
}): Promise<{ updated: number }> {
  const ids = Array.from(new Set((input.ids || []).filter(Boolean))).slice(0, 500);
  if (!ids.length) return { updated: 0 };

  const result = await prisma.buyerCandidate.updateMany({
    where: { id: { in: ids } },
    data: { status: input.decision },
  });

  return { updated: result.count };
}

/** All matching ids for «Velg alle» (capped). Prefer count-only when possible. */
export async function listBuyerReviewIds(opts: {
  storeId?: string | null;
  scanRunId?: string | null;
  limit?: number;
  /** When true, only return total — no id array (cheap for select-all UI). */
  countOnly?: boolean;
} & BuyerReviewFilterOpts): Promise<{
  scanRunId: string | null;
  ids: string[];
  total: number;
}> {
  const { scanRunId, cards } = await loadScanCards({
    storeId: opts.storeId,
    scanRunId: opts.scanRunId,
  });
  const filtered = applyReviewFilters(cards, opts);
  const cap = Math.min(50_000, Math.max(1, opts.limit || 5000));
  return {
    scanRunId,
    ids: opts.countOnly ? [] : filtered.slice(0, cap).map((c) => c.id),
    total: filtered.length,
  };
}

/** Resolve selection = matching filters minus exclusions (for bulk publish). */
export async function resolveBuyerSelectionIds(opts: {
  storeId?: string | null;
  scanRunId?: string | null;
  excludeIds?: string[];
  limit?: number;
} & BuyerReviewFilterOpts): Promise<{
  scanRunId: string | null;
  ids: string[];
  matchedTotal: number;
  selectedTotal: number;
}> {
  const exclude = new Set((opts.excludeIds || []).filter(Boolean));
  const { scanRunId, cards } = await loadScanCards({
    storeId: opts.storeId,
    scanRunId: opts.scanRunId,
  });
  const filtered = applyReviewFilters(cards, opts);
  const selected = filtered.filter((c) => !exclude.has(c.id));
  const cap = Math.min(50_000, Math.max(1, opts.limit || 5000));
  return {
    scanRunId,
    ids: selected.slice(0, cap).map((c) => c.id),
    matchedTotal: filtered.length,
    selectedTotal: selected.length,
  };
}
