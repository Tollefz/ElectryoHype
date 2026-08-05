/**
 * SupplierPricing — supplier-agnostic retail recommendation.
 * Temu-specific URL/øre decoding stays out of this module.
 */

import {
  calculateCompareAtPrice,
  calculateSuggestedRetailPrice,
  estimateInboundShippingNOK,
} from "@/lib/import/pricing";
import { getUsdToNokRateSync } from "@/lib/fx/usd-nok";
import { getActiveBatchTimer } from "@/lib/buyer/batch-timing";

export type SupplierPricingInput = {
  supplierPrice: number;
  currency: string;
  shipping?: number | null;
  weightGrams?: number | null;
  /** VAT fraction, e.g. 0.25 for Norway — applied as cost uplift when set. */
  vatRate?: number | null;
  /** Extra platform / payment fees in NOK. */
  feesNOK?: number | null;
  /** Category for optional AI / band tweaks. */
  category?: string | null;
  /** Extra multiplier from AI / category policy (default 1). */
  categoryMarginFactor?: number | null;
  /** Optional FX override (Economic Validation). */
  fxRate?: number | null;
};

export type SupplierPricingResult = {
  costNOK: number;
  shippingNOK: number;
  feesNOK: number;
  vatNOK: number;
  landedCostNOK: number;
  recommendedSalePrice: number;
  compareAtPrice: number;
  currency: "NOK";
  fxRate?: number;
  fxFetchedAt?: string;
};

/** Weight-based shipping add-on when supplier does not quote shipping.
 * Single source — Economic Validation must import this, not duplicate. */
export function estimateShippingByWeight(
  weightGrams: number | null | undefined
): number {
  if (weightGrams == null || !Number.isFinite(weightGrams) || weightGrams <= 0) {
    return 0;
  }
  if (weightGrams < 200) return 19;
  if (weightGrams < 500) return 29;
  if (weightGrams < 1000) return 39;
  if (weightGrams < 2000) return 59;
  return 79;
}

function toNok(amount: number, currency: string, fxRate: number): number {
  const c = (currency || "USD").toUpperCase();
  if (c === "NOK" || c === "KR") return amount;
  if (c === "USD") return amount * fxRate;
  return amount;
}

/**
 * Category soft adjustments — electronics accessories can take slightly higher
 * perceived value; heavy appliances stay conservative.
 */
function categoryFactor(category: string | null | undefined): number {
  const c = (category || "").toLowerCase();
  if (/gaming|mobil|tilbehør/.test(c)) return 1.05;
  if (/hvitevarer/.test(c)) return 0.95;
  return 1;
}

export function calculateSupplierPricing(input: SupplierPricingInput): SupplierPricingResult {
  const timer = getActiveBatchTimer();

  const fxT0 = performance.now();
  const fx = getUsdToNokRateSync();
  timer?.add("currency", performance.now() - fxT0);

  const rate =
    input.fxRate != null && Number.isFinite(input.fxRate) && input.fxRate > 0
      ? Number(input.fxRate)
      : fx.rate;

  const costNOK = toNok(input.supplierPrice, input.currency, rate);

  const shipT0 = performance.now();
  const quotedShipping =
    input.shipping != null && Number.isFinite(input.shipping)
      ? toNok(input.shipping, input.currency, rate)
      : null;
  const shippingNOK =
    quotedShipping != null && quotedShipping > 0
      ? quotedShipping
      : estimateInboundShippingNOK(costNOK) + estimateShippingByWeight(input.weightGrams);
  timer?.add("shipping", performance.now() - shipT0);

  const priceT0 = performance.now();
  const feesNOK = Math.max(0, input.feesNOK ?? 0);
  const vatRate = Math.max(0, input.vatRate ?? 0);
  const vatNOK = (costNOK + shippingNOK) * vatRate;
  const landedCostNOK = costNOK + shippingNOK + feesNOK + vatNOK;

  const factor =
    (input.categoryMarginFactor != null && Number.isFinite(input.categoryMarginFactor)
      ? input.categoryMarginFactor
      : categoryFactor(input.category)) || 1;

  const adjustedLanded = landedCostNOK * factor;
  const recommendedSalePrice = calculateSuggestedRetailPrice(adjustedLanded);
  const compareAtPrice = calculateCompareAtPrice(recommendedSalePrice);
  timer?.add("price", performance.now() - priceT0);

  return {
    costNOK: Math.round(costNOK * 100) / 100,
    shippingNOK: Math.round(shippingNOK * 100) / 100,
    feesNOK: Math.round(feesNOK * 100) / 100,
    vatNOK: Math.round(vatNOK * 100) / 100,
    landedCostNOK: Math.round(landedCostNOK * 100) / 100,
    recommendedSalePrice,
    compareAtPrice,
    currency: "NOK",
    fxRate: rate,
    fxFetchedAt: fx.fetchedAt,
  };
}
