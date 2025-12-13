/**
 * Single source of truth for shipping and delivery messaging
 * Used across product pages, cart, checkout, and legal pages
 */

export const SHIPPING_MESSAGES = {
  // Main delivery estimate
  ESTIMATED_DELIVERY: "5–12 virkedager (varierer)",
  
  // Processing message
  MANUAL_PROCESSING: "Vi behandler bestillingen manuelt etter betaling.",
  
  // Stock availability (neutral phrasing)
  IN_STOCK: "Tilgjengelig – leveringstid 5–12 virkedager",
  OUT_OF_STOCK: "Ikke på lager",
  LOW_STOCK: (count: number) => `Bare ${count} på lager`,
  
  // Shipping cost
  FREE_SHIPPING_THRESHOLD: 500,
  FREE_SHIPPING_MESSAGE: "Gratis frakt ved kjøp over 500 kr",
  STANDARD_SHIPPING_COST: 99,
  
  // Full delivery info text
  DELIVERY_INFO: "Ordrene behandles manuelt etter betaling. Estimert leveringstid: 5–12 virkedager fra ordrebehandling.",
} as const;

