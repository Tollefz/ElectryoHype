/**
 * ElectroHypeX Lead Product Buyer policy.
 *
 * Helps the store owner make better import decisions without removing control.
 *
 * Decision levels:
 *   APPROVED  – score ≥ 8.5 and no absolute violations
 *   REVIEW    – score 7.0–8.4 (or soft concerns); owner may still import
 *   REJECTED  – score < 7.0 OR absolute store-rule violation
 */

/** Score threshold for automatic APPROVED. */
export const BUYER_APPROVED_SCORE = 8.5;

/** Score floor for REVIEW. Below this → REJECTED. */
export const BUYER_REVIEW_MIN_SCORE = 7.0;

/** @deprecated Use BUYER_APPROVED_SCORE. Kept for existing imports. */
export const BUYER_MIN_SCORE = BUYER_APPROVED_SCORE;

/** Soft warning margin % — under this is flagged, not auto-fail (see margin-policy). */
export const BUYER_MIN_GROSS_MARGIN_PCT = 35;

/** Preferred supplier cost band (NOK). */
export const BUYER_PREFERRED_COST_MIN = 20;
export const BUYER_PREFERRED_COST_MAX = 500;

/** Absolute max supplier cost unless product is exceptional (advisory above preferred). */
export const BUYER_ABSOLUTE_COST_MAX = 1500;

export type BuyerDecision = "approved" | "review" | "rejected";

/** Store focus – products should fit one of these themes. */
export const STORE_FOCUS = [
  "Mobile accessories",
  "Computer accessories",
  "Gaming",
  "Smart Home",
  "USB-C accessories",
  "Charging",
  "LED lighting",
  "Desk setup",
  "Home office",
  "Car electronics",
  "Electronics tools",
  "DIY electronics",
  "Small tech gadgets",
  "Organization",
  "Cables and adapters",
] as const;

/** Main store categories that match the electronics focus. */
export const FOCUS_CATEGORIES = [
  "Mobil & Tilbehør",
  "Data & IT",
  "Gaming",
  "TV, Lyd & Bilde",
  "Hjem & Fritid",
] as const;

/**
 * Absolute reject rules – these always REJECTED (owner cannot override via importer).
 * Clothing, adult, counterfeit/trademark, medicines, supplements, child safety.
 */
const ABSOLUTE_REJECT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern:
      /\b(klær|clothing|hoodie|hettegenser|t[- ]?shirt|tyskjorte|bukse|jeans|kjole|skirt|jakke|jacket|genser|sweater|sokker|socks|undertøy|underwear)\b/i,
    label: "Klær",
  },
  {
    pattern: /\b(adult|sex\b|erotisk|lingerie)\b/i,
    label: "Voksenprodukter",
  },
  {
    pattern: /\b(replica|1:1|aaa quality|kopi av|counterfeit|fake brand|knockoff)\b/i,
    label: "Falske/kopiprodukter",
  },
  {
    pattern: /\b(medisin|medicine|prescription|legemiddel)\b/i,
    label: "Medisin",
  },
  {
    pattern: /\b(supplement|kosttilskudd|protein powder|dietary supplement)\b/i,
    label: "Kosttilskudd",
  },
  {
    pattern:
      /\b(barnevogn|barnesete|child safety|bilbarnestol|car seat|pacifier|smokk|baby monitor safety)\b/i,
    label: "Sikkerhetskritiske barneprodukter",
  },
  // Trademark / branded IP risk (unofficial merch)
  {
    pattern:
      /\b(disney|marvel|pokemon|pokémon|hello kitty|lego|nintendo|star wars|harry potter|barbie|nike|adidas|gucci|louis vuitton|chanel|rolex|supreme)\b/i,
    label: "Varemerke/opphavsrett",
  },
];

/**
 * Soft off-assortment signals – push to REVIEW, never hard-reject alone.
 */
const REVIEW_CATEGORY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(sko|shoes|sneakers|støvler|boots|sandals)\b/i, label: "Sko" },
  {
    pattern: /\b(smykke|jewelry|jewellery|necklace|bracelet|ørering|earring|anheng|armbånd|wedding ring|forlovelsesring)\b/i,
    label: "Smykker",
  },
  { pattern: /\b(klokke|wristwatch|smartklokke|smartwatch)\b/i, label: "Klokker" },
  {
    pattern: /\b(kosmetikk|cosmetics|makeup|lipstick|mascara|serum|ansiktskrem|skincare)\b/i,
    label: "Kosmetikk",
  },
  { pattern: /\b(godteri|candy|snack food|coffee beans)\b/i, label: "Mat" },
  { pattern: /\b(leketøy|toys?\b|dukke|doll|bamse|plush)\b/i, label: "Leker" },
  {
    pattern: /\b(julepynt|christmas ornament|halloween|påskeegg|party decoration|ballong|balloon)\b/i,
    label: "Sesongpynt",
  },
  {
    pattern: /\b(dekorasjon|decorative wall|poster frame only|vase\b|figurine)\b/i,
    label: "Dekor uten praktisk verdi",
  },
];

