/**
 * Order Automation — customer notification hooks.
 * Routes through Communication Engine (locale → templates → channel).
 * Failures are logged; they never roll back order phase.
 */

import "server-only";

import { appendOrderEvent } from "@/lib/orders/order-events";
import { communicateOrderEvent } from "@/lib/communication";

export type NotificationKind =
  | "order_received"
  | "payment_approved"
  | "sent_to_warehouse"
  | "tracking_received"
  | "shipped"
  | "delivered"
  | "problem"
  | "delay"
  | "reminder";

/**
 * Dispatch a customer-facing notification for an automation event.
 * Architecture: engine → notifications → Communication Engine → email/SMS/push.
 */
export async function notifyOrderCustomer(input: {
  orderId: string;
  kind: NotificationKind;
  detail?: string;
}): Promise<{ sent: boolean; reason?: string; locale?: string }> {
  try {
    // Warehouse-only: no customer mail yet
    if (input.kind === "sent_to_warehouse") {
      await appendOrderEvent({
        orderId: input.orderId,
        type: "customer_notified",
        message: "Varsling hoppet over: sent_to_warehouse (intern)",
        meta: { kind: input.kind, skipped: true },
      });
      return { sent: false, reason: "internal_only" };
    }

    const result = await communicateOrderEvent({
      orderId: input.orderId,
      kind: input.kind,
      detail: input.detail,
      channel: "email",
      send: true,
    });

    const sent = Boolean(result.delivery?.ok);
    await appendOrderEvent({
      orderId: input.orderId,
      type: "customer_notified",
      message: sent
        ? `Kunde varslet (${result.composed.languageDisplayName}): ${input.kind}`
        : `Varsling ${input.kind} feilet / ikke sendt`,
      meta: {
        kind: input.kind,
        detail: input.detail || null,
        locale: result.composed.locale,
        messageType: result.messageType,
        deliveryError: result.delivery?.error || null,
      },
    });

    return sent
      ? { sent: true, locale: result.composed.locale }
      : {
          sent: false,
          reason: result.delivery?.error || "not_sent",
          locale: result.composed.locale,
        };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendOrderEvent({
      orderId: input.orderId,
      type: "customer_notified",
      message: `Varsling feilet: ${message}`,
      meta: { kind: input.kind },
    });
    return { sent: false, reason: message };
  }
}
