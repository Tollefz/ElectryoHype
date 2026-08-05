/**
 * Digital Buyer board helpers — smart groups, packages, rich cards.
 * Pure UX layer on existing BuyerCandidate data.
 */

import { CATEGORY_MISSIONS } from "@/lib/buyer/category-missions";
import { classifyBuyerCandidate } from "@/lib/buyer/classify-candidate";
import {
  buildExplainableMatch,
  type MatchSignal,
  type PreferenceContext,
} from "@/lib/buyer/explainable-match";
import { scoreAssortmentFit } from "@/lib/buyer/assortment-score";
import {
  buildStoreBuilderWhyFound,
  familyTier,
  focusGroupBadges,
  matchFamilyWithCustoms,
  scoreProductFocus,
  type CustomFocusFamily,
  type FocusStars,
  type WhyFoundRow,
} from "@/lib/buyer/product-focus-core";
import { familyLabel } from "@/lib/intelligence/families";
import {
  computeMerchBrain,
  countSimilarTitles,
  type BrainBreakdownRow,
} from "@/lib/buyer/merch-brain";
import {
  applyAiMemoryNudge,
  scoreAiMemory,
  type AiMemorySnapshot,
} from "@/lib/buyer/ai-memory";
import {
  applyStoreDnaNudge,
  scoreStoreDna,
  type StoreDnaSnapshot,
} from "@/lib/buyer/store-dna";
import {
  applyAiFeedbackNudge,
  scoreAiFeedback,
  type AiFeedbackSnapshot,
} from "@/lib/buyer/ai-feedback";

export type BuyerCardOptions = {
  prefs?: PreferenceContext | null;
  gapFamily?: string | null;
  /** Live sortimentstrategi — recomputes Sortimentscore without waiting for rescan */
  assortment?: {
    snapshot: import("@/lib/buyer/assortment-score").CatalogAssortmentSnapshot;
    targets: Record<string, number>;
    bounds?: Record<
      string,
      import("@/lib/buyer/assortment-score").AssortmentBoundsInput
    >;
  } | null;
  /** Produktfokus — structured hunt priority */
  productFocus?: {
    starsByFamily: Record<string, number>;
    customFamilies?: CustomFocusFamily[];
  } | null;
  /** Titles already in catalog / board for competition */
  catalogTitles?: string[] | null;
  /** AI Store Memory — optional additive nudge (±3 max) */
  aiMemory?: AiMemorySnapshot | null;
  /** Store DNA — observed identity nudge (±2 max) */
  storeDna?: StoreDnaSnapshot | null;
  /** Performance feedback nudge (±2 max) */
  aiFeedback?: AiFeedbackSnapshot | null;
};

export type DeskBuyerCandidate = {
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
  merchandiserRecId?: string | null;
  rank?: number | null;
  createdAt?: string | Date | null;
  filterReasons?: unknown;
  fingerprint?: string | null;
};

export type DeskBuyerCategoryGroup = {
  id: string;
  label: string;
  emoji: string;
  count: number;
  bestScore: number;
  candidates: DeskBuyerCandidateCard[];
};

export type DeskBuyerCandidateCard = {
  id: string;
  title: string;
  imageUrl: string | null;
  images: string[];
  videos: string[];
  supplier: string;
  shopMatchPct: number;
  confidence: number;
  overallScore: number;
  marginPct: number | null;
  retailNOK: number | null;
  deliveryHint: string | null;
  qualityScore: number | null;
  why: string[];
  whyChosen: string;
  whyFits: string;
  risks: string[];
  recommendation: string;
  canImport: boolean;
  merchandiserRecId: string | null;
  categoryId: string;
  categoryLabel: string;
  createdAt: string | null;
  shortReason: string;
  variantCount: number;
  isPremium: boolean;
  inStock: boolean;
  rank: number | null;
  /** Function-first store taxonomy */
  taxonomyPath: string;
  subcategory: string | null;
  /** Explainable Butikkmatch */
  explainPct: number;
  explainSignals: MatchSignal[];
  explainSummary: string;
  storeRelevance: number;
  explainCapped: boolean;
  explainBreakdown: Array<{ component: string; points: number }>;
  fitsElectroHype: boolean;
  costNOK: number | null;
  /** Economic Validation — transparent cost basis */
  landedCostNOK: number | null;
  shippingNOK: number | null;
  feesNOK: number | null;
  vatNOK: number | null;
  economicConfidence: number | null;
  economicChecks: Array<{ ok: boolean; label: string }>;
  economicFlags: string[];
  fxRate: number | null;
  fxFetchedAt: string | null;
  /** Sortimentstrategi */
  assortmentScore: number | null;
  assortmentCoverageGap: number | null;
  assortmentFamilyId: string | null;
  assortmentHave: number | null;
  assortmentTarget: number | null;
  assortmentWhy: string[];
  /** Produktfokus */
  productFocusScore: number | null;
  productFocusStars: number | null;
  productFocusFamilyId: string | null;
  productFocusLabel: string | null;
  productFocusWhy: string[];
  productFocusBadges: Array<{ group: string; stars: number }>;
  /** Star breakdown for «Hvorfor fant AI dette?» */
  whyFoundStars: WhyFoundRow[];
  /** Prisgrunn — why this retail price */
  priceConfidence: number | null;
  priceReasons: Array<{ ok: boolean; label: string }>;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  /** Merch Brain — transparent Butikkscore */
  butikkscore: number | null;
  butikkRecommendation: "Publiser" | "Vurder" | "Hold" | null;
  butikkBreakdown: BrainBreakdownRow[];
  profitNOK: number | null;
  supplierRiskPct: number | null;
  /** AI Store Memory — capped nudge applied after Merch Brain */
  memoryNudge: number | null;
  memoryScore: number | null;
  memoryWhy: string[];
  /** Store DNA — capped identity nudge */
  dnaNudge: number | null;
  dnaScore: number | null;
  dnaWhy: string[];
  /** Performance feedback — capped */
  feedbackNudge: number | null;
  feedbackScore: number | null;
  feedbackWhy: string[];
};