/** Positive signals that this is on-brand electronics / tech accessories. */
const FOCUS_PATTERNS: RegExp[] = [
  /\b(usb[- ]?c|usb[- ]?a|hdmi|displayport|thunderbolt|adapter|kabel|cable|lader|charger|powerbank|power bank)\b/i,
  /\b(telefon|phone|iphone|samsung|mobil|screen protector|skjermbeskytter|deksel|case|holder)\b/i,
  /\b(gaming|rgb|mus|mouse|tastatur|keyboard|headset|mikrofon|microphone)\b/i,
  /\b(smart home|wifi|wi[- ]?fi|zigbee|sensor|kamera|camera|doorbell)\b/i,
  /\b(led|lampe|lamp|belysning|lighting|desk|skrivebord|monitor|hub)\b/i,
  /\b(bil|car|dashcam|obd|12v)\b/i,
  /\b(lodde|soldering|multimeter|elektronikk|diy|verktøy|tool)\b/i,
  /\b(organizer|kabelorganiser|cable management|opbevaring|storage)\b/i,
];

export interface BuyerFitInput {
  name: string;
  originalTitle?: string;
  description?: string;
  category: string;
  subcategory?: string | null;
  costNOK: number;
  suggestedPrice: number;
  overallScore: number;
  imagesCount: number;
  variantsCount: number;
  specsCount: number;
}

export interface BuyerFitIssue {
  code: string;
  /** reject = absolute hard stop; review = owner should decide; info = advisory */
  severity: "reject" | "review" | "info";
  message: string;
}

export interface BuyerFitResult {
  decision: BuyerDecision;
  /** True when decision is APPROVED. */
  approved: boolean;
  /** True when the owner may still choose to import (APPROVED or REVIEW). */
  canImport: boolean;
  /** True when decision is REJECTED. */
  rejected: boolean;
  issues: BuyerFitIssue[];
  grossMarginPct: number;
  categoryFitScore: number;
}

function matchFirstLabel(
  text: string,
  patterns: Array<{ pattern: RegExp; label: string }>
): string | null {
  for (const entry of patterns) {
    if (entry.pattern.test(text)) return entry.label;
  }
  return null;
}

/** Absolute store-rule violation (always REJECTED). */
export function detectAbsoluteReject(text: string): string | null {
  return matchFirstLabel(text.trim(), ABSOLUTE_REJECT_PATTERNS);
}

/** Soft off-assortment signal (REVIEW, not hard reject). */
export function detectReviewCategory(text: string): string | null {
  return matchFirstLabel(text.trim(), REVIEW_CATEGORY_PATTERNS);
}

/**
 * Any off-assortment hit (absolute or soft). Used by category-fit scoring.
 * Prefer detectAbsoluteReject / detectReviewCategory for decision logic.
 */
export function detectBannedCategory(text: string): string | null {
  return detectAbsoluteReject(text) ?? detectReviewCategory(text);
}

export function scoreCategoryFit(input: {
  category: string;
  subcategory?: string | null;
  text: string;
}): number {
  if (detectAbsoluteReject(input.text)) return 0;
  if (detectReviewCategory(input.text)) return 2;

  let score = 5;
  if ((FOCUS_CATEGORIES as readonly string[]).includes(input.category)) {
    score += 2;
  } else {
    score -= 1.5;
  }

  if (input.subcategory && input.subcategory.trim().length > 0) {
    score += 0.5;
  }

  const focusHits = FOCUS_PATTERNS.filter((pattern) => pattern.test(input.text)).length;
  if (focusHits >= 2) score += 2.5;
  else if (focusHits === 1) score += 1.5;
  else score -= 1;

  return Math.min(10, Math.max(0, score));
}

export function decisionFromScore(overallScore: number): BuyerDecision {
  if (overallScore >= BUYER_APPROVED_SCORE) return "approved";
  if (overallScore >= BUYER_REVIEW_MIN_SCORE) return "review";
  return "rejected";
}

