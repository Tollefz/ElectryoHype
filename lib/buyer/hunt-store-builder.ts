/**
 * Hunt store-builder — family-first ranking that builds a complete shop.
 * Resets every hunt (fatigue / cooldown / group share are within-hunt only).
 */

import { familyLabel, matchFamily } from "@/lib/intelligence/families";
import {
  FOCUS_GROUP_DEFS,
  primaryGroupForFamily,
} from "@/lib/buyer/product-focus-core";
import type {
  AssortmentBoundsInput,
  AssortmentScoreBreakdown,
  CatalogAssortmentSnapshot,
} from "@/lib/buyer/assortment-score";
import { scoreAssortmentFit } from "@/lib/buyer/assortment-score";
import { computeMerchBrain, countSimilarTitles } from "@/lib/buyer/merch-brain";
import {
  scoreStoreIdentityFit,
  type StoreIdentityContext,
  type StoreIdentityFitResult,
} from "@/lib/identity";

/** Soft share targets for hunt CPU time (guidance, not hard caps). */
export const HUNT_GROUP_QUOTAS: Record<string, number> = {
  pc_gaming: 0.3,
  mobil: 0.15,
  kontor: 0.1,
  streaming: 0.1,
  tv_lyd: 0.1,
  smart_home: 0.1,
  data_it: 0.1,
  maker: 0.05,
};

/** Within-hunt fatigue multiplier on family priority (resets next hunt). */
export function huntFatigueMultiplier(batchCount: number): number {
  if (batchCount >= 120) return 0.1;
  if (batchCount >= 80) return 0.3;
  if (batchCount >= 40) return 0.55;
  if (batchCount >= 20) return 0.75;
  if (batchCount >= 10) return 0.9;
  return 1;
}

export function scoreFamilyNeedV3(input: {
  have: number;
  target: number | null;
  batchCount: number;
  focusStars: number;
  softMax?: number | null;
  groupShare?: number;
  groupQuota?: number;
  onCooldown?: boolean;
}): number {
  const have = input.have + input.batchCount;
  const target = input.target != null && input.target > 0 ? input.target : null;
  let need = 0;

  if (target == null) {
    need = 12 + input.focusStars * 4;
  } else {
    const gap = Math.max(0, target - have);
    const fill = have / target;
    need = gap * 3;
    if (have === 0) need += 55;
    else if (fill < 0.25) need += 42;
    else if (fill < 0.5) need += 30;
    else if (fill < 0.75) need += 16;
    else if (fill < 1) need += 6;
    else if (fill <= 1.2) need -= 12;
    else need -= 35;

    if (input.softMax != null && have >= input.softMax) need -= 40;
  }

  need += Math.max(0, input.focusStars) * 5;
  need *= huntFatigueMultiplier(input.batchCount);

  // Group quota pressure — if Gaming already ate 90% of picks, demote heavily
  if (
    input.groupQuota != null &&
    input.groupShare != null &&
    input.groupQuota > 0
  ) {
    const over = input.groupShare / input.groupQuota;
    if (over >= 3) need *= 0.15;
    else if (over >= 2) need *= 0.35;
    else if (over >= 1.4) need *= 0.6;
    else if (over < 0.5) need *= 1.25;
  }

  if (input.onCooldown) need *= 0.08;

  return need;
}

/** @deprecated Prefer computeMerchBrain — thin adapter for old call sites. */
export function computeStoreBuilderMerchScore(input: {
  shopMatchPct: number;
  assortmentTotal: number;
  productFocusScore: number;
  marginPct?: number | null;
  deliveryHint?: string | null;
  overallScore: number;
  profitNOK?: number | null;
  landedCostNOK?: number | null;
  retailNOK?: number | null;
  stock?: number | null;
  listedCount?: number | null;
  similarInCatalog?: number | null;
  economicConfidence?: number | null;
  priceChanges7d?: number | null;
  title?: string;
  categoryHint?: string | null;
}): number {
  return computeMerchBrain({
    title: input.title || "",
    categoryHint: input.categoryHint,
    shopMatchPct: input.shopMatchPct,
    assortmentTotal: input.assortmentTotal,
    productFocusScore: input.productFocusScore,
    marginPct: input.marginPct,
    deliveryHint: input.deliveryHint,
    overallScore: input.overallScore,
    profitNOK: input.profitNOK,
    landedCostNOK: input.landedCostNOK,
    retailNOK: input.retailNOK,
    stock: input.stock,
    listedCount: input.listedCount,
    similarInCatalog: input.similarInCatalog,
    economicConfidence: input.economicConfidence,
    priceChanges7d: input.priceChanges7d,
  }).butikkscore;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function normalizeTitleTokens(title: string): Set<string> {
  const stop = new Set([
    "for",
    "with",
    "and",
    "the",
    "til",
    "med",
    "og",
    "usb",
    "type",
    "pro",
    "plus",
  ]);
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9æøå\s]/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !stop.has(t))
  );
}