export type BuyerSmartGroup = {
  id: string;
  label: string;
  emoji: string;
  count: number;
  candidates: DeskBuyerCandidateCard[];
};

export type BuyerProductPackage = {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  productCount: number;
  avgMatch: number;
  avgMargin: number | null;
  coveragePct: number;
  slots: Array<{ label: string; filled: boolean; card: DeskBuyerCandidateCard | null }>;
  importIds: string[];
};

export type BuyerBoardModel = {
  cards: DeskBuyerCandidateCard[];
  newSuggestions: DeskBuyerCandidateCard[];
  rest: DeskBuyerCandidateCard[];
  smartGroups: BuyerSmartGroup[];
  packages: BuyerProductPackage[];
  categoryGroups: DeskBuyerCategoryGroup[];
};

const CATEGORY_DEFS: Array<{
  id: string;
  label: string;
  emoji: string;
  match: RegExp;
}> = [
  {
    id: "gaming",
    label: "Gaming",
    emoji: "🎮",
    match: /gaming|\bgamer\b|spillmus|spilltastatur|mouse ?pad|controller|mechanical keyboard|rgb (keyboard|mouse|headset)/i,
  },
  {
    id: "mobil",
    label: "Mobil",
    emoji: "📱",
    match: /phone|mobil|magsafe|power ?bank|case|earbud|airpod/i,
  },
  {
    id: "kontor",
    label: "Kontor",
    emoji: "💻",
    match: /office|kontor|webcam|monitor|keyboard|desk|standing|laptop/i,
  },
  {
    id: "audio",
    label: "Audio",
    emoji: "🎧",
    match: /audio|headset|earbud|speaker|microphone|mic|headphone/i,
  },
  {
    id: "hjem",
    label: "Smart Home",
    emoji: "🏠",
    match: /home|hjem|lamp|smart ?plug|led|sensor/i,
  },
  {
    id: "usbc",
    label: "USB-C & kabler",
    emoji: "🔌",
    match: /usb-?c|hub|hdmi|cable|kabel|dongle|adapter/i,
  },
  {
    id: "elektronikk",
    label: "Elektronikk",
    emoji: "⚡",
    match: /speaker|bluetooth|charger|elektronikk|gadget/i,
  },
];

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).filter(Boolean);
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampStarsLocal(n: unknown): FocusStars {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v >= 5) return 5;
  return v as FocusStars;
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const s = String(u || "").trim();
    if (!s || !/^https?:\/\//i.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

import { sortProductImageUrls, filterPlayableVideoUrls } from "@/lib/products/media-sort";

function extractMedia(c: DeskBuyerCandidate): { images: string[]; videos: string[] } {
  const snap =
    c.snapshot && typeof c.snapshot === "object" ? (c.snapshot as Record<string, unknown>) : {};
  const images = sortProductImageUrls(
    uniqueUrls([
      ...(Array.isArray(snap.images) ? snap.images.map(String) : []),
      typeof snap.imageUrl === "string" ? snap.imageUrl : "",
      c.imageUrl || "",
      ...(Array.isArray(snap.variantImages) ? snap.variantImages.map(String) : []),
    ])
  );
  const videos = filterPlayableVideoUrls([
    ...(Array.isArray(snap.videos) ? snap.videos : []),
    typeof snap.videoUrl === "string" ? snap.videoUrl : "",
  ]);
  return { images, videos };
}

function pickCategory(c: DeskBuyerCandidate): {
  id: string;
  label: string;
  emoji: string;
  taxonomyPath: string;
  subcategory: string | null;
  fitsElectroHype: boolean;
} {
  const tags = asStringArray(c.discoveryTags).map((t) => t.toLowerCase());
  if (tags.includes("new_category")) {
    return {
      id: "new_categories",
      label: "Nye kategorier",
      emoji: "✨",
      taxonomyPath: "Ny kategori",
      subcategory: null,
      fitsElectroHype: true,
    };
  }

  const snap =
    c.snapshot && typeof c.snapshot === "object"
      ? (c.snapshot as Record<string, unknown>)
      : {};
  const text = [
    c.title || "",
    String(snap.categoryHint || ""),
    String(snap.title || ""),
    tags.join(" "),
  ].join(" ");

  const tax = classifyBuyerCandidate(text);
  const emoji =
    tax.shelfId === "gaming"
      ? "🎮"
      : tax.shelfId === "mobil"
        ? "📱"
        : tax.shelfId === "kontor"
          ? "💻"
          : tax.shelfId === "audio"
            ? "🎧"
            : tax.shelfId === "hjem"
              ? "🏠"
              : "📦";

  return {
    id: tax.fitsElectroHype ? tax.shelfId : "andre",
    label: tax.shelfLabel,
    emoji,
    taxonomyPath: tax.subcategory
      ? `${tax.main} › ${tax.subcategory}`
      : tax.main,
    subcategory: tax.subcategory,
    fitsElectroHype: tax.fitsElectroHype,
  };
}

function sortKey(card: DeskBuyerCandidateCard): number {
  // Single truth: Butikkscore (Merch Brain) first — explainPct is narrative only
  const brain = card.butikkscore ?? 0;
  return (
    brain * 5 +
    card.shopMatchPct * 2 +
    (card.assortmentScore ?? 0) * 1.5 +
    (card.marginPct ?? 0) +
    (card.fitsElectroHype ? 10 : -40)
  );
}

export function toBuyerCard(
  c: DeskBuyerCandidate,
  opts?: BuyerCardOptions
): DeskBuyerCandidateCard {
  const pricing =
    c.pricing && typeof c.pricing === "object" ? (c.pricing as Record<string, unknown>) : {};
  const scores =
    c.scores && typeof c.scores === "object" ? (c.scores as Record<string, unknown>) : {};
  const snap =
    c.snapshot && typeof c.snapshot === "object" ? (c.snapshot as Record<string, unknown>) : {};
  const cat = pickCategory(c);
  const media = extractMedia(c);

  const why = [...asStringArray(c.shopMatchWhy), ...asStringArray(c.reasons)].slice(0, 8);
  const risks = asStringArray(c.risks).slice(0, 4);
  const marginPct =
    pricing.marginPct != null
      ? num(pricing.marginPct, NaN)
      : pricing.estimatedMarginPct != null
        ? num(pricing.estimatedMarginPct, NaN)
        : null;
  const retailNOK =
    pricing.retailNOK != null
      ? num(pricing.retailNOK, NaN)
      : pricing.estimatedRetailNOK != null
        ? num(pricing.estimatedRetailNOK, NaN)
        : pricing.suggestedRetailNOK != null
          ? num(pricing.suggestedRetailNOK, NaN)
          : null;

  const confidence = Math.round(
    num(scores.confidence, NaN) || (num(c.shopMatchPct) + num(c.overallScore)) / 2
  );

  const qualityScore =
    scores.quality != null
      ? num(scores.quality)
      : scores.qualityScore != null
        ? num(scores.qualityScore)
        : num(c.overallScore);

  const deliveryHint =
    typeof snap.deliveryTime === "string" && snap.deliveryTime
      ? String(snap.deliveryTime)
      : typeof snap.deliveryDays === "number"
        ? `Ca. ${snap.deliveryDays} dager`
        : typeof snap.shippingHint === "string"
          ? snap.shippingHint
          : null;

  const marginRounded =
    marginPct != null && Number.isFinite(marginPct) ? Math.round(marginPct) : null;

  const recommendation =
    num(c.shopMatchPct) >= 80 && (marginPct == null || marginPct >= 25)
      ? "Velg"
      : num(c.shopMatchPct) >= 65
        ? "Vurder"
        : "Hold";

  const costNOK =
    pricing.costNOK != null
      ? Math.round(num(pricing.costNOK))
      : pricing.landedCostNOK != null
        ? null // prefer showing purchase cost separately when only landed exists
        : null;
  const landedCostNOK =
    pricing.landedCostNOK != null
      ? Math.round(num(pricing.landedCostNOK))
      : null;
  const shippingNOK =
    pricing.shippingNOK != null ? Math.round(num(pricing.shippingNOK)) : null;
  const feesNOK =
    pricing.feesNOK != null ? Math.round(num(pricing.feesNOK)) : null;
  const vatNOK =
    pricing.vatNOK != null ? Math.round(num(pricing.vatNOK)) : null;
  const economicConfidence =
    pricing.economicConfidence != null &&
    Number.isFinite(Number(pricing.economicConfidence))
      ? Math.round(Number(pricing.economicConfidence))
      : null;
  const economicObj =
    pricing.economic && typeof pricing.economic === "object"
      ? (pricing.economic as Record<string, unknown>)
      : null;
  const economicChecks = Array.isArray(economicObj?.checkLabels)
    ? (economicObj!.checkLabels as Array<{ ok?: boolean; label?: string }>)
        .filter((r) => r && typeof r.label === "string")
        .map((r) => ({ ok: r.ok !== false, label: String(r.label) }))
        .slice(0, 6)
    : [];
  const economicFlags = Array.isArray(economicObj?.flagLabels)
    ? (economicObj!.flagLabels as unknown[]).map(String).slice(0, 4)
    : [];
  const fxRate =
    pricing.fxRate != null && Number.isFinite(Number(pricing.fxRate))
      ? Number(pricing.fxRate)
      : null;
  const fxFetchedAt =
    typeof pricing.fxFetchedAt === "string" ? pricing.fxFetchedAt : null;

  // Prefer NOK purchase cost from Economic Validation — never show raw USD as kr
  const displayCostNOK =
    costNOK != null
      ? costNOK
      : landedCostNOK != null && shippingNOK != null
        ? Math.max(0, landedCostNOK - shippingNOK - (feesNOK || 0) - (vatNOK || 0))
        : null;

  const priceReasonsRaw = Array.isArray(pricing.reasons)
    ? (pricing.reasons as Array<{ ok?: boolean; label?: string }>)
        .filter((r) => r && typeof r.label === "string")
        .map((r) => ({ ok: r.ok !== false, label: String(r.label) }))
        .slice(0, 6)
    : [];
  const priceConfidence =
    pricing.confidence != null && Number.isFinite(Number(pricing.confidence))
      ? Math.round(Number(pricing.confidence))
      : null;
  const priceBandLow =
    pricing.competitorBandLow != null
      ? Math.round(num(pricing.competitorBandLow))
      : null;
  const priceBandHigh =
    pricing.competitorBandHigh != null
      ? Math.round(num(pricing.competitorBandHigh))
      : null;

  const explained = buildExplainableMatch({
    title: (c.title || "").trim(),
    shopMatchPct: num(c.shopMatchPct),
    marginPct: marginRounded,
    deliveryHint,
    supplierPrice: costNOK,
    retailNOK:
      retailNOK != null && Number.isFinite(retailNOK)
        ? Math.round(retailNOK)
        : null,
    prefs: opts?.prefs || null,
    gapFamily: opts?.gapFamily || null,
  });

  // Sortimentscore — live from strategy when available, else from scan scores
  const storedAssort =
    scores.assortment && typeof scores.assortment === "object"
      ? (scores.assortment as Record<string, unknown>)
      : null;
  let assortmentScore: number | null = storedAssort
    ? Math.round(num(storedAssort.total, NaN))
    : null;
  let assortmentCoverageGap: number | null = storedAssort
    ? Math.round(num(storedAssort.coverageGap, NaN))
    : null;
  let assortmentFamilyId: string | null =
    storedAssort && typeof storedAssort.familyId === "string"
      ? storedAssort.familyId
      : null;
  let assortmentHave: number | null = storedAssort
    ? Math.round(num(storedAssort.have, NaN))
    : null;
  let assortmentTarget: number | null = storedAssort
    ? Math.round(num(storedAssort.target, NaN))
    : null;
  let assortmentWhy: string[] = [];

  if (opts?.assortment?.snapshot) {
    const live = scoreAssortmentFit({
      title: (c.title || "").trim(),
      categoryHint:
        typeof snap.categoryHint === "string"
          ? snap.categoryHint
          : typeof snap.category === "string"
            ? snap.category
            : cat.taxonomyPath,
      snapshot: opts.assortment.snapshot,
      targets: opts.assortment.targets,
      bounds: opts.assortment.bounds,
      shopMatchPct: num(c.shopMatchPct),
    });
    assortmentScore = live.total;
    assortmentCoverageGap = live.coverageGap;
    assortmentFamilyId = live.familyId;
    assortmentHave = live.have;
    assortmentTarget = live.target;
    assortmentWhy = live.why.slice(0, 4);
  } else if (storedAssort) {
    assortmentWhy = asStringArray(c.shopMatchWhy)
      .filter((w) => String(w).startsWith("Sortiment:"))
      .map((w) => String(w).replace(/^Sortiment:\s*/, ""))
      .slice(0, 4);
  }

  // Produktfokus
  const storedFocus =
    scores.productFocus && typeof scores.productFocus === "object"
      ? (scores.productFocus as Record<string, unknown>)
      : null;
  let productFocusScore: number | null = storedFocus
    ? Math.round(num(storedFocus.score, NaN))
    : null;
  let productFocusStars: number | null = storedFocus
    ? Math.round(num(storedFocus.stars, NaN))
    : null;
  let productFocusFamilyId: string | null =
    storedFocus && typeof storedFocus.familyId === "string"
      ? storedFocus.familyId
      : assortmentFamilyId;
  let productFocusWhy: string[] = [];
  let productFocusBadges: Array<{ group: string; stars: number }> = [];
  let productFocusLabel: string | null = null;

  if (opts?.productFocus?.starsByFamily) {
    const fam =
      matchFamilyWithCustoms(
        (c.title || "").trim(),
        typeof snap.categoryHint === "string"
          ? snap.categoryHint
          : typeof snap.category === "string"
            ? snap.category
            : null,
        opts.productFocus.customFamilies || []
      ) || productFocusFamilyId;
    productFocusFamilyId = fam;
    const stars = clampStarsLocal(
      fam ? opts.productFocus.starsByFamily[fam] ?? 0 : 0
    );
    const focus = scoreProductFocus({
      familyId: fam,
      stars,
      shopMatchPct: num(c.shopMatchPct),
      tier: fam
        ? familyTier(fam, opts.productFocus.customFamilies || [])
        : "core",
    });
    productFocusScore = focus.score;
    productFocusStars = focus.stars;
    productFocusWhy = focus.why;
    productFocusLabel = fam ? familyLabel(fam) : null;
    productFocusBadges = focusGroupBadges(
      fam,
      opts.productFocus.starsByFamily,
      opts.productFocus.customFamilies || []
    );
  } else if (storedFocus) {
    productFocusWhy = Array.isArray(storedFocus.why)
      ? storedFocus.why.map(String).slice(0, 3)
      : asStringArray(c.shopMatchWhy)
          .filter((w) => String(w).startsWith("Produktfokus"))
          .slice(0, 3);
    if (productFocusFamilyId) {
      productFocusLabel = familyLabel(productFocusFamilyId);
    }
    if (productFocusStars && productFocusStars > 0 && productFocusFamilyId) {
      productFocusBadges = focusGroupBadges(
        productFocusFamilyId,
        { [productFocusFamilyId]: productFocusStars }
      );
    }
  }

  const assortmentBreakdown: Array<{ component: string; points: number }> = [];
  if (assortmentScore != null && Number.isFinite(assortmentScore)) {
    assortmentBreakdown.push({
      component: "Sortimentscore",
      points: assortmentScore,
    });
  }
  if (assortmentCoverageGap != null && Number.isFinite(assortmentCoverageGap)) {
    const famLab = assortmentFamilyId
      ? familyLabel(assortmentFamilyId)
      : "typen";
    const haveLab =
      assortmentHave != null && assortmentTarget != null
        ? ` (${assortmentHave}/${assortmentTarget})`
        : "";
    assortmentBreakdown.push({
      component:
        assortmentCoverageGap >= 0
          ? `Mangler ${famLab}${haveLab}`
          : `For mange ${famLab}${haveLab}`,
      points: assortmentCoverageGap,
    });
  }

  if (productFocusScore != null && productFocusScore > 0) {
    assortmentBreakdown.push({
      component: productFocusLabel
        ? `Produktfokus: ${productFocusLabel}`
        : "Produktfokus",
      points: productFocusScore,
    });
  }

  // Prefer explainable bullets as primary why (still keep scan why as fallback)
  const explainWhy = explained.signals
    .filter((s) => s.polarity !== "neutral")
    .slice(0, 4)
    .map((s) => `${s.polarity === "plus" ? "+" : "−"} ${s.label}`);
  const whyFinal = explainWhy.length
    ? explainWhy
    : why.length
      ? why
      : ["Passerte Digital Buyer-filter"];

  const whyFits =
    whyFinal[0] ||
    `Foreslått: ${cat.taxonomyPath} · Butikkmatch ${explained.pct}%`;

  const whyChosen =
    whyFinal[1] ||
    explained.summary.slice(0, 120) ||
    `Score ${Math.round(num(c.overallScore))} · margin ${
      marginRounded != null ? `${marginRounded}%` : "ukjent"
    }`;

  const shortReason = (whyFinal[0] || whyFits).slice(0, 90);

  const matchRounded = explained.pct;
  const confRounded = Math.max(0, Math.min(100, confidence));
  const scoreRounded = Math.round(num(c.overallScore));

  const inStock =
    snap.inStock === true ||
    snap.available === true ||
    (typeof snap.stock === "number" && snap.stock > 0) ||
    (typeof snap.inventory === "number" && snap.inventory > 0);

  const isPremium =
    matchRounded >= 85 &&
    confRounded >= 80 &&
    (marginRounded == null || marginRounded >= 35) &&
    scoreRounded >= 70;

  const similarInCatalog = countSimilarTitles(
    (c.title || "").trim(),
    (opts?.catalogTitles || []).filter((t) => t !== (c.title || "").trim())
  );
  const brain = computeMerchBrain({
    title: (c.title || "").trim(),
    categoryHint:
      typeof snap.categoryHint === "string"
        ? snap.categoryHint
        : typeof snap.category === "string"
          ? snap.category
          : null,
    shopMatchPct: num(c.shopMatchPct),
    overallScore: num(c.overallScore),
    assortmentTotal: assortmentScore,
    productFocusScore,
    marginPct: marginRounded,
    profitNOK:
      pricing.marginNOK != null
        ? num(pricing.marginNOK)
        : retailNOK != null && landedCostNOK != null
          ? Number(retailNOK) - Number(landedCostNOK)
          : null,
    landedCostNOK,
    retailNOK:
      retailNOK != null && Number.isFinite(retailNOK) ? Number(retailNOK) : null,
    deliveryHint,
    stock: snap.stock != null ? num(snap.stock) : null,
    listedCount: snap.listedCount != null ? num(snap.listedCount) : null,
    rating: snap.rating != null ? num(snap.rating) : null,
    similarInCatalog,
    economicConfidence,
  });

  // Additive AI Store Memory — capped ±3, never rewrites Merch Brain pillars
  let memoryNudge: number | null = null;
  let memoryScore: number | null = null;
  let memoryWhy: string[] = [];
  let dnaNudge: number | null = null;
  let dnaScore: number | null = null;
  let dnaWhy: string[] = [];
  let feedbackNudge: number | null = null;
  let feedbackScore: number | null = null;
  let feedbackWhy: string[] = [];
  let butikkscore = brain.butikkscore;
  const butikkBreakdown = [...brain.breakdown];
  if (opts?.aiMemory) {
    const mem = scoreAiMemory(opts.aiMemory, {
      title: (c.title || "").trim(),
      supplier: c.supplier,
      fingerprint: c.fingerprint,
      categoryHint:
        typeof snap.categoryHint === "string"
          ? snap.categoryHint
          : typeof snap.category === "string"
            ? snap.category
            : null,
    });
    const applied = applyAiMemoryNudge(butikkscore, mem);
    butikkscore = applied.butikkscore;
    memoryNudge = applied.memoryNudge;
    memoryScore = applied.memoryScore;
    memoryWhy = applied.memoryWhy;
    if (applied.memoryNudge !== 0 || applied.memoryWhy.length > 0) {
      butikkBreakdown.push({
        id: "memory_nudge" as BrainBreakdownRow["id"],
        label: "AI Memory",
        points: applied.memoryNudge,
        max: 3,
        ok: applied.memoryNudge >= 0,
        detail: applied.memoryWhy[0],
      });
    }
  }
  if (opts?.storeDna) {
    const dna = scoreStoreDna(opts.storeDna, {
      title: (c.title || "").trim(),
      categoryHint:
        typeof snap.categoryHint === "string"
          ? snap.categoryHint
          : typeof snap.category === "string"
            ? snap.category
            : null,
      priceNOK:
        retailNOK != null && Number.isFinite(retailNOK)
          ? Number(retailNOK)
          : null,
    });
    const applied = applyStoreDnaNudge(butikkscore, dna);
    butikkscore = applied.butikkscore;
    dnaNudge = applied.dnaNudge;
    dnaScore = applied.dnaScore;
    dnaWhy = applied.dnaWhy;
    if (applied.dnaNudge !== 0 || applied.dnaWhy.length > 0) {
      butikkBreakdown.push({
        id: "dna_nudge" as BrainBreakdownRow["id"],
        label: "Store DNA",
        points: applied.dnaNudge,
        max: 2,
        ok: applied.dnaNudge >= 0,
        detail: applied.dnaWhy[0],
      });
    }
  }
  if (opts?.aiFeedback) {
    const fb = scoreAiFeedback(opts.aiFeedback, {
      title: (c.title || "").trim(),
      supplier: c.supplier,
      categoryHint:
        typeof snap.categoryHint === "string"
          ? snap.categoryHint
          : typeof snap.category === "string"
            ? snap.category
            : null,
    });
    const applied = applyAiFeedbackNudge(butikkscore, fb);
    butikkscore = applied.butikkscore;
    feedbackNudge = applied.feedbackNudge;
    feedbackScore = applied.feedbackScore;
    feedbackWhy = applied.feedbackWhy;
    if (applied.feedbackNudge !== 0 || applied.feedbackWhy.length > 0) {
      butikkBreakdown.push({
        id: "feedback_nudge" as BrainBreakdownRow["id"],
        label: "Feedback",
        points: applied.feedbackNudge,
        max: 2,
        ok: applied.feedbackNudge >= 0,
        detail: applied.feedbackWhy[0],
      });
    }
  }

  return {
    id: c.id,
    title: (c.title || "Uten tittel").trim() || "Uten tittel",
    imageUrl: media.images[0] || c.imageUrl || null,
    images: media.images,
    videos: media.videos,
    supplier: String(c.supplier || "ukjent"),
    shopMatchPct: matchRounded,
    confidence: confRounded,
    overallScore: scoreRounded,
    marginPct: marginRounded,
    retailNOK: retailNOK != null && Number.isFinite(retailNOK) ? Math.round(retailNOK) : null,
    deliveryHint,
    qualityScore: Math.round(qualityScore),
    why: whyFinal,
    whyChosen,
    whyFits,
    risks: [
      ...(!cat.fitsElectroHype ? ["Passer ikke ElectroHype"] : []),
      ...risks,
    ].slice(0, 4),
    recommendation:
      brain.recommendation === "Publiser"
        ? "Velg"
        : brain.recommendation === "Vurder"
          ? "Vurder"
          : recommendation,
    canImport: Boolean(c.merchandiserRecId),
    merchandiserRecId: c.merchandiserRecId || null,
    categoryId: cat.id,
    categoryLabel: cat.taxonomyPath,
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    shortReason,
    variantCount: num(snap.variantCount, 0),
    isPremium,
    inStock,
    rank: c.rank != null && Number.isFinite(Number(c.rank)) ? Number(c.rank) : null,
    taxonomyPath: cat.taxonomyPath,
    subcategory: cat.subcategory,
    explainPct: explained.pct,
    explainSignals: explained.signals,
    explainSummary: explained.summary,
    storeRelevance: explained.storeRelevance,
    explainCapped: explained.capped,
    explainBreakdown: [
      ...explained.breakdown,
      ...assortmentBreakdown,
    ].slice(0, 12),
    fitsElectroHype: cat.fitsElectroHype,
    costNOK: displayCostNOK,
    landedCostNOK,
    shippingNOK,
    feesNOK,
    vatNOK,
    economicConfidence,
    economicChecks,
    economicFlags,
    fxRate,
    fxFetchedAt,
    assortmentScore:
      assortmentScore != null && Number.isFinite(assortmentScore)
        ? assortmentScore
        : null,
    assortmentCoverageGap:
      assortmentCoverageGap != null && Number.isFinite(assortmentCoverageGap)
        ? assortmentCoverageGap
        : null,
    assortmentFamilyId,
    assortmentHave:
      assortmentHave != null && Number.isFinite(assortmentHave)
        ? assortmentHave
        : null,
    assortmentTarget:
      assortmentTarget != null && Number.isFinite(assortmentTarget)
        ? assortmentTarget
        : null,
    assortmentWhy,
    productFocusScore:
      productFocusScore != null && Number.isFinite(productFocusScore)
        ? productFocusScore
        : null,
    productFocusStars:
      productFocusStars != null && Number.isFinite(productFocusStars)
        ? productFocusStars
        : null,
    productFocusFamilyId,
    productFocusLabel,
    productFocusWhy,
    productFocusBadges,
    whyFoundStars: buildStoreBuilderWhyFound({
      shopMatchPct: matchRounded,
      assortmentScore,
      assortmentHave,
      assortmentTarget,
      productFocusStars,
      marginPct: marginRounded,
      deliveryHint,
      qualityScore,
      overallScore: scoreRounded,
    }),
    priceConfidence,
    priceReasons:
      priceReasonsRaw.length > 0
        ? priceReasonsRaw
        : synthesizePriceReasons({
            retailNOK:
              retailNOK != null && Number.isFinite(retailNOK)
                ? Math.round(retailNOK)
                : null,
            marginPct: marginRounded,
            isPremium,
            bandLow: priceBandLow,
            bandHigh: priceBandHigh,
            rationale:
              typeof pricing.rationale === "string" ? pricing.rationale : null,
          }),
    priceBandLow,
    priceBandHigh,
    butikkscore,
    butikkRecommendation: brain.recommendation,
    butikkBreakdown,
    profitNOK: brain.profitNOK,
    supplierRiskPct: brain.supplierRiskPct,
    memoryNudge,
    memoryScore,
    memoryWhy,
    dnaNudge,
    dnaScore,
    dnaWhy,
    feedbackNudge,
    feedbackScore,
    feedbackWhy,
  };
}

function synthesizePriceReasons(input: {
  retailNOK: number | null;
  marginPct: number | null;
  isPremium: boolean;
  bandLow: number | null;
  bandHigh: number | null;
  rationale: string | null;
}): Array<{ ok: boolean; label: string }> {
  const out: Array<{ ok: boolean; label: string }> = [];
  if (input.bandLow != null && input.bandHigh != null) {
    out.push({
      ok: true,
      label: `Markedsbånd: ${input.bandLow}–${input.bandHigh} kr`,
    });
  } else if (input.retailNOK != null) {
    out.push({
      ok: true,
      label: `Pris: ${input.retailNOK} kr (norsk prisstige)`,
    });
  }
  if (input.marginPct != null) {
    out.push({
      ok: input.marginPct >= 35,
      label: `Margin: ${input.marginPct}%`,
    });
  }
  out.push({ ok: true, label: "Psykologisk pris" });
  if (input.isPremium) out.push({ ok: true, label: "Premium-signal" });
  if (input.rationale && out.length < 2) {
    out.push({ ok: true, label: input.rationale.slice(0, 80) });
  }
  return out.slice(0, 5);
}

/** @deprecated alias */
export function groupBuyerCandidatesByCategory(
  raw: DeskBuyerCandidate[] | null | undefined
): DeskBuyerCategoryGroup[] {
  return buildBuyerBoard(raw).categoryGroups;
}

function buildPackages(cards: DeskBuyerCandidateCard[]): BuyerProductPackage[] {
  const packages: BuyerProductPackage[] = [];

  for (const mission of CATEGORY_MISSIONS.slice(0, 5)) {
    const slots = mission.subcategories.map((label) => {
      const re = new RegExp(
        label
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .split(/\s+/)
          .slice(0, 2)
          .join("|"),
        "i"
      );
      const card =
        cards
          .filter((c) => c.categoryId === mission.id || re.test(c.title))
          .sort((a, b) => sortKey(b) - sortKey(a))[0] || null;
      return { label, filled: Boolean(card), card };
    });

    const filled = slots.filter((s) => s.filled && s.card);
    if (filled.length < 3) continue;

    const uniqueCards = [
      ...new Map(filled.map((s) => [s.card!.id, s.card!])).values(),
    ];
    const avgMatch = Math.round(
      uniqueCards.reduce((s, c) => s + c.shopMatchPct, 0) / uniqueCards.length
    );
    const margins = uniqueCards
      .map((c) => c.marginPct)
      .filter((m): m is number => m != null);
    const avgMargin =
      margins.length > 0
        ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length)
        : null;

    packages.push({
      id: `pkg-${mission.id}`,
      emoji: mission.emoji,
      title: `${mission.label.replace("Bygg ", "")} Setup`,
      subtitle: `Komplett ${mission.label.replace("Bygg ", "").toLowerCase()}-pakke`,
      productCount: uniqueCards.length,
      avgMatch,
      avgMargin,
      coveragePct: Math.round((filled.length / slots.length) * 100),
      slots,
      importIds: uniqueCards.filter((c) => c.canImport).map((c) => c.id),
    });
  }

  return packages.sort((a, b) => b.coveragePct - a.coveragePct).slice(0, 4);
}

