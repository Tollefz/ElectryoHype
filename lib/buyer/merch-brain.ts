/**
 * Merch Brain — single scoring brain for Digital Buyer.
 *
 * Pillars → one Butikkscore with transparent breakdown.
 * Caps always sum to 100 — see SCORE_TRUTH.md.
 * Gates (publish/filter) consume brain outputs; they do not re-score.
 */

import {
  MARGIN_HARD_STOP_PCT,
  MARGIN_SOFT_WARNING_PCT,
  MARGIN_HEALTHY_MAX_PCT,
  MARGIN_HEALTHY_MIN_PCT,
  MARGIN_EXTREME_PCT,
  classifyMargin,
  marginTargetForCategory,
} from "@/lib/buyer/margin-policy";
import { supplierRiskFromChanges } from "@/lib/buyer/supplier-risk";
import { matchFamily } from "@/lib/intelligence/families";

/** Max points per pillar (sum with econ+supplier = 100). */
export const BRAIN_CAPS = {
  assortment: 18,
  focus: 14,
  profit: 11,
  margin: 10,
  delivery: 9,
  inventory: 9,
  competition: 8,
  demand: 7,
  economic: 8,
  supplierStability: 6,
} as const;

export type BrainPillarId = keyof typeof BRAIN_CAPS;

export type BrainBreakdownRow = {
  id: BrainPillarId | "economic_pct" | "supplier_risk_pct";
  label: string;
  points: number;
  max: number;
  ok: boolean;
  detail?: string;
  /** Display as percent instead of points */
  asPercent?: number;
};

export type MerchBrainInput = {
  title: string;
  categoryHint?: string | null;
  shopMatchPct: number;
  overallScore?: number | null;
  /** Assortment fit total typically −50..+40 */
  assortmentTotal?: number | null;
  /** Product focus bonus −2..+14 */
  productFocusScore?: number | null;
  marginPct?: number | null;
  /** Profit in NOK (retail − landed) */
  profitNOK?: number | null;
  landedCostNOK?: number | null;
  retailNOK?: number | null;
  deliveryHint?: string | null;
  deliveryDays?: number | null;
  stock?: number | null;
  listedCount?: number | null;
  rating?: number | null;
  /** Near-identical already in catalog / hunt */
  similarInCatalog?: number | null;
  economicConfidence?: number | null;
  /** Price changes last 7 days for this SKU/supplier */
  priceChanges7d?: number | null;
  supplierRiskPct?: number | null;
};

export type MerchBrainResult = {
  butikkscore: number;
  recommendation: "Publiser" | "Vurder" | "Hold";
  profitScore: number;
  marginScore: number;
  deliveryScore: number;
  inventoryScore: number;
  competitionScore: number;
  demandScore: number;
  supplierRiskPct: number;
  economicConfidence: number;
  breakdown: BrainBreakdownRow[];
  profitNOK: number | null;
};

function clamp(n: number, lo = 0, hi = 100): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function scale(score0to100: number, maxPts: number): number {
  return Math.round((clamp(score0to100) / 100) * maxPts * 10) / 10;
}

/** Profit Score 0–100 — kroner earned, but not when margin looks extreme/overpriced. */
export function scoreProfit(input: {
  profitNOK?: number | null;
  marginPct?: number | null;
  landedCostNOK?: number | null;
  retailNOK?: number | null;
}): number {
  let profit = input.profitNOK;
  if (
    (profit == null || !Number.isFinite(profit)) &&
    input.retailNOK != null &&
    input.landedCostNOK != null
  ) {
    profit = input.retailNOK - input.landedCostNOK;
  }
  if (profit == null || !Number.isFinite(profit)) {
    if (input.marginPct == null) return 45;
    return clamp(scoreMarginPillar(input.marginPct));
  }

  let s = 0;
  if (profit <= 0) s = 5;
  else if (profit < 30) s = 25 + profit;
  else if (profit < 80) s = 55 + (profit - 30) * 0.5;
  else if (profit < 200) s = 80 + (profit - 80) * 0.1;
  else if (profit < 500) s = 92 + (profit - 200) * 0.02;
  else s = 98;

  const m = input.marginPct;
  if (m != null && m >= MARGIN_SOFT_WARNING_PCT && m <= MARGIN_HEALTHY_MAX_PCT) {
    s = Math.min(100, s + 4);
  }
  if (
    m != null &&
    m < MARGIN_SOFT_WARNING_PCT &&
    m >= MARGIN_HARD_STOP_PCT &&
    profit >= 150
  ) {
    s = Math.max(s, 72);
  }
  // Extreme markup ≠ better product — cap so 80%+ margin cannot dominate rank
  if (m != null && m > MARGIN_EXTREME_PCT) {
    s = Math.min(s, 68);
  } else if (m != null && m > MARGIN_HEALTHY_MAX_PCT) {
    s = Math.min(s, 82);
  }
  return clamp(s);
}

