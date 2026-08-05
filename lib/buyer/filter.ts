/**
 * Digital Buyer product filter — reject before import board.
 * Search-stage soft risks (missing video/specs) are ignored until deep detail.
 */

import type { MerchandiserAnalysis } from "@/lib/suppliers/merchandiser/types";
import type { BuyerFilterResult, BuyerFilterThresholds } from "@/lib/buyer/types";
import { DEFAULT_BUYER_FILTER } from "@/lib/buyer/types";

const SEARCH_SOFT_RISKS = new Set([
  "too_few_images",
  "missing_specs",
  "unclear_description",
  "missing_video",
]);

export function filterBuyerCandidate(input: {
  analysis: MerchandiserAnalysis;
  shopMatchPct: number;
  imageCount?: number;
  stock?: number | null;
  /** search = light gate; detail = strict Quality Gate style */
  stage?: "search" | "detail";
  thresholds?: Partial<BuyerFilterThresholds>;
}): BuyerFilterResult {
  const t = { ...DEFAULT_BUYER_FILTER, ...input.thresholds };
  const stage = input.stage || "search";
  const reasons: string[] = [];
  const a = input.analysis;
  const risks = (a.risks || []).filter((r) =>
    stage === "search" ? !SEARCH_SOFT_RISKS.has(r) : true
  );

  if (input.shopMatchPct < t.minShopMatchPct) {
    reasons.push(`Butikk-match ${input.shopMatchPct}% < ${t.minShopMatchPct}%`);
  }
  if (a.scores.overall < t.minOverallScore) {
    reasons.push(`Score ${a.scores.overall} < ${t.minOverallScore}`);
  }

  if (stage === "detail") {
    if (
      risks.includes("too_few_images") ||
      (input.imageCount != null && input.imageCount < t.minImages) ||
      (a.scores.imageQuality < 25 && (input.imageCount || 0) === 0)
    ) {
      reasons.push("Dårlige / for få bilder");
    }
    if (risks.includes("missing_specs") && a.scores.specificationQuality < 25) {
      reasons.push("Manglende spesifikasjoner");
    }
  } else if ((input.imageCount || 0) === 0 && !a.scores.imageQuality) {
    reasons.push("Mangler bilde");
  }

  // Stock: search listings often report 0/unknown — only hard-reject clear low positive stock
  if (
    t.rejectLowStock &&
    ((typeof input.stock === "number" && input.stock > 0 && input.stock < 3) ||
      (stage === "detail" &&
        (input.stock === 0 || risks.includes("low_stock"))))
  ) {
    reasons.push("Lav lagerstatus");
  }

  if (
    a.pricing.estimatedMarginPct < t.minMarginPct ||
    a.scores.marginPotential < 35
  ) {
    reasons.push(
      `For lav margin (est. ${Math.round(a.pricing.estimatedMarginPct)}%)`
    );
  }

  if (risks.includes("suspicious_product") || risks.includes("return_risk")) {
    reasons.push("Høy risiko / mistenkelig produkt");
  }
  if (risks.includes("zero_price")) {
    reasons.push("Ugyldig pris");
  }
  if (risks.length >= t.maxRiskFlags) {
    reasons.push(`For mange mangler (${risks.length} risikoflagg)`);
  }
  if (!a.market.fitsStore && input.shopMatchPct < 70) {
    reasons.push("Passer ikke butikkprofil");
  }

  return {
    pass: reasons.length === 0,
    reasons,
  };
}
