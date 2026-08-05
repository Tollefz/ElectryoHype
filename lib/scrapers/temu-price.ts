/**
 * Temu price extraction helpers.
 *
 * CRITICAL: The scraper historically fell back to 9.99 USD, which the pipeline
 * converted with USD_TO_NOK_RATE (10.5) → ~105 NOK for EVERY product when the
 * live Temu price could not be scraped. That is not a real supplier cost.
 *
 * Norwegian Temu share/ad URLs often embed the displayed price in øre as
 * base64 in `_oak_rec_ext_1` (e.g. MjQwMA → "2400" → 24.00 NOK).
 */

export const TEMU_USD_FALLBACK_AMOUNT = 9.99;
export const TEMU_FALLBACK_NOK = TEMU_USD_FALLBACK_AMOUNT * 10.5; // 104.895

export type TemuPriceExtraction = {
  amountNOK: number;
  source:
    | "oak_rec_ext_1"
    | "url_kr"
    | "url_price_param"
    | "none";
  raw?: string;
};

/** True when a stored supplier cost is the known 9.99 USD → NOK placeholder. */
export function isTemuFallbackSupplierCost(costNOK: number | null | undefined): boolean {
  if (costNOK == null || !Number.isFinite(costNOK)) return false;
  return Math.abs(costNOK - TEMU_FALLBACK_NOK) < 1.5 || Math.abs(costNOK - 105) < 0.6;
}

/**
 * Decode `_oak_rec_ext_1` (base64 digits = price in øre for NO locale).
 */
export function decodeOakRecExtPrice(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const decoded = Buffer.from(raw.trim(), "base64").toString("utf8").trim();
    if (!/^\d{2,7}$/.test(decoded)) return null;
    const ore = Number.parseInt(decoded, 10);
    if (!Number.isFinite(ore) || ore <= 0) return null;
    // Values are almost always øre (2400 = 24.00 NOK). Keep NOK with 2 decimals.
    const nok = ore / 100;
    if (nok < 1 || nok > 50000) return null;
    return Math.round(nok * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * Extract Temu displayed price in NOK from a product URL.
 * Never invents 9.99 USD.
 */
export function extractTemuPriceNOKFromUrl(url: string): TemuPriceExtraction {
  try {
    const urlObj = new URL(url);

    const oak = urlObj.searchParams.get("_oak_rec_ext_1");
    const fromOak = decodeOakRecExtPrice(oak);
    if (fromOak != null) {
      return { amountNOK: fromOak, source: "oak_rec_ext_1", raw: oak || undefined };
    }

    const krMatch = url.match(/[_\-](\d+(?:[.,]\d+)?)[\-_]?kr/i);
    if (krMatch) {
      const amount = Number.parseFloat(krMatch[1].replace(",", "."));
      if (Number.isFinite(amount) && amount > 0 && amount < 50000) {
        return { amountNOK: amount, source: "url_kr", raw: krMatch[0] };
      }
    }

    const priceParam = urlObj.searchParams.get("price");
    if (priceParam) {
      const amount = Number.parseFloat(priceParam.replace(",", "."));
      if (Number.isFinite(amount) && amount > 0 && amount < 50000) {
        return { amountNOK: amount, source: "url_price_param", raw: priceParam };
      }
    }
  } catch {
    /* ignore */
  }

  return { amountNOK: 0, source: "none" };
}