/**
 * Margin Score 0–100 — peak in healthy competitive band (≈35–60%).
 * Extreme margins score poorly (overpriced vs. market).
 */
export function scoreMarginPillar(
  marginPct: number | null | undefined,
  category?: string | null,
  title?: string | null,
  landedNOK?: number | null
): number {
  if (marginPct == null || !Number.isFinite(marginPct)) return 40;
  const target = marginTargetForCategory(category, title, landedNOK);
  const cls = classifyMargin(marginPct);

  if (cls === "hard_fail") return clamp(marginPct);
  if (cls === "extreme") {
    // 70% → ~48, 90% → ~28
    return clamp(55 - (marginPct - MARGIN_EXTREME_PCT) * 1.2);
  }
  if (cls === "soft_warn") {
    return clamp(
      45 +
        ((marginPct - MARGIN_HARD_STOP_PCT) /
          (MARGIN_SOFT_WARNING_PCT - MARGIN_HARD_STOP_PCT)) *
          17
    );
  }
  // Inside category/landed target band — best
  if (marginPct >= target.min && marginPct <= target.max) return 94;
  // Healthy competitive 35–60%
  if (
    marginPct >= MARGIN_HEALTHY_MIN_PCT &&
    marginPct <= MARGIN_HEALTHY_MAX_PCT
  ) {
    return 88;
  }
  // Slightly above healthy but under extreme (e.g. 60–70 for småvarer)
  if (marginPct > MARGIN_HEALTHY_MAX_PCT && marginPct <= MARGIN_EXTREME_PCT) {
    return clamp(78 - (marginPct - MARGIN_HEALTHY_MAX_PCT));
  }
  return clamp(
    70 +
      ((marginPct - MARGIN_SOFT_WARNING_PCT) /
        Math.max(1, target.min - MARGIN_SOFT_WARNING_PCT)) *
        20
  );
}

/** Delivery Score — graduated by days. */
export function scoreDelivery(input: {
  deliveryHint?: string | null;
  deliveryDays?: number | null;
}): number {
  let days = input.deliveryDays;
  if (days == null && input.deliveryHint) {
    const m = String(input.deliveryHint).match(/(\d+)\s*[-–]?\s*(\d+)?/);
    if (m) {
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      days = Math.round((a + b) / 2);
    } else if (/express|rask|next.?day/i.test(input.deliveryHint)) {
      days = 3;
    }
  }
  if (days == null || !Number.isFinite(days)) return 50;
  if (days <= 4) return 98;
  if (days <= 8) return 82;
  if (days <= 13) return 62;
  if (days <= 21) return 38;
  return 18;
}

/** Inventory Score — don't build store on 3 units. */
export function scoreInventory(stock: number | null | undefined): number {
  if (stock == null || !Number.isFinite(stock)) return 48;
  if (stock <= 0) return 5;
  if (stock < 5) return 15;
  if (stock < 20) return 40;
  if (stock < 50) return 58;
  if (stock < 150) return 75;
  if (stock < 400) return 88;
  return 96;
}

/**
 * Competition Score — penalize near-duplicates already in shop.
 * Higher score = healthier (less collision).
 */
export function scoreCompetition(input: {
  similarInCatalog?: number | null;
  listedCount?: number | null;
  overallScore?: number | null;
}): number {
  const sim = input.similarInCatalog ?? 0;
  let s = 90;
  if (sim >= 17) s = 8;
  else if (sim >= 10) s = 22;
  else if (sim >= 5) s = 40;
  else if (sim >= 2) s = 58;
  else if (sim === 1) s = 72;
  else s = 92;

  const listed = input.listedCount ?? 0;
  if (listed > 20000) s -= 18;
  else if (listed > 8000) s -= 10;
  else if (listed > 2000) s -= 4;

  return clamp(s);
}

