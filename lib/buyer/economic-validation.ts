/**
 * Economic Validation Layer
 *
 * Flow: Discovery → Scanner → Economic Validation → Merch Score → Candidate
 *
 * Never lifts a bad product. Blocks publish when economics are uncertain.
 * Future: sales history → Supplier Reliability Score for Discovery + Merch.
 */

import { estimateInboundShippingNOK } from "@/lib/import/pricing";
import {
  MARGIN_HARD_STOP_PCT,
  MARGIN_SOFT_WARNING_PCT,
} from "@/lib/buyer/margin-policy";
import {
  ensureFreshUsdToNokRate,
  getUsdToNokRateSync,
  FX_MAX_AGE_HOURS,
} from "@/lib/fx/usd-nok";
import { estimateShippingByWeight } from "@/lib/suppliers/pricing";

/** Align with publish hard floor. */
const PUBLISH_MIN_MARGIN_PCT = MARGIN_HARD_STOP_PCT;

export const PRICE_DRIFT_PCT = 3;
export const PRICE_DRIFT_NOK = 5;
export const FREIGHT_DRIFT_PCT = 15;
export const FREIGHT_DRIFT_NOK = 10;
export const MIN_ECONOMIC_CONFIDENCE = 90;
export const EXTREME_MARGIN_PCT = 80;

export type EconomicFlagId =
  | "price_changed"
  | "freight_changed"
  | "fx_stale"
  | "margin_below_target"
  | "negative_margin"
  | "extreme_margin"
  | "sale_below_landed"
  | "freight_exceeds_product"
  | "variant_price_risk"
  | "economic_control_failed"
  | "confidence_low"
  | "supplier_unavailable";

export type EconomicCheckId =
  | "priceConfirmed"
  | "freightConfirmed"
  | "fxFresh"
  | "marginOk"
  | "variantOk";

export type EconomicValidation = {
  supplierPriceRaw: number;
  supplierCurrency: string;
  costNOK: number;
  shippingNOK: number;
  feesNOK: number;
  vatNOK: number;
  landedCostNOK: number;
  retailNOK: number;
  marginPct: number;
  marginNOK: number;
  breakEvenNOK: number;
  netExpectedNOK: number;
  fx: {
    rate: number;
    from: string;
    to: "NOK";
    fetchedAt: string;
    ageHours: number;
    stale: boolean;
    source: string;
  };
  freight: {
    country: string;
    method: string;
    weightGrams: number | null;
    shippingNOK: number;
    estimated: boolean;
  };
  variants: {
    count: number;
    minPrice: number | null;
    maxPrice: number | null;
    pricedAt: "list" | "min" | "max" | "unknown";
    risk: boolean;
  };
  checks: Record<EconomicCheckId, boolean>;
  checkLabels: Array<{ id: EconomicCheckId; ok: boolean; label: string }>;
  flags: EconomicFlagId[];
  flagLabels: string[];
  confidence: number;
  minMarginTarget: number;
  canRecommend: boolean;
  canPublish: boolean;
  validatedAt: string;
  supplierReliability: {
    ready: false;
    note: string;
  };
};

export type EconomicValidateInput = {
  supplierPrice: number;
  currency: string;
  shipping?: number | null;
  weightGrams?: number | null;
  category?: string | null;
  retailNOK?: number | null;
  previousSupplierPrice?: number | null;
  previousShippingNOK?: number | null;
  variantCount?: number | null;
  variantPrices?: number[] | null;
  priceFreshFromSupplier?: boolean;
  shipToCountry?: string;
  shipMethod?: string;
  feesNOK?: number | null;
  vatRate?: number | null;
  minMarginTarget?: number | null;
  fxOverride?: {
    rate: number;
    fetchedAt: string;
    source: string;
    ageHours: number;
    stale: boolean;
  } | null;
};

