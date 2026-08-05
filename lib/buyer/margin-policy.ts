/**
 * Single source of truth for buyer margin floors / targets.
 *
 * Strategy: optimize toward realistic målmargin by landed cost —
 * not maximum multiplier. Healthy competitive margins sell more.
 */

/** Hard stop — never auto-publish below this. */
export const MARGIN_HARD_STOP_PCT = 25;

/** Soft warning — under mål, still recommendable if above hard stop. */
export const MARGIN_SOFT_WARNING_PCT = 35;

/**
 * Healthy competitive band — preferred for ranking.
 * Above ~70% usually means overpriced vs. market, not "better".
 */
export const MARGIN_HEALTHY_MIN_PCT = 35;
export const MARGIN_HEALTHY_MAX_PCT = 60;
/** Soft ceiling — beyond this, scores drop (extreme markup). */
export const MARGIN_EXTREME_PCT = 70;

/** @deprecated Use MARGIN_SOFT_WARNING_PCT */
export const BUYER_MIN_GROSS_MARGIN_PCT = MARGIN_SOFT_WARNING_PCT;

/** Gaming / core electronics (category nudge on top of landed band). */
export const MARGIN_TARGET_GAMING = { min: 40, max: 50 } as const;
export const MARGIN_TARGET_PREMIUM = { min: 35, max: 45 } as const;
export const MARGIN_TARGET_DEFAULT = { min: 45, max: 55 } as const;

/**
 * Primary pricing targets by landed cost (NOK).
 * Billige småvarer → høyere %-mål; dyr elektronikk → lavere, mer troverdig.
 */
export function marginTargetForLandedCost(
  landedNOK: number | null | undefined
): { min: number; max: number; mid: number; label: string } {
  const landed =
    landedNOK != null && Number.isFinite(landedNOK) ? Math.max(0, landedNOK) : 0;

  if (landed < 50) {
    return { min: 60, max: 70, mid: 65, label: "småvare" };
  }
  if (landed < 100) {
    return { min: 50, max: 60, mid: 55, label: "mellompris-lav" };
  }
  if (landed < 250) {
    return { min: 50, max: 60, mid: 55, label: "mellompris" };
  }
  if (landed < 500) {
    return { min: 40, max: 50, mid: 45, label: "mellompris-høy" };
  }
  return { min: 40, max: 50, mid: 45, label: "dyr-elektronikk" };
}

/**
 * Soft max retail multiplier guidelines by landed cost (not hard rules).
 * Used only to cap absurd suggestions — pricing aims at målmargin first.
 */
export function softMaxMultiplierForLanded(landedNOK: number): number {
  const landed = Number.isFinite(landedNOK) ? Math.max(0, landedNOK) : 0;
  if (landed < 50) return 4.0;
  if (landed < 100) return 3.0;
  if (landed < 250) return 2.5;
  if (landed < 500) return 2.0;
  return 1.8;
}

export function softMinMultiplierForLanded(landedNOK: number): number {
  const landed = Number.isFinite(landedNOK) ? Math.max(0, landedNOK) : 0;
  if (landed < 50) return 3.0;
  if (landed < 100) return 2.5;
  if (landed < 250) return 2.0;
  if (landed < 500) return 1.8;
  return 1.5;
}

/**
 * Category nudge — secondary to landed-cost targets.
 * When landed is known, blend toward landed band.
 */
export function marginTargetForCategory(
  category: string | null | undefined,
  title?: string | null,
  landedNOK?: number | null
): { min: number; max: number; label: string } {
  const landedBand =
    landedNOK != null && Number.isFinite(landedNOK)
      ? marginTargetForLandedCost(landedNOK)
      : null;

  const c = `${category || ""} ${title || ""}`.toLowerCase();
  let cat: { min: number; max: number; label: string };
  if (/gaming|mus|tastatur|headset|rgb|controller/.test(c)) {
    cat = { ...MARGIN_TARGET_GAMING, label: "gaming" };
  } else if (/premium|pro\b|flagship|studio|audiophile/.test(c)) {
    cat = { ...MARGIN_TARGET_PREMIUM, label: "premium" };
  } else if (/kabel|adapter|hub|usb/.test(c)) {
    cat = { min: 55, max: 65, label: "kabler" };
  } else if (/mobil|deksel|lader|powerbank|magsafe/.test(c)) {
    cat = { min: 50, max: 60, label: "mobil" };
  } else {
    cat = { ...MARGIN_TARGET_DEFAULT, label: "standard" };
  }

  if (!landedBand) return cat;

  const mid = (cat.min + cat.max) / 2;
  const blend = Math.round((landedBand.mid * 0.7 + mid * 0.3) * 10) / 10;
  const clamped = Math.min(landedBand.max, Math.max(landedBand.min, blend));
  return {
    min: Math.max(landedBand.min, clamped - 5),
    max: Math.min(landedBand.max, clamped + 5),
    label: `${landedBand.label}/${cat.label}`,
  };
}

export function classifyMargin(
  marginPct: number | null | undefined
): "hard_fail" | "soft_warn" | "ok" | "strong" | "extreme" | "unknown" {
  if (marginPct == null || !Number.isFinite(marginPct)) return "unknown";
  if (marginPct < MARGIN_HARD_STOP_PCT) return "hard_fail";
  if (marginPct < MARGIN_SOFT_WARNING_PCT) return "soft_warn";
  if (marginPct > MARGIN_EXTREME_PCT) return "extreme";
  if (
    marginPct >= MARGIN_HEALTHY_MIN_PCT &&
    marginPct <= MARGIN_HEALTHY_MAX_PCT
  ) {
    return "strong";
  }
  return "ok";
}

/** Retail from landed cost at target margin % (gross margin on sales price). */
export function retailFromTargetMargin(
  landedNOK: number,
  targetMarginPct: number
): number {
  const landed = Math.max(0, landedNOK);
  const m = Math.min(85, Math.max(5, targetMarginPct));
  return landed / (1 - m / 100);
}

/** Merch marginPotential 0–100: peaks at healthy margin, not extreme markup. */
export function scoreMarginPotential(
  marginPct: number | null | undefined
): number {
  if (marginPct == null || !Number.isFinite(marginPct)) return 40;
  const m = marginPct;
  if (m < MARGIN_HARD_STOP_PCT) return Math.max(5, m * 1.2);
  if (m < MARGIN_SOFT_WARNING_PCT) {
    return 40 + ((m - MARGIN_HARD_STOP_PCT) / 10) * 20;
  }
  if (m <= MARGIN_HEALTHY_MAX_PCT) {
    const peak = 50;
    const dist = Math.abs(m - peak);
    return Math.min(98, 92 - dist * 0.8);
  }
  if (m <= MARGIN_EXTREME_PCT) {
    return 70 - (m - MARGIN_HEALTHY_MAX_PCT) * 2;
  }
  return Math.max(20, 50 - (m - MARGIN_EXTREME_PCT) * 1.5);
}
