/** Server-authoritative shipping amounts (NOK). Never trust client totals. */
export type ShippingMethod = "standard" | "express";

export const FREE_SHIPPING_THRESHOLD = 500;
export const STANDARD_SHIPPING = 99;
export const EXPRESS_SHIPPING = 199;

export function normalizeShippingMethod(raw: unknown): ShippingMethod {
  return raw === "express" ? "express" : "standard";
}

export function computeShippingCost(
  subtotal: number,
  method: ShippingMethod = "standard"
): number {
  if (method === "express") return EXPRESS_SHIPPING;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return STANDARD_SHIPPING;
}

export function shippingMethodLabel(method: ShippingMethod, cost: number): string {
  if (method === "express") return "Ekspress";
  if (cost === 0) return "Gratis";
  return "Standard";
}