/** Demand Score — heuristic only (not generative AI). */
export function scoreDemand(input: {
  listedCount?: number | null;
  rating?: number | null;
  retailNOK?: number | null;
  overallScore?: number | null;
  title?: string | null;
  categoryHint?: string | null;
}): number {
  let s = 40;
  const listed = input.listedCount ?? 0;
  if (listed >= 200 && listed <= 5000) s += 22;
  else if (listed > 5000 && listed <= 15000) s += 14;
  else if (listed > 15000) s += 4;
  else if (listed > 50) s += 10;

  if (input.rating != null) {
    if (input.rating >= 4.7) s += 14;
    else if (input.rating >= 4.3) s += 10;
    else if (input.rating >= 3.8) s += 4;
    else if (input.rating < 3.5) s -= 12;
  }

  const price = input.retailNOK ?? 0;
  if (price > 0) {
    if (price >= 99 && price <= 499) s += 12;
    else if (price < 79) s += 4;
    else if (price <= 999) s += 8;
    else if (price <= 1999) s += 5;
    else s -= 2;
  }

  const t = `${input.title || ""} ${input.categoryHint || ""}`.toLowerCase();
  if (/usb[- ]?c|gan|magsafe|nvme|rgb|gaming|dock|hub|power ?bank/.test(t)) {
    s += 8;
  }
  if (/202[4-6]|new |nyeste|gen ?3|wi[- ]?fi ?6|bluetooth ?5/.test(t)) {
    s += 5;
  }

  if (input.overallScore != null) {
    s += (clamp(input.overallScore) - 50) * 0.15;
  }

  return clamp(s);
}

export function scoreAssortmentPillar(assortmentTotal: number | null | undefined): number {
  if (assortmentTotal == null) return 50;
  return clamp(50 + Math.max(-45, Math.min(45, assortmentTotal)));
}

export function scoreFocusPillar(
  focusScore: number | null | undefined,
  shopMatchPct: number
): number {
  if (shopMatchPct < 65) return 35;
  if (focusScore == null) return 45;
  return clamp(50 + Math.max(-20, Math.min(35, focusScore * 2.2)));
}

/**
 * Count similar products in a title list (catalog / hunt batch).
 */
export function countSimilarTitles(
  title: string,
  others: string[],
  threshold = 0.55
): number {
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
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9æøå\s]/gi, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !stop.has(t))
    );
  const A = tokens(title);
  if (!A.size) return 0;
  let n = 0;
  for (const o of others) {
    if (!o || o === title) continue;
    const B = tokens(o);
    if (!B.size) continue;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter += 1;
    const sim = inter / Math.max(A.size, B.size);
    if (sim >= threshold) n += 1;
  }
  const fam = matchFamily(title);
  if (fam && n < 3) {
    const sameFam = others.filter(
      (o) => o && o !== title && matchFamily(o) === fam
    ).length;
    if (sameFam >= 17) n = Math.max(n, sameFam);
    else if (sameFam >= 5) n = Math.max(n, Math.min(sameFam, 10));
  }
  return n;
}

