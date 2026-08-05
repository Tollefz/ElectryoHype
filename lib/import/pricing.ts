/**
 * Catalog / import pricing policy — competitive Norwegian retail.
 *
 * Goals (in order):
 * 1. Correct supplier cost
 * 2. Target healthy målmargin by landed cost (not max multiplier)
 * 3. Believable prices customers will actually buy
 *
 * NOT a goal: maximize percentage margin or multiplier.
 */

import {
  marginTargetForLandedCost,
  retailFromTargetMargin,
  softMaxMultiplierForLanded,
  softMinMultiplierForLanded,
} from "@/lib/buyer/margin-policy";

export const USD_TO_NOK_RATE = 10.5;

export const COMPARE_AT_PRICE_MULTIPLIER = 1.18;

/** Modest inbound shipping add-on (NOK). Not used to inflate %-markup. */
export const INBOUND_SHIPPING_TIERS = [
  { maxCost: 80, shipping: 19 },
  { maxCost: 200, shipping: 29 },
  { maxCost: 500, shipping: 39 },
  { maxCost: Infinity, shipping: 49 },
] as const;

/**
 * Natural retail ladder — prices customers expect.
 */
export const NATURAL_PRICE_LADDER = [
  49, 59, 69, 79, 89, 99, 119, 129, 149, 169, 179, 198, 199, 229, 249, 279, 299,
  329, 349, 379, 399, 429, 449, 499, 549, 599, 649, 699, 749, 799, 849, 899, 949,
  999, 1099, 1199, 1299, 1499, 1699, 1999, 2499, 2999, 3499, 3999, 4499, 4999,
] as const;

/**
 * Soft absolute price caps by cost (guideline only — primary is målmargin).
 */
const ABSOLUTE_MAX_BY_COST: Array<{ maxCost: number; absoluteMaxPrice: number }> = [
  { maxCost: 40, absoluteMaxPrice: 199 },
  { maxCost: 80, absoluteMaxPrice: 299 },
  { maxCost: 150, absoluteMaxPrice: 499 },
  { maxCost: 300, absoluteMaxPrice: 799 },
  { maxCost: 600, absoluteMaxPrice: 1299 },
  { maxCost: Infinity, absoluteMaxPrice: 4999 },
];

export function convertPriceToNOK(amount: number, currency: string): number {
  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === "NOK" || normalizedCurrency === "KR") {
    return amount;
  }
  if (normalizedCurrency === "USD") {
    return amount * USD_TO_NOK_RATE;
  }
  return amount;
}

function absoluteMaxForCost(supplierCostNOK: number): number {
  const cost = Number.isFinite(supplierCostNOK) ? Math.max(0, supplierCostNOK) : 0;
  for (const band of ABSOLUTE_MAX_BY_COST) {
    if (cost < band.maxCost) return band.absoluteMaxPrice;
  }
  return 4999;
}

/**
 * @deprecated Prefer target-margin helpers — returns soft markup % from mid target.
 */
export function getDynamicMarkupPct(costNOK: number): number {
  const mult = getMarginMultiplier(costNOK);
  return (mult - 1) * 100;
}

/** Soft guideline multiplier ≈ retail/cost at mid målmargin (landed ≈ cost). */
export function getMarginMultiplier(costNOK: number): number {
  return getMarketTargetMultiplier(costNOK);
}

export function getMarketTargetMultiplier(costNOK: number): number {
  const cost = Number.isFinite(costNOK) ? Math.max(0, costNOK) : 0;
  const band = marginTargetForLandedCost(cost);
  const retail = retailFromTargetMargin(cost, band.mid);
  if (cost <= 0) return softMaxMultiplierForLanded(cost);
  return Math.round((retail / cost) * 100) / 100;
}