function titleSimilarity(a: string, b: string): number {
  const A = normalizeTitleTokens(a);
  const B = normalizeTitleTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / Math.max(A.size, B.size);
}

export type HuntMerchCandidate = {
  id: string;
  title: string;
  categoryHint?: string | null;
  shopMatchPct: number;
  overallScore: number;
  supplier?: string | null;
  marginPct?: number | null;
  deliveryHint?: string | null;
  profitNOK?: number | null;
  landedCostNOK?: number | null;
  retailNOK?: number | null;
  stock?: number | null;
  listedCount?: number | null;
  rating?: number | null;
  economicConfidence?: number | null;
  priceChanges7d?: number | null;
  /** Catalog titles for competition (optional, set by caller) */
  catalogTitles?: string[] | null;
};

export type HuntRankInput = {
  starsByFamily: Record<string, number>;
  matchFamilyFn?: (title: string, categoryHint?: string | null) => string | null;
  scoreFocusFn?: (input: {
    familyId: string | null;
    stars: number;
    shopMatchPct: number;
  }) => { score: number; why: string[]; stars: number };
  /** Families that must cool down before re-pick (default 2 intervening) */
  cooldownGap?: number;
  /** Store Identity Fit context — scored before Merch Brain */
  identityContext?: StoreIdentityContext | null;
};

export type HuntThinking = {
  covered: string[];
  seeking: string[];
  updatedAt: string;
};

export type HuntRankedItem<T extends HuntMerchCandidate> = T & {
  merchScore: number;
  assortment: AssortmentScoreBreakdown;
  productFocusScore: number;
  productFocusStars: number;
  productFocusWhy: string[];
  productFocusFamilyId: string | null;
  identityFit: StoreIdentityFitResult | null;
};

/**
 * Iterative store-builder ranking:
 * need family → best product in family → update balance → repeat.
 */
