/** Norwegian standard VAT (MVA) rate. Catalog prices are tax-inclusive. */
export const NO_VAT_RATE = 0.25;

/**
 * VAT portion already included in a gross (inkl. mva) amount.
 * gross = net * 1.25 → vat = gross * (0.25/1.25) = gross * 0.2
 */
export function includedVatFromGross(gross: number): number {
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return Math.round(gross * (NO_VAT_RATE / (1 + NO_VAT_RATE)) * 100) / 100;
}

export function netFromGross(gross: number): number {
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return Math.round((gross - includedVatFromGross(gross)) * 100) / 100;
}