export function estimateInboundShippingNOK(
  supplierCostNOK: number,
  shippingEstimate?: string | null
): number {
  const text = (shippingEstimate || "").toLowerCase();
  if (
    /gratis|fri\s*frakt|free\s*shipping|free\s*delivery|inkl\.?\s*frakt|inkluder[te]?\s*frakt/.test(
      text
    )
  ) {
    return 0;
  }

  const cost = Number.isFinite(supplierCostNOK) ? Math.max(0, supplierCostNOK) : 0;
  for (const tier of INBOUND_SHIPPING_TIERS) {
    if (cost < tier.maxCost) return tier.shipping;
  }
  return 49;
}

export function calculateLandedCostNOK(
  supplierCostNOK: number,
  shippingEstimate?: string | null
): { landedCost: number; inboundShipping: number } {
  const inboundShipping = estimateInboundShippingNOK(supplierCostNOK, shippingEstimate);
  return {
    inboundShipping,
    landedCost: Math.max(0, supplierCostNOK) + inboundShipping,
  };
}

/**
 * Price from målmargin on landed cost. Soft multiplier caps only prevent absurd outliers.
 */
export function applyMarginPolicy(
  supplierCostNOK: number,
  profitMargin?: string | number | null,
  inboundShipping = 0
): { rawPrice: number; policy: string } {
  const cost = Math.max(0, supplierCostNOK);
  const landed = cost + Math.max(0, inboundShipping);
  const band = marginTargetForLandedCost(landed);

  if (typeof profitMargin === "number" && Number.isFinite(profitMargin) && profitMargin > 0) {
    const raw = retailFromTargetMargin(landed, profitMargin);
    return { rawPrice: raw, policy: `produktmargin ${profitMargin} % av landed` };
  }

  const value = (profitMargin ?? "").toString().trim();
  if (value.endsWith("%")) {
    const percent = Number.parseFloat(value.replace("%", ""));
    if (Number.isFinite(percent) && percent > 0) {
      return {
        rawPrice: retailFromTargetMargin(landed, percent),
        policy: `produktmargin ${percent} % av landed`,
      };
    }
  }

  if (value.startsWith("+")) {
    const add = Number.parseFloat(value.slice(1));
    if (Number.isFinite(add)) {
      return {
        rawPrice: landed + add,
        policy: `produktpåslag +${add} kr på landed`,
      };
    }
  }

  if (/x$/i.test(value)) {
    const mult = Number.parseFloat(value.replace(/x$/i, ""));
    if (Number.isFinite(mult) && mult > 0) {
      return {
        rawPrice: cost * mult + inboundShipping,
        policy: `produktmultiplikator ${mult}x (+innfrakt)`,
      };
    }
  }

  const rawPrice = retailFromTargetMargin(landed, band.mid);
  return {
    rawPrice,
    policy: `målmargin ${band.mid}% (${band.label}) · landed ${Math.round(landed)} kr`,
  };
}

/**
 * Soft clamp: keep prices competitive — never reward extreme markups.
 */
export function applyMarketSanityCheck(
  supplierCostNOK: number,
  proposedPrice: number
): { price: number; adjusted: boolean; reason: string } {
  const cost = Number.isFinite(supplierCostNOK) ? Math.max(0, supplierCostNOK) : 0;
  const softMin = softMinMultiplierForLanded(cost);
  const softMax = softMaxMultiplierForLanded(cost);
  const minPrice = roundToNaturalPrice(cost * softMin);
  const maxPrice = Math.min(
    absoluteMaxForCost(cost),
    roundToNaturalPrice(cost * softMax)
  );

  if (proposedPrice > maxPrice) {
    return {
      price: maxPrice,
      adjusted: true,
      reason: `Markedssjekk: ${proposedPrice} kr for kost ${cost} kr er urealistisk høyt (tak ${maxPrice} kr · max ~${softMax}×).`,
    };
  }
  if (proposedPrice < minPrice && proposedPrice > 0) {
    return {
      price: minPrice,
      adjusted: true,
      reason: `Markedssjekk: hevet til ${minPrice} kr for bærekraftig dekning (kost ${cost} kr).`,
    };
  }
  return {
    price: proposedPrice,
    adjusted: false,
    reason: `Markedssjekk OK (typisk ${minPrice}–${maxPrice} kr · målmargin-basert).`,
  };
}

