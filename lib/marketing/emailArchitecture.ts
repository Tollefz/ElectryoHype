/**
 * Marketing email architecture — ElectroHypeX
 *
 * Transactional (live via Resend):
 * - Order confirmation → lib/email.ts sendOrderConfirmation + emails/order-confirmation.tsx
 * - Admin new order → sendAdminNotification + emails/admin-new-order.tsx
 * - Shipping / tracking → sendShippingNotification + emails/order-shipped.tsx
 *
 * Marketing flows (templates / stubs — wire Resend when ready):
 * - Welcome → lib/marketing/emailFlows/welcome.ts (newsletter subscribe trigger)
 * - Abandoned cart 1/2/3 → lib/marketing/emailTemplates/abandonedCart*.ts
 *   + worker app/api/internal/abandoned-cart/worker (needs Resend send)
 * - Win-back / review / birthday / upsell → lib/marketing/emailFlows/*
 *
 * Recommended event triggers (future, no new admin UI):
 * | Flow            | Trigger                         | Delay        |
 * |-----------------|---------------------------------|--------------|
 * | Welcome         | Newsletter subscribe            | Immediate    |
 * | Order confirm   | Stripe paid                     | Immediate    |
 * | Shipping        | Fulfillment SHIPPED + tracking  | Immediate    |
 * | Delivered       | Carrier delivered (optional)    | +1 day       |
 * | Abandoned cart  | Cart capture idle               | 1h / 24h / 72h |
 * | Review request  | Delivered                       | +7 days      |
 *
 * Do not send marketing mail without consent (newsletter / cookie where required).
 */

export const EMAIL_FLOW_STATUS = {
  orderConfirmation: "live",
  adminNewOrder: "live",
  shippingTracking: "live",
  delivered: "planned",
  welcome: "stub",
  abandonedCart: "stub",
  winBack: "stub",
  reviewRequest: "stub",
  postPurchaseUpsell: "stub",
  birthday: "stub",
} as const;

export type EmailFlowId = keyof typeof EMAIL_FLOW_STATUS;