const FLAG_LABEL: Record<EconomicFlagId, string> = {
  price_changed: "Pris endret hos leverandør",
  freight_changed: "Frakt endret",
  fx_stale: "Valutakurs utdatert",
  margin_below_target: "Margin under mål",
  negative_margin: "Negativ margin",
  extreme_margin: "Ekstrem margin (>80 %)",
  sale_below_landed: "Salgspris lavere enn landed cost",
  freight_exceeds_product: "Frakt større enn produktpris",
  variant_price_risk: "Variantpris usikker",
  economic_control_failed: "Økonomisk kontroll feilet",
  confidence_low: "Økonomisk sikkerhet under 90 %",
  supplier_unavailable: "Leverandør / produkt utilgjengelig",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNok(amount: number, currency: string, usdRate: number): number {
  const c = (currency || "USD").toUpperCase();
  if (c === "NOK" || c === "KR") return amount;
  if (c === "USD") return amount * usdRate;
  return amount;
}

function materialDrift(
  prev: number,
  next: number,
  pctThresh: number,
  absThresh: number
): boolean {
  if (!Number.isFinite(prev) || !Number.isFinite(next) || prev <= 0) return false;
  const abs = Math.abs(next - prev);
  const pct = (abs / prev) * 100;
  return abs >= absThresh || pct >= pctThresh;
}

/**
 * Validate economics for a product. Merch Score must use landedCostNOK, not raw cost.
 */
export function validateEconomics(
  input: EconomicValidateInput
): EconomicValidation {
  const fxMeta =
    input.fxOverride ||
    (() => {
      const s = getUsdToNokRateSync();
      return {
        rate: s.rate,
        fetchedAt: s.fetchedAt,
        source: s.source,
        ageHours: s.ageHours,
        stale: s.stale,
      };
    })();

  const currency = (input.currency || "USD").toUpperCase();
  const supplierPriceRaw = Number(input.supplierPrice) || 0;
  const vatRate = Math.max(0, input.vatRate ?? 0.25);
  const feesNOK = Math.max(0, input.feesNOK ?? 0);
  const minMarginTarget =
    input.minMarginTarget != null && Number.isFinite(input.minMarginTarget)
      ? Number(input.minMarginTarget)
      : MARGIN_SOFT_WARNING_PCT;

  const costNOK = round2(toNok(supplierPriceRaw, currency, fxMeta.rate));

  const quotedShip =
    input.shipping != null && Number.isFinite(input.shipping) && input.shipping > 0
      ? round2(toNok(Number(input.shipping), currency, fxMeta.rate))
      : null;
  const estimated = quotedShip == null || quotedShip <= 0;
  const shippingNOK = estimated
    ? estimateInboundShippingNOK(costNOK) +
      estimateShippingByWeight(input.weightGrams)
    : quotedShip;

  const vatNOK = round2((costNOK + shippingNOK) * vatRate);
  const landedCostNOK = round2(costNOK + shippingNOK + feesNOK + vatNOK);

  const retailNOK =
    input.retailNOK != null && Number.isFinite(input.retailNOK) && input.retailNOK > 0
      ? Math.round(Number(input.retailNOK))
      : Math.round(landedCostNOK / (1 - minMarginTarget / 100));

  const marginNOK = round2(retailNOK - landedCostNOK);
  const marginPct =
    retailNOK > 0 ? Math.round((marginNOK / retailNOK) * 1000) / 10 : 0;
  const breakEvenNOK = Math.ceil(landedCostNOK);
  const netExpectedNOK = Math.round(marginNOK);

  const variantPrices = (input.variantPrices || []).filter(
    (p) => Number.isFinite(p) && p > 0
  );
  const vCount = Math.max(input.variantCount ?? 0, variantPrices.length);
  let minV: number | null = null;
  let maxV: number | null = null;
  let pricedAt: EconomicValidation["variants"]["pricedAt"] = "list";
  let variantRisk = false;

  if (variantPrices.length >= 2) {
    minV = Math.min(...variantPrices);
    maxV = Math.max(...variantPrices);
    const spreadPct = minV > 0 ? ((maxV - minV) / minV) * 100 : 0;
    if (Math.abs(supplierPriceRaw - minV) < 0.01) pricedAt = "min";
    else if (Math.abs(supplierPriceRaw - maxV) < 0.01) pricedAt = "max";
    else pricedAt = "list";
    if (spreadPct >= 8 && pricedAt !== "max") {
      variantRisk = true;
    }
  } else if (vCount > 1) {
    // Search-stage: multiple variants, no per-SKU prices yet — soft risk
    variantRisk = true;
    pricedAt = "unknown";
  }

  const flags: EconomicFlagId[] = [];

  const fxStale = fxMeta.stale || fxMeta.ageHours >= FX_MAX_AGE_HOURS;
  if (fxStale && currency === "USD") flags.push("fx_stale");

  if (
    input.previousSupplierPrice != null &&
    materialDrift(
      Number(input.previousSupplierPrice),
      supplierPriceRaw,
      PRICE_DRIFT_PCT,
      PRICE_DRIFT_NOK / (currency === "USD" ? fxMeta.rate : 1)
    )
  ) {
    flags.push("price_changed");
  }

  if (
    input.previousShippingNOK != null &&
    materialDrift(
      Number(input.previousShippingNOK),
      shippingNOK,
      FREIGHT_DRIFT_PCT,
      FREIGHT_DRIFT_NOK
    )
  ) {
    flags.push("freight_changed");
  }

  if (variantRisk) flags.push("variant_price_risk");
  if (marginPct < 0) flags.push("negative_margin");
  if (retailNOK > 0 && retailNOK < landedCostNOK) flags.push("sale_below_landed");
  if (marginPct > EXTREME_MARGIN_PCT) flags.push("extreme_margin");
  if (costNOK > 0 && shippingNOK > costNOK) flags.push("freight_exceeds_product");
  if (marginPct < minMarginTarget) flags.push("margin_below_target");

  const priceConfirmed =
    supplierPriceRaw > 0 &&
    !flags.includes("price_changed") &&
    (input.priceFreshFromSupplier !== false ||
      input.previousSupplierPrice == null);
  const freightConfirmed = !flags.includes("freight_changed") && shippingNOK >= 0;
  const fxFresh = !fxStale || currency !== "USD";
  const marginHardOk =
    marginPct >= PUBLISH_MIN_MARGIN_PCT &&
    !flags.includes("negative_margin") &&
    !flags.includes("sale_below_landed");
  const marginOk = marginHardOk && marginPct >= minMarginTarget;
  const variantOk = !variantRisk;

  const checks: Record<EconomicCheckId, boolean> = {
    priceConfirmed,
    freightConfirmed,
    fxFresh,
    marginOk,
    variantOk,
  };

  const checkLabels: EconomicValidation["checkLabels"] = [
    {
      id: "priceConfirmed",
      ok: priceConfirmed,
      label: priceConfirmed ? "Pris bekreftet" : "Pris ikke bekreftet",
    },
    {
      id: "freightConfirmed",
      ok: freightConfirmed,
      label: freightConfirmed ? "Frakt bekreftet" : "Frakt ikke bekreftet",
    },
    {
      id: "fxFresh",
      ok: fxFresh,
      label: fxFresh
        ? `Valuta oppdatert (${fxMeta.rate.toFixed(2)})`
        : "Valuta utdatert",
    },
    {
      id: "marginOk",
      ok: marginOk,
      label: marginOk
        ? `Margin kontrollert (${marginPct}%)`
        : `⚠ Margin under mål · Minimum: ${minMarginTarget} % · Beregnet: ${marginPct} %`,
    },
    {
      id: "variantOk",
      ok: variantOk,
      label: variantOk ? "Variant kontrollert" : "Variantpris usikker",
    },
  ];

  let confidence = 100;
  if (!priceConfirmed) confidence -= 25;
  if (!freightConfirmed) confidence -= 15;
  if (!fxFresh) confidence -= 20;
  if (!marginHardOk) confidence -= 30;
  else if (!marginOk) confidence -= 8;
  if (!variantOk) {
    confidence -= pricedAt === "unknown" ? 5 : 12;
  }
  if (estimated && input.weightGrams == null) confidence -= 5;
  if (flags.includes("extreme_margin")) confidence -= 10;
  if (flags.includes("freight_exceeds_product")) confidence -= 10;
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  if (confidence < MIN_ECONOMIC_CONFIDENCE) flags.push("confidence_low");

  // Hard publish blocks — soft flags (variant unknown, margin under soft target) alone don't fail scan recommend
  const catastrophic =
    flags.includes("negative_margin") ||
    flags.includes("sale_below_landed") ||
    flags.includes("extreme_margin") ||
    flags.includes("freight_exceeds_product") ||
    flags.includes("price_changed") ||
    flags.includes("fx_stale") ||
    !marginHardOk;

  const hardFail =
    catastrophic || confidence < MIN_ECONOMIC_CONFIDENCE;

  if (hardFail) flags.push("economic_control_failed");

  const uniqueFlags = [...new Set(flags)];
  const flagLabels = uniqueFlags.map((f) => FLAG_LABEL[f]);

  const canPublish = !hardFail;
  const canRecommend =
    marginHardOk &&
    fxFresh &&
    !flags.includes("price_changed") &&
    !flags.includes("sale_below_landed") &&
    !flags.includes("negative_margin") &&
    confidence >= 85;

  return {
    supplierPriceRaw,
    supplierCurrency: currency,
    costNOK,
    shippingNOK: round2(shippingNOK),
    feesNOK: round2(feesNOK),
    vatNOK,
    landedCostNOK,
    retailNOK,
    marginPct,
    marginNOK,
    breakEvenNOK,
    netExpectedNOK,
    fx: {
      rate: fxMeta.rate,
      from: currency === "USD" ? "USD" : currency,
      to: "NOK",
      fetchedAt: fxMeta.fetchedAt,
      ageHours: Math.round(fxMeta.ageHours * 10) / 10,
      stale: fxStale,
      source: fxMeta.source,
    },
    freight: {
      country: input.shipToCountry || "NO",
      method:
        input.shipMethod ||
        (estimated ? "estimert_inbound" : "leverandør_quote"),
      weightGrams:
        input.weightGrams != null && Number.isFinite(input.weightGrams)
          ? Number(input.weightGrams)
          : null,
      shippingNOK: round2(shippingNOK),
      estimated,
    },
    variants: {
      count: vCount,
      minPrice: minV,
      maxPrice: maxV,
      pricedAt,
      risk: variantRisk,
    },
    checks,
    checkLabels,
    flags: uniqueFlags,
    flagLabels,
    confidence,
    minMarginTarget,
    canRecommend,
    canPublish,
    validatedAt: new Date().toISOString(),
    supplierReliability: {
      ready: false,
      note: "Supplier Risk Score er aktiv (prisvolatilitet). Full reliability (retur, fraktavvik, leveringstid) kommer med salgshistorikk.",
    },
  };
}

export async function validateEconomicsAsync(
  input: EconomicValidateInput
): Promise<EconomicValidation> {
  const fx = await ensureFreshUsdToNokRate();
  return validateEconomics({
    ...input,
    fxOverride: {
      rate: fx.rate,
      fetchedAt: fx.fetchedAt,
      source: fx.source,
      ageHours: fx.ageHours,
      stale: fx.stale,
    },
  });
}

export function economicToPricingFields(
  e: EconomicValidation
): Record<string, unknown> {
  return {
    costNOK: e.costNOK,
    shippingNOK: e.shippingNOK,
    feesNOK: e.feesNOK,
    vatNOK: e.vatNOK,
    landedCostNOK: e.landedCostNOK,
    retailNOK: e.retailNOK,
    marginPct: e.marginPct,
    marginNOK: e.marginNOK,
    breakEvenNOK: e.breakEvenNOK,
    economicConfidence: e.confidence,
    economic: e,
    fxRate: e.fx.rate,
    fxFetchedAt: e.fx.fetchedAt,
  };
}

export async function revalidateEconomicsForPublish(input: {
  storedSupplierPrice: number;
  storedCurrency: string;
  storedShippingNOK?: number | null;
  storedRetailNOK?: number | null;
  liveSupplierPrice: number | null;
  liveCurrency?: string | null;
  liveShipping?: number | null;
  liveWeightGrams?: number | null;
  liveVariantPrices?: number[] | null;
  variantCount?: number | null;
  category?: string | null;
  supplierAvailable?: boolean;
}): Promise<{
  ok: boolean;
  economic: EconomicValidation;
  message: string;
  problems: string[];
  reasonsOk: string[];
}> {
  if (input.supplierAvailable === false || input.liveSupplierPrice == null) {
    const failed = validateEconomics({
      supplierPrice: input.storedSupplierPrice,
      currency: input.storedCurrency,
      retailNOK: input.storedRetailNOK,
      previousSupplierPrice: input.storedSupplierPrice,
      priceFreshFromSupplier: false,
    });
    failed.flags = [
      ...new Set([
        ...failed.flags,
        "supplier_unavailable" as EconomicFlagId,
        "economic_control_failed" as EconomicFlagId,
      ]),
    ];
    failed.flagLabels = failed.flags.map((f) => FLAG_LABEL[f]);
    failed.canPublish = false;
    failed.canRecommend = false;
    failed.confidence = Math.min(failed.confidence, 40);
    return {
      ok: false,
      economic: failed,
      message: "Publisering stoppet — produkt/leverandør utilgjengelig",
      problems: ["Produkt fortsatt tilgjengelig? Nei"],
      reasonsOk: [],
    };
  }

  const economic = await validateEconomicsAsync({
    supplierPrice: input.liveSupplierPrice,
    currency: input.liveCurrency || input.storedCurrency,
    shipping: input.liveShipping,
    weightGrams: input.liveWeightGrams,
    retailNOK: input.storedRetailNOK,
    previousSupplierPrice: input.storedSupplierPrice,
    previousShippingNOK: input.storedShippingNOK,
    variantCount: input.variantCount,
    variantPrices: input.liveVariantPrices,
    priceFreshFromSupplier: true,
    category: input.category,
  });

  if (
    input.storedRetailNOK != null &&
    input.storedRetailNOK > 0 &&
    economic.landedCostNOK > 0
  ) {
    const retail = input.storedRetailNOK;
    const marginNOK = retail - economic.landedCostNOK;
    const marginPct = Math.round((marginNOK / retail) * 1000) / 10;
    economic.retailNOK = retail;
    economic.marginNOK = round2(marginNOK);
    economic.marginPct = marginPct;
    economic.netExpectedNOK = Math.round(marginNOK);

    if (marginPct < PUBLISH_MIN_MARGIN_PCT || marginPct < 0) {
      if (!economic.flags.includes("margin_below_target")) {
        economic.flags.push("margin_below_target");
      }
      if (marginPct < 0 && !economic.flags.includes("negative_margin")) {
        economic.flags.push("negative_margin");
      }
      economic.canPublish = false;
      economic.flags = [
        ...new Set([...economic.flags, "economic_control_failed" as EconomicFlagId]),
      ];
      economic.flagLabels = economic.flags.map((f) => FLAG_LABEL[f]);
      economic.checks.marginOk = false;
      economic.confidence = Math.min(economic.confidence, 70);
    }
  }

  const problems: string[] = [];
  const reasonsOk: string[] = [];

  if (economic.flags.includes("price_changed")) {
    const prev = input.storedSupplierPrice;
    const next = input.liveSupplierPrice!;
    const pct = prev > 0 ? Math.round(((next - prev) / prev) * 100) : 0;
    problems.push(
      `Innkjøpspris endret ${pct >= 0 ? "+" : ""}${pct}% hos leverandør`
    );
  } else {
    reasonsOk.push("✔ Pris fortsatt gyldig");
  }

  if (economic.flags.includes("freight_changed")) {
    problems.push("Frakt endret vesentlig");
  } else {
    reasonsOk.push("✔ Frakt fortsatt gyldig");
  }

  if (economic.fx.stale) {
    problems.push("Valutakurs utdatert");
  } else {
    reasonsOk.push(
      `✔ Valuta oppdatert (${economic.fx.rate.toFixed(2)} · ${economic.fx.source})`
    );
  }

  if (
    economic.marginPct < PUBLISH_MIN_MARGIN_PCT ||
    economic.marginPct < 0
  ) {
    problems.push(
      `Ny margin: ${economic.marginPct}% (minimum ${PUBLISH_MIN_MARGIN_PCT}%)`
    );
  } else {
    reasonsOk.push(`✔ Margin innenfor butikkregler (${economic.marginPct}%)`);
  }

  if (economic.flags.includes("variant_price_risk")) {
    problems.push("Variantpris usikker — dyreste variant ikke priset");
  }

  if (!economic.canPublish || problems.length > 0) {
    const reason =
      problems[0] || economic.flagLabels[0] || "Økonomisk kontroll feilet";
    return {
      ok: false,
      economic,
      message: `Publisering stoppet. Årsak: ${reason}.${
        economic.marginPct < economic.minMarginTarget
          ? ` Ny margin: ${economic.marginPct}%. Vennligst beregn ny salgspris.`
          : ""
      }`,
      problems: [...new Set([...problems, ...economic.flagLabels])],
      reasonsOk,
    };
  }

  return {
    ok: true,
    economic,
    message: "✔ Økonomisk kontroll bestått",
    problems: [],
    reasonsOk: [
      ...reasonsOk,
      `✔ Økonomisk sikkerhet ${economic.confidence}%`,
    ],
  };
}

export function parseEconomicFromPricing(
  pricing: unknown
): EconomicValidation | null {
  if (!pricing || typeof pricing !== "object") return null;
  const o = pricing as Record<string, unknown>;
  if (o.economic && typeof o.economic === "object") {
    return o.economic as EconomicValidation;
  }
  return null;
}