function buildSmartGroups(
  cards: DeskBuyerCandidateCard[],
  reviewedIds: Set<string>
): BuyerSmartGroup[] {
  const groups: BuyerSmartGroup[] = [];

  const push = (
    id: string,
    label: string,
    emoji: string,
    list: DeskBuyerCandidateCard[],
    minCount = 1
  ) => {
    if (list.length < minCount) return;
    groups.push({
      id,
      label,
      emoji,
      count: list.length,
      candidates: list.slice(0, 40),
    });
  };

  const unreviewed = cards.filter((c) => !reviewedIds.has(c.id));
  push("new", "Nye", "✨", unreviewed, 1);
  push(
    "perfect-match",
    "Best Match",
    "🎯",
    cards.filter((c) => c.shopMatchPct >= 95),
    1
  );
  push(
    "fantastic",
    "Fantastiske kjøp",
    "💎",
    cards.filter(
      (c) =>
        c.shopMatchPct >= 90 &&
        (c.marginPct ?? 0) >= 55 &&
        c.confidence >= 75 &&
        c.canImport
    ),
    1
  );
  push(
    "premium",
    "Premium",
    "🟢",
    cards.filter(
      (c) =>
        c.shopMatchPct >= 85 &&
        c.confidence >= 80 &&
        (c.marginPct == null || c.marginPct >= 35) &&
        c.overallScore >= 70
    ),
    1
  );
  push(
    "best-margin",
    "Høy margin",
    "📈",
    [...cards]
      .filter((c) => c.marginPct != null && c.marginPct >= 50)
      .sort((a, b) => (b.marginPct || 0) - (a.marginPct || 0)),
    1
  );
  push(
    "top-score",
    "Høyeste AI-score",
    "🏆",
    [...cards].sort((a, b) => b.shopMatchPct - a.shopMatchPct || b.overallScore - a.overallScore),
    3
  );

  for (const def of CATEGORY_DEFS.filter((d) =>
    ["gaming", "mobil", "kontor", "audio", "hjem"].includes(d.id)
  )) {
    push(
      def.id,
      def.label,
      def.emoji,
      cards.filter((c) => c.categoryId === def.id),
      2
    );
  }

  push(
    "better",
    "Bedre enn eksisterende",
    "⬆",
    cards.filter((c) => c.shopMatchPct >= 85 && c.overallScore >= 75),
    1
  );
  push(
    "needs-review",
    "Trenger review",
    "👀",
    cards.filter(
      (c) => c.confidence < 70 || c.risks.length > 0 || (c.recommendation !== "Importer." && c.recommendation !== "Velg")
    ),
    1
  );
  push(
    "low-score",
    "Lav score",
    "⬇",
    cards.filter((c) => c.shopMatchPct < 65 || c.overallScore < 55),
    1
  );

  return groups;
}