export function rankAsStoreBuilder<T extends HuntMerchCandidate>(
  candidates: T[],
  snapshot: CatalogAssortmentSnapshot,
  targets?: Record<string, number> | null,
  bounds?: Record<string, AssortmentBoundsInput> | null,
  hunt?: HuntRankInput | null
): { ordered: HuntRankedItem<T>[]; thinking: HuntThinking } {
  const remaining = [...candidates];
  const batchFamily: Record<string, number> = {};
  const batchGroup: Record<string, number> = {};
  const batchSupplier: Record<string, number> = {};
  const ordered: HuntRankedItem<T>[] = [];
  const matchFn = hunt?.matchFamilyFn || matchFamily;
  const cooldownGap = hunt?.cooldownGap ?? 2;
  const recentFamilies: string[] = [];

  const groupOf = (fam: string | null) => {
    if (!fam) return null;
    return primaryGroupForFamily(fam)?.id || null;
  };

  const scoreOne = (c: T, fam: string | null, batchCount: number) => {
    const assortment = scoreAssortmentFit({
      title: c.title,
      categoryHint: c.categoryHint,
      snapshot,
      batchFamilyCount: fam ? batchCount : 0,
      targets,
      bounds,
      shopMatchPct: c.shopMatchPct,
    });
    const focusStars = fam ? Number(hunt?.starsByFamily[fam] ?? 0) : 0;
    const focusResult = hunt?.scoreFocusFn
      ? hunt.scoreFocusFn({
          familyId: fam,
          stars: focusStars,
          shopMatchPct: c.shopMatchPct,
        })
      : { score: 0, why: [] as string[], stars: focusStars };
    let focusScore = focusResult.score;
    if (!hunt?.scoreFocusFn && focusStars > 0 && c.shopMatchPct >= 65) {
      focusScore =
        [0, 2, 5, 8, 11, 14][Math.min(5, Math.max(0, focusStars))] || 0;
    }

    let supplierAdj = 0;
    if (c.supplier) {
      const n = batchSupplier[c.supplier] || 0;
      if (n >= 40) supplierAdj = -8;
      else if (n >= 25) supplierAdj = -4;
    }
    let hardAdj = 0;
    if (assortment.pastHard && c.shopMatchPct < 92) hardAdj = -40;

    const fatigueMult = huntFatigueMultiplier(batchCount);
    const catalogTitles =
      c.catalogTitles ||
      ordered.map((o) => o.title).concat(
        // Approximate catalog pressure from snapshot family counts via titles in batch
        remaining.map((r) => r.title)
      );
    const similarInCatalog = countSimilarTitles(
      c.title,
      catalogTitles.filter((t) => t !== c.title)
    );

    const identityFit = hunt?.identityContext
      ? scoreStoreIdentityFit(
          {
            title: c.title,
            categoryHint: c.categoryHint,
            familyId: fam,
            shopMatchPct: c.shopMatchPct,
          },
          hunt.identityContext
        )
      : null;

    // Store Identity Fit runs BEFORE Merch Score — strong demotion, not hard filter
    let identityAdj = 0;
    if (identityFit) {
      if (identityFit.normallyBlockPublish) {
        identityAdj = -28;
      } else if (identityFit.band === "weak") {
        identityAdj = -14;
      } else if (identityFit.band === "strong") {
        identityAdj = 2;
      }
    }

    let merch =
      computeStoreBuilderMerchScore({
        title: c.title,
        categoryHint: c.categoryHint,
        shopMatchPct: c.shopMatchPct,
        assortmentTotal: assortment.total,
        productFocusScore: focusScore,
        marginPct: c.marginPct,
        deliveryHint: c.deliveryHint,
        overallScore: c.overallScore,
        profitNOK: c.profitNOK,
        landedCostNOK: c.landedCostNOK,
        retailNOK: c.retailNOK,
        stock: c.stock,
        listedCount: c.listedCount,
        similarInCatalog,
        economicConfidence: c.economicConfidence,
        priceChanges7d: c.priceChanges7d,
      }) +
      supplierAdj +
      hardAdj +
      identityAdj;

    if (identityFit?.normallyBlockPublish) {
      merch = Math.min(merch, 34);
    }

    // Apply fatigue as soft dampener on within-family product score
    merch = 40 + (merch - 40) * fatigueMult;

    const why = [...(focusResult.why || [])];
    if (identityFit) {
      why.unshift(
        `Store Identity Fit ${identityFit.score}/100 — ${identityFit.why}`
      );
    }
    if (fatigueMult < 1) {
      why.push(
        `Hunt fatigue: ${batchCount} i familien (×${fatigueMult.toFixed(2)})`
      );
    }

    return {
      merch,
      assortment,
      focusScore,
      focusStars: focusResult.stars || focusStars,
      why,
      familyId: fam,
      identityFit,
    };
  };

  const isNearDupe = (title: string, fam: string | null) => {
    // Against last few picks — especially same family
    for (let i = ordered.length - 1; i >= Math.max(0, ordered.length - 8); i--) {
      const prev = ordered[i];
      const prevFam = prev.productFocusFamilyId;
      if (fam && prevFam === fam && titleSimilarity(title, prev.title) >= 0.55) {
        return true;
      }
      if (titleSimilarity(title, prev.title) >= 0.72) return true;
    }
    return false;
  };

  while (remaining.length > 0) {
    const familyIndexes = new Map<string, number[]>();
    for (let i = 0; i < remaining.length; i++) {
      const fam =
        matchFn(remaining[i].title, remaining[i].categoryHint) || "__other__";
      const list = familyIndexes.get(fam) || [];
      list.push(i);
      familyIndexes.set(fam, list);
    }

    const totalPicked = Math.max(1, ordered.length);
    let bestFamily: string | null = null;
    let bestNeed = -Infinity;

    for (const [fam, idxs] of familyIndexes) {
      const viable = idxs.some((i) => remaining[i].shopMatchPct >= 65);
      if (!viable && idxs.every((i) => remaining[i].shopMatchPct < 55)) continue;

      const realFam = fam === "__other__" ? null : fam;
      const bound = realFam && bounds ? bounds[realFam] : null;
      const target =
        bound?.target ??
        (realFam && targets && targets[realFam] != null
          ? targets[realFam]
          : null);
      const have = realFam ? snapshot.byFamily[realFam] || 0 : 0;
      const batch = realFam ? batchFamily[realFam] || 0 : 0;
      const focusStars = realFam
        ? Number(hunt?.starsByFamily[realFam] ?? 0)
        : 0;
      const gId = groupOf(realFam);
      const groupShare = gId ? (batchGroup[gId] || 0) / totalPicked : 0;
      const groupQuota = gId ? HUNT_GROUP_QUOTAS[gId] ?? 0.08 : 0.08;

      const onCooldown =
        !!realFam &&
        recentFamilies.length > 0 &&
        recentFamilies
          .slice(-cooldownGap)
          .includes(realFam);

      let need = scoreFamilyNeedV3({
        have,
        target,
        batchCount: batch,
        focusStars,
        softMax: bound?.softMax ?? null,
        groupShare,
        groupQuota,
        onCooldown,
      });
      if (!viable) need -= 20;
      if (need > bestNeed) {
        bestNeed = need;
        bestFamily = fam;
      }
    }

    if (!bestFamily) {
      bestFamily = familyIndexes.keys().next().value || "__other__";
    }

    const idxs = familyIndexes.get(bestFamily) || [0];
    let pickIdx = idxs[0];
    let pickMeta: ReturnType<typeof scoreOne> | null = null;
    let bestMerch = -Infinity;

    for (const i of idxs) {
      const c = remaining[i];
      const fam =
        bestFamily === "__other__" ? null : matchFn(c.title, c.categoryHint);
      const batch = fam ? batchFamily[fam] || 0 : 0;
      const meta = scoreOne(c, fam, batch);
      let gated = c.shopMatchPct < 65 ? meta.merch - 28 : meta.merch;
      if (isNearDupe(c.title, fam)) gated -= 35;
      if (gated > bestMerch) {
        bestMerch = gated;
        pickIdx = i;
        const label = fam ? familyLabel(fam) : "variasjon";
        pickMeta = {
          ...meta,
          why: [
            `Butikkbygger: trenger ${label} nå`,
            ...meta.why,
          ].slice(0, 6),
        };
      }
    }

    // If all in family were near-dupes and other families exist, try next-best family once
    if (
      pickMeta &&
      isNearDupe(remaining[pickIdx].title, pickMeta.familyId) &&
      familyIndexes.size > 1
    ) {
      // keep pick — already penalized; diversity rule still drops extreme clones via -35
    }

    const picked = remaining.splice(pickIdx, 1)[0];
    const fam = matchFn(picked.title, picked.categoryHint);
    if (fam) {
      batchFamily[fam] = (batchFamily[fam] || 0) + 1;
      recentFamilies.push(fam);
      if (recentFamilies.length > 20) recentFamilies.shift();
      const gId = groupOf(fam);
      if (gId) batchGroup[gId] = (batchGroup[gId] || 0) + 1;
    }
    if (picked.supplier) {
      batchSupplier[picked.supplier] =
        (batchSupplier[picked.supplier] || 0) + 1;
    }
    const meta = pickMeta!;
    ordered.push({
      ...picked,
      merchScore: meta.merch,
      assortment: meta.assortment,
      productFocusScore: meta.focusScore,
      productFocusStars: meta.focusStars,
      productFocusWhy: meta.why,
      productFocusFamilyId: meta.familyId,
      identityFit: meta.identityFit ?? null,
    });
  }

  return { ordered, thinking: buildHuntThinking(snapshot, targets, bounds, batchFamily, hunt?.starsByFamily || {}) };
}