export function roundToNaturalPrice(price: number): number {
  if (!Number.isFinite(price) || price <= 0) {
    return NATURAL_PRICE_LADDER[0];
  }

  const ladder = NATURAL_PRICE_LADDER;
  const last = ladder[ladder.length - 1];

  if (price >= last) {
    const base = Math.round(price / 500) * 500;
    const candidates = [base - 1, base + 499].filter((n) => n >= last);
    let best = candidates[0] ?? last;
    let bestDist = Math.abs(best - price);
    for (const c of candidates) {
      const d = Math.abs(c - price);
      if (d < bestDist || (d === bestDist && c > best)) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  }

  let best: number = ladder[0];
  let bestDist = Math.abs(best - price);
  for (const step of ladder) {
    const d = Math.abs(step - price);
    if (d < bestDist || (d === bestDist && step > best)) {
      best = step;
      bestDist = d;
    }
  }
  return best;
}

/** @deprecated Prefer roundToNaturalPrice */
export function roundToNearestNine(price: number): number {
  return roundToNaturalPrice(price);
}

export function isNaturalPrice(price: number): boolean {
  if (!Number.isFinite(price)) return false;
  const rounded = Math.round(price);
  if ((NATURAL_PRICE_LADDER as readonly number[]).includes(rounded)) return true;
  if (rounded > lastLadder()) {
    return rounded % 500 === 499 || rounded % 1000 === 999 || rounded % 1000 === 499;
  }
  return false;
}

function lastLadder() {
  return NATURAL_PRICE_LADDER[NATURAL_PRICE_LADDER.length - 1];
}

/**
 * Calculate suggested retail from real supplier cost (NOK).
 */
export function calculateSuggestedRetailPrice(
  costNOK: number,
  opts?: {
    shippingEstimate?: string | null;
    profitMargin?: string | number | null;
  }
): number {
  return calculatePricingBreakdown(costNOK, opts).sellingPrice;
}

export function calculatePricingBreakdown(
  supplierCostNOK: number,
  opts?: {
    shippingEstimate?: string | null;
    profitMargin?: string | number | null;
  }
): {
  supplierCost: number;
  inboundShipping: number;
  landedCost: number;
  rawPrice: number;
  sellingPrice: number;
  compareAtPrice: number;
  marginPct: number;
  markupPct: number;
  policy: string;
  marketSanityReason: string;
} {
  const cost = Number.isFinite(supplierCostNOK) ? Math.max(0, supplierCostNOK) : 0;
  const { landedCost, inboundShipping } = calculateLandedCostNOK(
    cost,
    opts?.shippingEstimate
  );
  const { rawPrice, policy } = applyMarginPolicy(
    cost,
    opts?.profitMargin,
    inboundShipping
  );
  const snapped = roundToNaturalPrice(rawPrice);
  const sanity = applyMarketSanityCheck(cost, snapped);
  const sellingPrice = sanity.price;
  const compareAtPrice = calculateCompareAtPrice(sellingPrice);
  const marginPct =
    sellingPrice > 0 ? ((sellingPrice - landedCost) / sellingPrice) * 100 : 0;
  const markupPct = cost > 0 ? ((sellingPrice - cost) / cost) * 100 : 0;

  return {
    supplierCost: cost,
    inboundShipping,
    landedCost,
    rawPrice,
    sellingPrice,
    compareAtPrice,
    marginPct,
    markupPct,
    policy: sanity.adjusted ? `${policy}; ${sanity.reason}` : `${policy}; ${sanity.reason}`,
    marketSanityReason: sanity.reason,
  };
}

export function calculateCompareAtPrice(retailPrice: number): number {
  return roundToNaturalPrice(retailPrice * COMPARE_AT_PRICE_MULTIPLIER);
}
