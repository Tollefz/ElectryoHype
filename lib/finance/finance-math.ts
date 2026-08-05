/**
 * Shared finance math — store economics (not accounting).
 */

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function marginPct(
  price: number,
  cost: number | null | undefined
): number | null {
  if (cost == null || cost < 0 || price <= 0) return null;
  return round2(((price - cost) / price) * 100);
}

export function profitNok(
  price: number,
  cost: number | null | undefined,
  qty = 1
): number | null {
  if (cost == null || cost < 0) return null;
  return round2((price - cost) * qty);
}

/**
 * ROI on supplier cost: profit / cost × 100.
 * e.g. cost 100, profit 50 → 50 % ROI.
 */
export function roiPct(
  profit: number | null | undefined,
  cost: number | null | undefined
): number | null {
  if (profit == null || cost == null || cost <= 0) return null;
  return round2((profit / cost) * 100);
}

/** Rough Stripe EU card fee estimate (NOK). */
export function estimateStripeFee(orderTotalNok: number): number {
  if (!Number.isFinite(orderTotalNok) || orderTotalNok <= 0) return 0;
  return round2(orderTotalNok * 0.029 + 2);
}

export function unitSupplierCost(
  supplierPrice: number | null | undefined,
  salePrice: number
): number {
  if (supplierPrice != null && supplierPrice > 0) return Number(supplierPrice);
  return salePrice * 0.5;
}
