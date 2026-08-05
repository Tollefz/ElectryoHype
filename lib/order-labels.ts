/**
 * Shared order/status labels — safe for Client Components.
 */

export const SUPPLIER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Venter",
  SENT_TO_SUPPLIER: "Sendt til leverandør",
  ACCEPTED_BY_SUPPLIER: "Godkjent av leverandør",
  SHIPPED: "Sendt",
  DELIVERED: "Levert",
  CANCELLED: "Kansellert",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Kort",
  stripe: "Kort (Stripe)",
  klarna: "Klarna",
  vipps: "Vipps",
};

export function humanPaymentMethod(method?: string | null): string {
  if (!method) return "—";
  const key = method.toLowerCase();
  return PAYMENT_METHOD_LABELS[key] || method.charAt(0).toUpperCase() + method.slice(1);
}