export function buildHuntThinking(
  snapshot: CatalogAssortmentSnapshot,
  targets: Record<string, number> | null | undefined,
  bounds: Record<string, AssortmentBoundsInput> | null | undefined,
  batchFamily: Record<string, number>,
  starsByFamily: Record<string, number>
): HuntThinking {
  const covered: string[] = [];
  const seeking: string[] = [];

  type Row = { id: string; label: string; fill: number; need: number; stars: number };
  const rows: Row[] = [];

  const ids = new Set<string>([
    ...Object.keys(targets || {}),
    ...Object.keys(bounds || {}),
    ...Object.keys(starsByFamily),
  ]);
  // Prefer known focus families
  for (const g of FOCUS_GROUP_DEFS) {
    for (const f of [...g.core, ...g.supplementary]) ids.add(f.id);
  }

  for (const id of ids) {
    const bound = bounds?.[id];
    const target =
      bound?.target ?? (targets && targets[id] != null ? targets[id] : null);
    if (target == null || target <= 0) continue;
    const have = (snapshot.byFamily[id] || 0) + (batchFamily[id] || 0);
    const fill = have / target;
    const stars = starsByFamily[id] || 0;
    const need = scoreFamilyNeedV3({
      have: snapshot.byFamily[id] || 0,
      target,
      batchCount: batchFamily[id] || 0,
      focusStars: stars,
      softMax: bound?.softMax,
    });
    rows.push({
      id,
      label: familyLabel(id),
      fill,
      need,
      stars,
    });
  }

  for (const r of [...rows].sort((a, b) => b.fill - a.fill)) {
    if (covered.length >= 3) break;
    if (r.fill >= 0.9 || (batchFamily[r.id] || 0) >= 20) {
      covered.push(`${r.label} er godt dekket.`);
    }
  }

  for (const r of [...rows].sort((a, b) => b.need - a.need)) {
    if (seeking.length >= 6) break;
    if (r.fill < 0.85 && r.need > 5) {
      seeking.push(`Søker etter ${r.label.toLowerCase()}.`);
    }
  }

  if (!seeking.length) {
    seeking.push("Søker etter variasjon på tvers av produktfamilier.");
  }

  return {
    covered,
    seeking,
    updatedAt: new Date().toISOString(),
  };
}

// Re-export why-found from core for callers that import hunt-store-builder
export { buildStoreBuilderWhyFound } from "@/lib/buyer/product-focus-core";

