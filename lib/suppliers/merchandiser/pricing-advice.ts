/**
 * Merchandiser pricing — think like Komplett/Elkjøp/Proshop, not flat markup.
 *
 * Signals: landed cost, market band, category, premium, psychology ladder,
 * optional Rob preference hints (learned over time).
 */

import {
  NATURAL_PRICE_LADDER,
  roundToNaturalPrice,
} from "@/lib/import/pricing";
import type { MerchandiserPricingAdvice } from "@/lib/suppliers/merchandiser/types";
import type { ShopProfileData } from "@/lib/suppliers/merchandiser/types";
import {
  inferPricingPreferences,
  type PricingPreferenceHints,
} from "@/lib/buyer/price-learning";
import {
  economicToPricingFields,
  validateEconomics,
} from "@/lib/buyer/economic-validation";
import { getUsdToNokRateSync } from "@/lib/fx/usd-nok";
import {
  marginTargetForCategory,
  softMaxMultiplierForLanded,
} from "@/lib/buyer/margin-policy";
import { calculateSupplierPricing } from "@/lib/suppliers/pricing";
import { getActiveBatchTimer } from "@/lib/buyer/batch-timing";

export type PriceReasonBullet = {
  ok: boolean;
  label: string;
};

function marketBandAround(target: number): { low: number; high: number } {
  const ladder = NATURAL_PRICE_LADDER as readonly number[];
  let idx = 0;
  for (let i = 0; i < ladder.length; i++) {
    if (ladder[i] >= target) {
      idx = i;
      break;
    }
    idx = i;
  }
  const low = ladder[Math.max(0, idx - 1)] ?? target;
  const high = ladder[Math.min(ladder.length - 1, idx + 1)] ?? target;
  return { low: Math.min(low, target), high: Math.max(high, target) };
}

/** Prefer second-cheapest in a tight market cluster when Rob tends to do so. */
function pickPsychologicalInBand(
  raw: number,
  band: { low: number; high: number },
  preferSecondCheapest: boolean
): number {
  const ladder = (NATURAL_PRICE_LADDER as readonly number[]).filter(
    (p) => p >= band.low && p <= band.high + 50
  );
  if (ladder.length === 0) return roundToNaturalPrice(raw);
  if (preferSecondCheapest && ladder.length >= 2) {
    // Nest billigste i båndet (Komplett-stil)
    return ladder[1];
  }
  // Closest natural rung at or above raw when possible
  const atOrAbove = ladder.find((p) => p >= raw);
  return atOrAbove ?? ladder[ladder.length - 1];
}

function categoryMarginTarget(
  category: string | null | undefined,
  hints: PricingPreferenceHints,
  title?: string | null,
  landedNOK?: number | null
): { min: number; max: number; label: string } {
  const c = (category || "").toLowerCase();
  if (hints.categoryMargins) {
    for (const [key, range] of Object.entries(hints.categoryMargins)) {
      if (c.includes(key)) return { ...range, label: key };
    }
  }
  return marginTargetForCategory(category, title, landedNOK);
}

