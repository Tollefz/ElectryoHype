/**
 * Assortment / merchandising scoring for Digital Buyer.
 * Optimizes for a complete electronics store — not single-product peaks.
 */

import {
  COMPLEMENT_RULES,
  PRODUCT_FAMILIES,
  countFamilies,
  familyLabel,
  matchFamily,
} from "@/lib/intelligence/families";
import { getAllDbValues } from "@/lib/categories";
import { computeMerchBrain } from "@/lib/buyer/merch-brain";

export type CatalogAssortmentSnapshot = {
  totalActive: number;
  byCategory: Record<string, number>;
  byFamily: Record<string, number>;
};

/**
 * Coverage gap vs strategy target (−45..+28).
 * Soft max → strong demotion. Hard max → near-ignore unless exceptional.
 */
export function scoreCoverageAgainstTarget(input: {
  familyId: string | null;
  have: number;
  target: number | null;
  softMax?: number | null;
  hardMax?: number | null;
  batchCount?: number;
  /** Shop match — exceptional products can still pass hard max weakly */
  shopMatchPct?: number | null;
  /** Mission weight multiplier (>1 boosts gap bonus) */
  missionWeight?: number;
}): { score: number; why: string[]; fillRatio: number; pastHard: boolean } {
  const why: string[] = [];
  if (!input.familyId || input.target == null || input.target <= 0) {
    return { score: 0, why, fillRatio: 1, pastHard: false };
  }
  const have = input.have + (input.batchCount ?? 0);
  const target = input.target;
  const softMax =
    input.softMax != null && input.softMax > target
      ? input.softMax
      : Math.round(target * 1.3);
  const hardMax =
    input.hardMax != null && input.hardMax > softMax
      ? input.hardMax
      : Math.round(target * 1.7);
  const fill = have / target;
  const label = familyLabel(input.familyId);
  const weight = input.missionWeight && input.missionWeight > 0 ? input.missionWeight : 1;
  const exceptional = (input.shopMatchPct ?? 0) >= 92;
  let score = 0;
  let pastHard = false;

  if (have >= hardMax) {
    pastHard = true;
    if (exceptional) {
      score = -28;
      why.push(
        `${label} over hard grense (${have}/${hardMax}) — kun eksepsjonell kandidat vurderes`
      );
    } else {
      score = -45;
      why.push(
        `${label} hard grense nådd (${have}/${hardMax}) — ignorer nye`
      );
    }
  } else if (have >= softMax) {
    score = -28;
    why.push(`${label} over myk grense (${have}/${softMax}) — lav prioritet`);
  } else if (have === 0) {
    score = 28;
    why.push(`Mangler ${label} (0/${target}) — høy sortimentprioritet`);
  } else if (fill < 0.25) {
    score = 24;
    why.push(`${label} sterkt underdekket (${have}/${target})`);
  } else if (fill < 0.5) {
    score = 18;
    why.push(`${label} underdekket (${have}/${target})`);
  } else if (fill < 0.75) {
    score = 12;
    why.push(`${label} kan bygges videre (${have}/${target})`);
  } else if (fill < 0.95) {
    score = 5;
    why.push(`${label} nærmer seg mål (${have}/${target})`);
  } else if (fill <= 1.05) {
    score = 0;
    why.push(`${label} nær mål (${have}/${target}) — liten bonus`);
  } else {
    score = -12;
    why.push(`${label} over mål (${have}/${target}) — lavere prioritet`);
  }

  // Mission: amplify gap bonuses / soften penalties when under target
  if (weight !== 1) {
    if (score > 0) score = Math.round(score * weight);
    else if (score < 0 && have < target) score = Math.round(score / weight);
    if (weight > 1.05 && have < target) {
      why.push(`Oppdrag: ${label} vektet ×${weight.toFixed(1)}`);
    }
  }

  return {
    score: Math.max(-45, Math.min(35, score)),
    why,
    fillRatio: fill,
    pastHard,
  };
}

export type AssortmentScoreBreakdown = {
  /** -50..+40 contribution toward final merch score */
  total: number;
  categoryBalance: number;
  diversity: number;
  ecosystem: number;
  crossSell: number;
  /** Gap vs Sortimentstrategi target */
  coverageGap: number;
  familyId: string | null;
  have: number;
  target: number | null;
  softMax: number | null;
  hardMax: number | null;
  pastHard: boolean;
  why: string[];
};

