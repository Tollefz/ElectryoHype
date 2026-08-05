/**
 * Dropshipping inventory policy.
 * Active products are purchasable even when stock is 0 (ordered from supplier).
 * Positive stock is treated as a hard cap (limited batch / clearance).
 */

export function canPurchaseQuantity(opts: {
  isActive: boolean;
  stock: number;
  quantity: number;
}): { ok: true } | { ok: false; error: string } {
  const qty = Math.floor(opts.quantity);
  if (!opts.isActive) {
    return { ok: false, error: "Produktet er ikke tilgjengelig" };
  }
  if (qty < 1 || qty > 99) {
    return { ok: false, error: "Ugyldig antall" };
  }
  // Soft inventory: stock <= 0 means "order from supplier" for active SKUs
  if (opts.stock > 0 && opts.stock < qty) {
    return { ok: false, error: "Ikke nok lager for dette produktet" };
  }
  return { ok: true };
}

/** Default virtual stock for sellable dropship SKUs (ops tracking). */
export const DROPSHIP_VIRTUAL_STOCK = 100;