/**
 * Full board model for Digital Buyer UX V3.
 * `reviewedIds` = ids Robin already looked at (local or server).
 * `sinceIso` = show as "Nye forslag" if created after this (or unreviewed).
 */
export function buildBuyerBoard(
  raw: DeskBuyerCandidate[] | null | undefined,
  opts?: {
    reviewedIds?: string[] | Set<string>;
    sinceIso?: string | null;
    prefs?: PreferenceContext | null;
    gapFamily?: string | null;
  }
): BuyerBoardModel {
  const reviewedIds = new Set(
    opts?.reviewedIds instanceof Set
      ? [...opts.reviewedIds]
      : Array.isArray(opts?.reviewedIds)
        ? opts.reviewedIds
        : []
  );
  const sinceMs = opts?.sinceIso ? Date.parse(opts.sinceIso) : NaN;
  const cardOpts: BuyerCardOptions = {
    prefs: opts?.prefs || null,
    gapFamily: opts?.gapFamily || null,
  };

  const cards: DeskBuyerCandidateCard[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item?.id) continue;
    try {
      cards.push(toBuyerCard(item, cardOpts));
    } catch {
      /* skip */
    }
  }
  cards.sort((a, b) => sortKey(b) - sortKey(a));

  const newSuggestions = cards.filter((c) => {
    if (reviewedIds.has(c.id)) return false;
    if (Number.isFinite(sinceMs) && c.createdAt) {
      return Date.parse(c.createdAt) >= sinceMs;
    }
    return true; // unreviewed = new until marked
  });

  const newIds = new Set(newSuggestions.map((c) => c.id));
  const rest = cards.filter((c) => !newIds.has(c.id) || reviewedIds.has(c.id));

  const byCat = new Map<string, DeskBuyerCandidateCard[]>();
  for (const c of cards) {
    const list = byCat.get(c.categoryId) || [];
    list.push(c);
    byCat.set(c.categoryId, list);
  }

  const categoryGroups: DeskBuyerCategoryGroup[] = [...byCat.entries()]
    .map(([id, list]) => {
      const def = CATEGORY_DEFS.find((d) => d.id === id);
      const sorted = [...list].sort((a, b) => sortKey(b) - sortKey(a));
      return {
        id,
        label: def?.label || sorted[0]?.categoryLabel || id,
        emoji: def?.emoji || "📦",
        count: sorted.length,
        bestScore: sorted[0]?.shopMatchPct ?? 0,
        candidates: sorted,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    cards,
    newSuggestions,
    rest,
    smartGroups: buildSmartGroups(cards, reviewedIds),
    packages: buildPackages(cards),
    categoryGroups,
  };
}