export type AssortmentBoundsInput = {
  target: number;
  softMax: number;
  hardMax: number;
  missionWeight?: number;
};

export type MerchCandidateInput = {
  id: string;
  title: string;
  categoryHint?: string | null;
  shopMatchPct: number;
  overallScore: number;
  supplier?: string | null;
};

/** Soft caps — beyond this, same family is heavily penalized. */
const FAMILY_SOFT_CAP: Record<string, number> = {
  phone_case: 12,
  screen_protector: 10,
  charger: 15,
  usb_c_cable: 12,
  led_lighting: 10,
  gaming_mouse: 10,
  mouse: 10,
  keyboard: 10,
  headset: 10,
};

const DEFAULT_FAMILY_CAP = 8;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function buildCatalogSnapshot(
  products: Array<{ name: string; category?: string | null; isActive?: boolean }>
): CatalogAssortmentSnapshot {
  const active = products.filter((p) => p.isActive !== false);
  const byCategory: Record<string, number> = {};
  for (const p of active) {
    const cat = (p.category || "Ukategorisert").trim() || "Ukategorisert";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  return {
    totalActive: active.length,
    byCategory,
    byFamily: countFamilies(active),
  };
}

function resolveCategory(title: string, hint?: string | null): string {
  if (hint && getAllDbValues().includes(hint)) return hint;
  const fam = matchFamily(title, hint);
  if (fam) {
    const meta = PRODUCT_FAMILIES.find((f) => f.id === fam);
    if (meta?.categoryHint) return meta.categoryHint;
  }
  return hint || "Ukategorisert";
}

/**
 * Category balance: boost under-filled store categories, penalize overfilled.
 */
function scoreCategoryBalance(
  category: string,
  snapshot: CatalogAssortmentSnapshot
): { score: number; why: string[] } {
  const why: string[] = [];
  const mains = getAllDbValues().filter((c) => c !== "Ukategorisert");
  const total = Math.max(1, snapshot.totalActive);
  const count = snapshot.byCategory[category] || 0;
  const share = count / total;
  const ideal = 1 / Math.max(1, mains.length);

  let score = 0;
  if (count === 0) {
    score = 28;
    why.push(`${category} mangler i butikken — høy prioritet`);
  } else if (share < ideal * 0.4) {
    score = 22;
    why.push(`${category} er underrepresentert (${count} stk)`);
  } else if (share < ideal * 0.75) {
    score = 12;
    why.push(`${category} kan bygges videre (${count} stk)`);
  } else if (share > ideal * 2.5) {
    score = -28;
    why.push(`${category} er overrepresentert (${count} stk)`);
  } else if (share > ideal * 1.6) {
    score = -14;
    why.push(`${category} har allerede solid dekning (${count} stk)`);
  } else {
    score = 4;
  }
  return { score, why };
}

/**
 * Diversity: penalize saturated product families (e.g. 40 phone cases).
 * `batchCount` = how many of this family already picked in this ranking pass.
 */
function scoreDiversity(
  family: string | null,
  snapshot: CatalogAssortmentSnapshot,
  batchCount: number
): { score: number; why: string[] } {
  const why: string[] = [];
  if (!family) return { score: 0, why };

  const catalogCount = snapshot.byFamily[family] || 0;
  const combined = catalogCount + batchCount;
  const cap = FAMILY_SOFT_CAP[family] ?? DEFAULT_FAMILY_CAP;
  const label = familyLabel(family);

  let score = 0;
  if (combined === 0) {
    score = 18;
    why.push(`Mangler ${label} i sortimentet`);
  } else if (combined >= cap * 3) {
    score = -45;
    why.push(`For mange ${label} (${combined}) — diversitet straff`);
  } else if (combined >= cap * 2) {
    score = -32;
    why.push(`${label} er mettet (${combined})`);
  } else if (combined >= cap) {
    score = -18;
    why.push(`${label} nærmer seg tak (${combined}/${cap})`);
  } else if (combined >= Math.ceil(cap * 0.6)) {
    score = -6;
  } else if (catalogCount === 0 && batchCount === 0) {
    score = 18;
  }

  // Extra batch-internal penalty so one scan doesn't flood with identical SKUs
  if (batchCount >= 3) score -= Math.min(25, (batchCount - 2) * 6);

  return { score: clamp(score, -50, 20), why };
}

/**
 * Ecosystem: boost families that complete an existing chain (gaming desk, mobile, etc.).
 */
function scoreEcosystem(
  family: string | null,
  snapshot: CatalogAssortmentSnapshot
): { score: number; why: string[] } {
  const why: string[] = [];
  if (!family) return { score: 0, why };

  let best = 0;
  for (const rule of COMPLEMENT_RULES) {
    if (!rule.chain.includes(family)) continue;
    const present = rule.chain.filter((f) => (snapshot.byFamily[f] || 0) > 0);
    const missing = rule.chain.filter((f) => (snapshot.byFamily[f] || 0) === 0);
    if (present.length === 0) continue;
    if (!missing.includes(family) && (snapshot.byFamily[family] || 0) > 0) {
      // Already have some — small boost if chain still thin
      if (missing.length >= 3) {
        best = Math.max(best, 6);
      }
      continue;
    }
    // This family fills a gap in an active ecosystem
    const boost = clamp(8 + present.length * 3 + missing.length, 8, 30);
    if (boost > best) {
      best = boost;
      why.push(
        `Fullfører ${rule.name} (${present.length} på plass, mangler ${missing.length})`
      );
    }
  }
  return { score: best, why: why.slice(0, 2) };
}

/**
 * Cross-sell / accessory potential when anchors already exist.
 */
function scoreCrossSell(
  family: string | null,
  snapshot: CatalogAssortmentSnapshot
): { score: number; why: string[] } {
  const why: string[] = [];
  if (!family) return { score: 0, why };

  // Accessories that attach to high-volume anchors
  const pairs: Array<{ fam: string; anchor: string; minAnchor: number }> = [
    { fam: "mouse_pad", anchor: "gaming_mouse", minAnchor: 3 },
    { fam: "mouse_pad", anchor: "mouse", minAnchor: 5 },
    { fam: "screen_protector", anchor: "phone_case", minAnchor: 5 },
    { fam: "powerbank", anchor: "phone_case", minAnchor: 8 },
    { fam: "usb_c_hub", anchor: "usb_c_cable", minAnchor: 4 },
    { fam: "headset", anchor: "gaming_mouse", minAnchor: 5 },
    { fam: "webcam", anchor: "keyboard", minAnchor: 5 },
    { fam: "microphone", anchor: "headset", minAnchor: 3 },
    { fam: "cable_management", anchor: "usb_c_hub", minAnchor: 2 },
  ];

  let score = 0;
  for (const p of pairs) {
    if (p.fam !== family) continue;
    const anchors = snapshot.byFamily[p.anchor] || 0;
    if (anchors >= p.minAnchor && (snapshot.byFamily[family] || 0) < 3) {
      score = Math.max(score, 14);
      why.push(
        `Mersalg: ${anchors}× ${familyLabel(p.anchor)} trenger ${familyLabel(family)}`
      );
    }
  }
  return { score, why };
}

export function scoreAssortmentFit(input: {
  title: string;
  categoryHint?: string | null;
  snapshot: CatalogAssortmentSnapshot;
  /** How many of this family already selected in current ranking greedy pass */
  batchFamilyCount?: number;
  /** Sortimentstrategi targets: familyId → desired count (legacy simple map) */
  targets?: Record<string, number> | null;
  /** Rich bounds with soft/hard + mission */
  bounds?: Record<string, AssortmentBoundsInput> | null;
  shopMatchPct?: number | null;
}): AssortmentScoreBreakdown {
  const family = matchFamily(input.title, input.categoryHint);
  const category = resolveCategory(input.title, input.categoryHint);
  const batchCount = input.batchFamilyCount ?? 0;
  const have = family ? input.snapshot.byFamily[family] || 0 : 0;
  const bound = family && input.bounds ? input.bounds[family] : null;
  const target =
    bound?.target ??
    (family && input.targets && input.targets[family] != null
      ? input.targets[family]
      : family
        ? FAMILY_SOFT_CAP[family] ?? DEFAULT_FAMILY_CAP
        : null);
  const softMax =
    bound?.softMax ??
    (target != null ? Math.round(target * 1.3) : null);
  const hardMax =
    bound?.hardMax ??
    (target != null ? Math.round(target * 1.7) : null);

  const coverage = scoreCoverageAgainstTarget({
    familyId: family,
    have,
    target,
    softMax,
    hardMax,
    batchCount,
    shopMatchPct: input.shopMatchPct,
    missionWeight: bound?.missionWeight,
  });
  const cat = scoreCategoryBalance(category, input.snapshot);
  const div = scoreDiversity(family, input.snapshot, batchCount);
  const eco = scoreEcosystem(family, input.snapshot);
  const xs = scoreCrossSell(family, input.snapshot);

  // Past hard max: almost ignore (unless exceptional already reflected in coverage)
  const total = clamp(
    coverage.pastHard && (input.shopMatchPct ?? 0) < 92
      ? coverage.score
      : coverage.score * 1.15 +
          cat.score * 0.45 +
          div.score * 0.35 +
          eco.score * 0.55 +
          xs.score * 0.45,
    -50,
    40
  );

  return {
    total,
    categoryBalance: cat.score,
    diversity: div.score,
    ecosystem: eco.score,
    crossSell: xs.score,
    coverageGap: coverage.score,
    familyId: family,
    have,
    target,
    softMax,
    hardMax,
    pastHard: coverage.pastHard,
    why: [
      ...coverage.why,
      ...cat.why,
      ...div.why,
      ...eco.why,
      ...xs.why,
    ].slice(0, 6),
  };
}

/**
 * Final merchandising score — delegates to Merch Brain (single scoring brain).
 */
export function computeMerchandisingScore(input: {
  shopMatchPct: number;
  overallScore: number;
  assortment: AssortmentScoreBreakdown;
  productFocusScore?: number;
  marginPct?: number | null;
  title?: string;
  deliveryHint?: string | null;
  profitNOK?: number | null;
  landedCostNOK?: number | null;
  retailNOK?: number | null;
  stock?: number | null;
  economicConfidence?: number | null;
}): number {
  return computeMerchBrain({
    title: input.title || "",
    shopMatchPct: input.shopMatchPct,
    overallScore: input.overallScore,
    assortmentTotal: input.assortment.total,
    productFocusScore: input.productFocusScore,
    marginPct: input.marginPct,
    deliveryHint: input.deliveryHint,
    profitNOK: input.profitNOK,
    landedCostNOK: input.landedCostNOK,
    retailNOK: input.retailNOK,
    stock: input.stock,
    economicConfidence: input.economicConfidence,
  }).butikkscore;
}


/**
 * Store-builder ranking — delegates to hunt-store-builder (family first).
 */
export type ProductFocusRankInput = {
  starsByFamily: Record<string, number>;
  matchFamilyFn?: (title: string, categoryHint?: string | null) => string | null;
  scoreFocusFn?: (input: {
    familyId: string | null;
    stars: number;
    shopMatchPct: number;
    label?: string;
  }) => { score: number; why: string[]; stars: number };
  familyFirst?: boolean;
};

export function rankByAssortmentMerchandising<T extends MerchCandidateInput>(
  candidates: T[],
  snapshot: CatalogAssortmentSnapshot,
  targets?: Record<string, number> | null,
  bounds?: Record<string, AssortmentBoundsInput> | null,
  productFocus?: ProductFocusRankInput | null
): Array<
  T & {
    merchScore: number;
    assortment: AssortmentScoreBreakdown;
    productFocusScore: number;
    productFocusStars: number;
    productFocusWhy: string[];
    productFocusFamilyId: string | null;
  }
> {
  // Lazy require avoids circular init with hunt-store-builder
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rankAsStoreBuilder } =
    require("@/lib/buyer/hunt-store-builder") as typeof import("@/lib/buyer/hunt-store-builder");
  const { ordered } = rankAsStoreBuilder(
    candidates,
    snapshot,
    targets,
    bounds,
    productFocus
      ? {
          starsByFamily: productFocus.starsByFamily,
          matchFamilyFn: productFocus.matchFamilyFn,
          scoreFocusFn: productFocus.scoreFocusFn,
        }
      : null
  );
  return ordered;
}
