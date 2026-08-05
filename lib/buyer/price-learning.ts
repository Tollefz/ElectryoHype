/**
 * Light-weight pricing preference learning from admin rules + likes.
 * Grows smarter as Rob writes rules and thumbs products — no separate DB yet.
 */

export type PricingPreferenceHints = {
  /** Prefer nest billigste in a market cluster (Komplett-stil) */
  preferSecondCheapestInBand: boolean;
  preferredBand?: { min: number; max: number };
  categoryMargins?: Record<string, { min: number; max: number }>;
};

export function inferPricingPreferences(input: {
  rules?: string[] | null;
  likes?: string[] | null;
}): PricingPreferenceHints {
  const text = [...(input.rules || []), ...(input.likes || [])]
    .join("\n")
    .toLowerCase();

  const preferSecondCheapestInBand =
    /nest\s*billigste|nesten\s*alltid.*billigste|andre\s*billigste|komplett|elkjøp|proshop/.test(
      text
    ) || /399\s*[-–]\s*699|mellom\s*399.*699/.test(text);

  let preferredBand: PricingPreferenceHints["preferredBand"];
  const bandMatch = text.match(
    /(?:mellom|pris(?:er)?)\s*(\d{2,4})\s*[-–]\s*(\d{2,4})\s*kr/
  );
  if (bandMatch) {
    preferredBand = {
      min: Number(bandMatch[1]),
      max: Number(bandMatch[2]),
    };
  } else if (/399\s*[-–]\s*699/.test(text)) {
    preferredBand = { min: 399, max: 699 };
  }

  const categoryMargins: Record<string, { min: number; max: number }> = {};
  const gamingMargin = text.match(
    /gamingmus[^.\n]{0,40}?(\d{2})\s*[-–%]\s*(\d{2})\s*%/
  );
  if (gamingMargin) {
    categoryMargins.gaming = {
      min: Number(gamingMargin[1]),
      max: Number(gamingMargin[2]),
    };
  } else if (/gamingmus.*35\s*[-–]\s*45|35\s*[-–]\s*45\s*%.*gaming/.test(text)) {
    categoryMargins.gaming = { min: 35, max: 45 };
  }

  if (/kabler?.*(lavere|lav)\s*margin|lavere\s*margin.*kabel/.test(text)) {
    categoryMargins.kabel = { min: 25, max: 35 };
  }

  return {
    preferSecondCheapestInBand,
    preferredBand,
    categoryMargins:
      Object.keys(categoryMargins).length > 0 ? categoryMargins : undefined,
  };
}