export function estimateMerchandiserPricing(input: {
  supplierPrice: number;
  currency: string;
  shipping?: number | null;
  weightGrams?: number | null;
  category?: string | null;
  title?: string | null;
  profile?: ShopProfileData | null;
  /** Optional free-text admin rules + likes for learning */
  preferenceRules?: string[];
  likes?: string[];
  qualityScore?: number | null;
  inStock?: boolean;
  assortmentSaturated?: boolean;
  variantCount?: number | null;
  variantPrices?: number[] | null;
}): MerchandiserPricingAdvice {
  const timer = getActiveBatchTimer();
  const hints = inferPricingPreferences({
    rules: input.preferenceRules,
    likes: input.likes,
  });

  const fx = getUsdToNokRateSync();
  const base = calculateSupplierPricing({
    supplierPrice: input.supplierPrice,
    currency: input.currency || "USD",
    shipping: input.shipping,
    weightGrams: input.weightGrams,
    category: input.category,
    vatRate: 0.25,
    fxRate: fx.rate,
  });

  const adviceT0 = performance.now();

  // Merch Score uses landed cost — never raw supplier price alone
  const landed = base.landedCostNOK;
  const cat = `${input.category || ""} ${input.title || ""}`;
  const marginTarget = categoryMarginTarget(
    input.category,
    hints,
    input.title,
    landed
  );

  // Start from målmargin on landed — not max(base, floor) which pushed prices up
  const midTarget = (marginTarget.min + marginTarget.max) / 2;
  let candidate =
    landed > 0 && midTarget > 0 && midTarget < 90
      ? landed / (1 - midTarget / 100)
      : base.recommendedSalePrice;

  const level = (input.profile?.priceLevel || "mid").toLowerCase();
  if (level === "premium") candidate = Math.round(candidate * 1.03);
  if (level === "budget") candidate = Math.round(candidate * 0.97);

  // Soft floor only — never force extreme markup to hit category max
  const minRetailForMargin =
    marginTarget.min > 0 && marginTarget.min < 90
      ? landed / (1 - marginTarget.min / 100)
      : candidate;
  if (candidate < minRetailForMargin * 0.97) {
    candidate = minRetailForMargin;
  }

  // Premium / quality uplift (modest — competitive pricing first)
  const quality = input.qualityScore ?? 50;
  const premium =
    quality >= 75 ||
    (((input.profile?.qualityLevel || "high") === "high") && landed > 80);
  if (premium) candidate *= 1.02;

  // Lokkeprodukt / saturated assortment → slightly sharper
  if (input.assortmentSaturated) candidate *= 0.96;
  if (input.inStock === false) candidate *= 0.98;

  const band = marketBandAround(roundToNaturalPrice(candidate));
  const preferSecond =
    hints.preferSecondCheapestInBand ||
    (hints.preferredBand &&
      candidate >= hints.preferredBand.min &&
      candidate <= hints.preferredBand.max);

  let retail = pickPsychologicalInBand(candidate, band, Boolean(preferSecond));
  retail = roundToNaturalPrice(retail);

  // Cap at category max margin — no 3–4× blowouts on expensive goods
  const maxRetail =
    marginTarget.max < 90 ? landed / (1 - marginTarget.max / 100) : retail;
  if (retail > maxRetail * 1.05) {
    retail = roundToNaturalPrice(maxRetail);
  }
  // Soft multiplier guideline on landed
  const softMax = softMaxMultiplierForLanded(landed);
  if (landed > 0 && retail > landed * softMax) {
    retail = roundToNaturalPrice(landed * softMax);
  }

  const marginNOK = Math.max(0, retail - landed);
  const marginPct =
    retail > 0 ? Math.round((marginNOK / retail) * 1000) / 10 : 0;

  const market = marketBandAround(retail);
  const reasons: PriceReasonBullet[] = [
    {
      ok: true,
      label: `Markedsbånd: ${market.low}–${market.high} kr`,
    },
    {
      ok: marginPct >= marginTarget.min - 2,
      label: `Margin: ${marginPct}% (mål ${marginTarget.min}–${marginTarget.max}% · ${marginTarget.label})`,
    },
    {
      ok: true,
      label: "Psykologisk pris (norsk prisstige)",
    },
    {
      ok: !input.assortmentSaturated,
      label: input.assortmentSaturated
        ? "Mange lignende i sortiment — skarpere pris"
        : "Matcher typisk posisjon for kategorien",
    },
  ];
  if (premium) {
    reasons.push({ ok: true, label: "Premium-/kvalitetssignal" });
  }
  if (hints.preferSecondCheapestInBand) {
    reasons.push({
      ok: true,
      label: "Lært: Rob velger ofte nest billigste i båndet",
    });
  }
  if (input.inStock === false) {
    reasons.push({ ok: false, label: "Usikker lagerstatus — forsiktig pris" });
  }

  const confidence = Math.min(
    98,
    Math.max(
      55,
      70 +
        (isNaturalPriceLocal(retail) ? 8 : 0) +
        (marginPct >= marginTarget.min && marginPct <= marginTarget.max
          ? 10
          : 0) +
        (premium ? 4 : 0) +
        (hints.preferSecondCheapestInBand ? 6 : 0) -
        (input.assortmentSaturated ? 5 : 0)
    )
  );

  const priceSensitivity: MerchandiserPricingAdvice["priceSensitivity"] =
    retail < 199 ? "high" : retail < 799 ? "medium" : "low";

  const economic = validateEconomics({
    supplierPrice: input.supplierPrice,
    currency: input.currency || "USD",
    shipping: input.shipping,
    weightGrams: input.weightGrams,
    category: input.category,
    retailNOK: retail,
    variantCount: input.variantCount,
    variantPrices: input.variantPrices,
    priceFreshFromSupplier: true,
    fxOverride: {
      rate: fx.rate,
      fetchedAt: fx.fetchedAt,
      source: fx.source,
      ageHours: fx.ageHours,
      stale: fx.stale,
    },
  });

  const econFields = economicToPricingFields(economic);
  const econReasons = economic.checkLabels.map((c) => ({
    ok: c.ok,
    label: c.label,
  }));
  for (const fl of economic.flagLabels.slice(0, 3)) {
    if (!econReasons.some((r) => r.label.includes(fl.slice(0, 12)))) {
      econReasons.push({ ok: false, label: fl });
    }
  }

  timer?.add("price", performance.now() - adviceT0);

  return {
    estimatedRetailNOK: retail,
    estimatedMarginNOK: Math.round(marginNOK),
    estimatedMarginPct: marginPct,
    priceSensitivity,
    premiumPotential: premium && marginPct >= 35,
    confidence: Math.min(confidence, economic.confidence),
    competitorBandLow: market.low,
    competitorBandHigh: market.high,
    reasons: [...reasons, ...econReasons].slice(0, 8),
    rationale: `Pris ${retail} kr · landed ${economic.landedCostNOK} kr · margin ${marginPct}% · økonomisk sikkerhet ${economic.confidence}%. ${reasons
      .filter((r) => r.ok)
      .map((r) => r.label)
      .slice(0, 3)
      .join(" · ")}`,
    ...econFields,
  } as MerchandiserPricingAdvice;
}

function isNaturalPriceLocal(price: number): boolean {
  return (NATURAL_PRICE_LADDER as readonly number[]).includes(Math.round(price));
}