/** Main entry — compute Butikkscore + transparent breakdown. */
export function computeMerchBrain(input: MerchBrainInput): MerchBrainResult {
  const profitNOK =
    input.profitNOK ??
    (input.retailNOK != null && input.landedCostNOK != null
      ? input.retailNOK - input.landedCostNOK
      : null);

  const profitScore = scoreProfit({
    profitNOK,
    marginPct: input.marginPct,
    landedCostNOK: input.landedCostNOK,
    retailNOK: input.retailNOK,
  });
  const marginScore = scoreMarginPillar(
    input.marginPct,
    input.categoryHint,
    input.title,
    input.landedCostNOK
  );
  const deliveryScore = scoreDelivery({
    deliveryHint: input.deliveryHint,
    deliveryDays: input.deliveryDays,
  });
  const inventoryScore = scoreInventory(input.stock);
  const competitionScore = scoreCompetition({
    similarInCatalog: input.similarInCatalog,
    listedCount: input.listedCount,
    overallScore: input.overallScore,
  });
  const demandScore = scoreDemand({
    listedCount: input.listedCount,
    rating: input.rating,
    retailNOK: input.retailNOK,
    overallScore: input.overallScore,
    title: input.title,
    categoryHint: input.categoryHint,
  });
  const assortmentScore = scoreAssortmentPillar(input.assortmentTotal);
  const focusScore = scoreFocusPillar(
    input.productFocusScore,
    input.shopMatchPct
  );

  const economicConfidence = clamp(input.economicConfidence ?? 70);
  const supplierRiskPct = clamp(
    input.supplierRiskPct ??
      supplierRiskFromChanges(input.priceChanges7d ?? 0)
  );

  const pts = {
    assortment: scale(assortmentScore, BRAIN_CAPS.assortment),
    focus: scale(focusScore, BRAIN_CAPS.focus),
    profit: scale(profitScore, BRAIN_CAPS.profit),
    margin: scale(marginScore, BRAIN_CAPS.margin),
    delivery: scale(deliveryScore, BRAIN_CAPS.delivery),
    inventory: scale(inventoryScore, BRAIN_CAPS.inventory),
    competition: scale(competitionScore, BRAIN_CAPS.competition),
    demand: scale(demandScore, BRAIN_CAPS.demand),
    economic: scale(economicConfidence, BRAIN_CAPS.economic),
    supplierStability: scale(100 - supplierRiskPct, BRAIN_CAPS.supplierStability),
  };

  const butikkscore = Math.round(
    Object.values(pts).reduce((a, b) => a + b, 0)
  );

  const marginCls = classifyMargin(input.marginPct);
  const breakdown: BrainBreakdownRow[] = [
    {
      id: "assortment",
      label: "Sortiment",
      points: pts.assortment,
      max: BRAIN_CAPS.assortment,
      ok: pts.assortment >= BRAIN_CAPS.assortment * 0.55,
    },
    {
      id: "focus",
      label: "Produktfokus",
      points: pts.focus,
      max: BRAIN_CAPS.focus,
      ok: pts.focus >= BRAIN_CAPS.focus * 0.45,
    },
    {
      id: "profit",
      label: "Profit",
      points: pts.profit,
      max: BRAIN_CAPS.profit,
      ok: profitScore >= 55,
      detail:
        profitNOK != null ? `${Math.round(profitNOK)} kr fortjeneste` : undefined,
    },
    {
      id: "margin",
      label: "Margin",
      points: pts.margin,
      max: BRAIN_CAPS.margin,
      ok: marginCls === "ok" || marginCls === "strong",
      detail:
        input.marginPct != null
          ? marginCls === "soft_warn"
            ? `⚠ ${Math.round(input.marginPct)}% (mål ${MARGIN_SOFT_WARNING_PCT}%)`
            : marginCls === "extreme"
              ? `⚠ ${Math.round(input.marginPct)}% — for høy (urealistisk)`
              : marginCls === "hard_fail"
                ? `⛔ ${Math.round(input.marginPct)}%`
                : `${Math.round(input.marginPct)}%`
          : undefined,
    },
    {
      id: "delivery",
      label: "Levering",
      points: pts.delivery,
      max: BRAIN_CAPS.delivery,
      ok: deliveryScore >= 55,
    },
    {
      id: "inventory",
      label: "Lager",
      points: pts.inventory,
      max: BRAIN_CAPS.inventory,
      ok: inventoryScore >= 50,
      detail: input.stock != null ? `${input.stock} stk` : undefined,
    },
    {
      id: "competition",
      label: "Konkurranse",
      points: pts.competition,
      max: BRAIN_CAPS.competition,
      ok: competitionScore >= 50,
      detail:
        (input.similarInCatalog ?? 0) > 0
          ? `${input.similarInCatalog} lignende i sortiment`
          : undefined,
    },
    {
      id: "demand",
      label: "Demand",
      points: pts.demand,
      max: BRAIN_CAPS.demand,
      ok: demandScore >= 45,
    },
    {
      id: "economic_pct",
      label: "Økonomisk sikkerhet",
      points: pts.economic,
      max: BRAIN_CAPS.economic,
      ok: economicConfidence >= 90,
      asPercent: Math.round(economicConfidence),
    },
    {
      id: "supplier_risk_pct",
      label: "Supplier Risk",
      points: pts.supplierStability,
      max: BRAIN_CAPS.supplierStability,
      ok: supplierRiskPct <= 25,
      asPercent: Math.round(supplierRiskPct),
    },
  ];

  let recommendation: MerchBrainResult["recommendation"] = "Hold";
  if (
    butikkscore >= 78 &&
    economicConfidence >= 90 &&
    marginCls !== "hard_fail" &&
    supplierRiskPct < 70
  ) {
    recommendation = "Publiser";
  } else if (butikkscore >= 58 && marginCls !== "hard_fail") {
    recommendation = "Vurder";
  }

  return {
    butikkscore: clamp(butikkscore),
    recommendation,
    profitScore,
    marginScore,
    deliveryScore,
    inventoryScore,
    competitionScore,
    demandScore,
    supplierRiskPct,
    economicConfidence,
    breakdown,
    profitNOK: profitNOK != null ? Math.round(profitNOK) : null,
  };
}