export function evaluateBuyerFit(input: BuyerFitInput): BuyerFitResult {
  const issues: BuyerFitIssue[] = [];
  const text = [input.name, input.originalTitle ?? "", input.description ?? ""]
    .join(" ")
    .replace(/<[^>]+>/g, " ");

  const profit = input.suggestedPrice - input.costNOK;
  const grossMarginPct =
    input.suggestedPrice > 0 ? (profit / input.suggestedPrice) * 100 : 0;

  const categoryFitScore = scoreCategoryFit({
    category: input.category,
    subcategory: input.subcategory,
    text,
  });

  let forcedReject = false;
  let forcedReview = false;

  const absolute = detectAbsoluteReject(text);
  if (absolute) {
    forcedReject = true;
    issues.push({
      code: "absolute-reject",
      severity: "reject",
      message: `Avvist: ${absolute}. Absolute butikkregler tillater ikke denne produkttypen.`,
    });
  }

  const softCategory = !absolute ? detectReviewCategory(text) : null;
  if (softCategory) {
    forcedReview = true;
    issues.push({
      code: "off-assortment-review",
      severity: "review",
      message: `Utenfor kjerneassortiment (${softCategory}). Kan vurderes manuelt – ikke automatisk godkjent.`,
    });
  }

  if (categoryFitScore < 5 && !absolute && !softCategory) {
    forcedReview = true;
    issues.push({
      code: "weak-category-fit",
      severity: "review",
      message:
        "Svak match mot ElectroHypeX-profilen (mobil, data, gaming, smart home, kabler, lading, LED, desk setup). Vurder manuelt.",
    });
  }

  if (input.costNOK > 0 && input.costNOK < BUYER_PREFERRED_COST_MIN) {
    issues.push({
      code: "cost-too-low",
      severity: "info",
      message: `Kost under ${BUYER_PREFERRED_COST_MIN} kr – kun importer hvis produktet er genuint nyttig.`,
    });
  }

  if (input.costNOK > BUYER_ABSOLUTE_COST_MAX) {
    forcedReview = true;
    issues.push({
      code: "cost-too-high",
      severity: "review",
      message: `Kost ${Math.round(input.costNOK)} kr over anbefalt tak (${BUYER_ABSOLUTE_COST_MAX} kr). Krever manuell vurdering.`,
    });
  } else if (input.costNOK > BUYER_PREFERRED_COST_MAX) {
    issues.push({
      code: "cost-elevated",
      severity: "info",
      message: `Kost ${Math.round(input.costNOK)} kr er over foretrukket bånd (${BUYER_PREFERRED_COST_MIN}–${BUYER_PREFERRED_COST_MAX} kr).`,
    });
  }

  if (grossMarginPct < BUYER_MIN_GROSS_MARGIN_PCT) {
    forcedReview = true;
    issues.push({
      code: "weak-margin",
      severity: "review",
      message: `Bruttomargin ${Math.round(grossMarginPct)} % er under bærekraftig gulv (${BUYER_MIN_GROSS_MARGIN_PCT} %). Ikke maks-påslag — sjekk kost/frakt.`,
    });
  }

  if (input.overallScore < BUYER_REVIEW_MIN_SCORE) {
    forcedReject = true;
    issues.push({
      code: "score-rejected",
      severity: "reject",
      message: `Produktscore ${input.overallScore.toFixed(1)}/10 er under ${BUYER_REVIEW_MIN_SCORE} – avvist.`,
    });
  } else if (input.overallScore < BUYER_APPROVED_SCORE) {
    forcedReview = true;
    issues.push({
      code: "score-review",
      severity: "review",
      message: `Produktscore ${input.overallScore.toFixed(1)}/10 er i REVIEW-sonen (${BUYER_REVIEW_MIN_SCORE}–${BUYER_APPROVED_SCORE - 0.1}). Eier kan bestemme.`,
    });
  }

  if (input.imagesCount < 2) {
    issues.push({
      code: "weak-images",
      severity: "info",
      message: "Få bilder – premium butikk krever profesjonelle gallerier.",
    });
  }

  if (input.specsCount < 2) {
    issues.push({
      code: "weak-specs",
      severity: "info",
      message: "For få spesifikasjoner til en seriøs elektronikkbutikk.",
    });
  }

  if (input.variantsCount > 10) {
    issues.push({
      code: "oversaturated-variants",
      severity: "info",
      message: `${input.variantsCount} varianter – for mange for en ryddig butikkopplevelse.`,
    });
  }

  let decision: BuyerDecision = decisionFromScore(input.overallScore);
  if (forcedReject) {
    decision = "rejected";
  } else if (forcedReview && decision === "approved") {
    decision = "review";
  }

  return {
    decision,
    approved: decision === "approved",
    canImport: decision !== "rejected",
    rejected: decision === "rejected",
    issues,
    grossMarginPct,
    categoryFitScore,
  };
}

export function buyerDecisionLabel(decision: BuyerDecision): string {
  switch (decision) {
    case "approved":
      return "APPROVED";
    case "review":
      return "REVIEW";
    case "rejected":
      return "REJECTED";
  }
}
