/**
 * Order Automation Engine — advances one order by one (or few) phase steps.
 * UI never calls this for processing; only the Order Worker does.
 */

import "server-only";

import type { OrderAutomationPhase, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendOrderEvent } from "@/lib/orders/order-events";
import { validateOrderForFulfillment } from "@/lib/orders/order-validation";
import { createCjFulfillmentOrder } from "@/lib/orders/cj-fulfillment";
import { pollOrderTracking } from "@/lib/orders/tracking";
import { notifyOrderCustomer } from "@/lib/orders/notifications";
import {
  assertTransition,
  canTransition,
  fulfillmentStatusForPhase,
  MAX_AUTOMATION_RETRIES,
  retryDelayMinutes,
  type AutomationPhase,
} from "@/lib/orders/order-state-machine";

export type EngineStepResult = {
  orderId: string;
  from: AutomationPhase;
  to: AutomationPhase;
  didWork: boolean;
  message: string;
};

async function transitionPhase(
  orderId: string,
  from: AutomationPhase,
  to: AutomationPhase,
  message: string,
  extra?: Prisma.OrderUpdateInput
): Promise<void> {
  assertTransition(from, to);
  if (from === to) return;

  const fulfillment = fulfillmentStatusForPhase(to);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      automationPhase: to,
      automationPhaseAt: new Date(),
      automationLastError:
        to === "CJ_ERROR" ||
        to === "ADDRESS_ERROR" ||
        to === "WAITING_FOR_STOCK" ||
        to === "PAYMENT_FAILED"
          ? message.slice(0, 500)
          : to === "READY_FOR_CJ" || to === "ORDERED" || to === "COMPLETED"
            ? null
            : undefined,
      ...(fulfillment ? { fulfillmentStatus: fulfillment } : {}),
      ...extra,
    },
  });

  await appendOrderEvent({
    orderId,
    type: "phase_changed",
    message,
    phase: to,
    meta: { from, to },
  });
}

async function scheduleRetry(
  orderId: string,
  from: AutomationPhase,
  error: string
): Promise<AutomationPhase> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { automationRetryCount: true },
  });
  const nextAttempt = (order?.automationRetryCount ?? 0) + 1;

  if (nextAttempt > MAX_AUTOMATION_RETRIES) {
    await transitionPhase(
      orderId,
      from,
      "MANUAL_REVIEW",
      `Alle ${MAX_AUTOMATION_RETRIES} retries brukt: ${error}`,
      {
        automationRetryCount: nextAttempt,
        automationNextRetryAt: null,
        autoOrderAttempts: nextAttempt,
        autoOrderError: error.slice(0, 500),
      }
    );
    await appendOrderEvent({
      orderId,
      type: "manual_review",
      message: `Manuell gjennomgang etter ${nextAttempt} forsøk`,
      phase: "MANUAL_REVIEW",
    });
    return "MANUAL_REVIEW";
  }

  const delayMin = retryDelayMinutes(nextAttempt);
  const nextAt = new Date(Date.now() + delayMin * 60_000);
  await transitionPhase(
    orderId,
    from,
    "WAITING_FOR_RETRY",
    `Retry ${nextAttempt}/${MAX_AUTOMATION_RETRIES} om ${delayMin} min: ${error}`,
    {
      automationRetryCount: nextAttempt,
      automationNextRetryAt: nextAt,
      autoOrderAttempts: nextAttempt,
      autoOrderError: error.slice(0, 500),
    }
  );
  await appendOrderEvent({
    orderId,
    type: "retry_scheduled",
    message: `Retry ${nextAttempt} planlagt ${nextAt.toISOString()}`,
    phase: "WAITING_FOR_RETRY",
    meta: { nextAttempt, delayMin },
  });
  return "WAITING_FOR_RETRY";
}

const AUTOMATION_PAST_PAID = new Set<AutomationPhase>([
  "PAID",
  "VALIDATING",
  "READY_FOR_CJ",
  "SENT_TO_CJ",
  "ORDERED",
  "TRACKING_RECEIVED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
]);

/**
 * Mark payment received — called from Stripe webhook (enqueue only).
 * Does not validate or call CJ; Order Worker advances from PAID.
 */
export async function markOrderPaid(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const from = order.automationPhase as AutomationPhase;
  if (AUTOMATION_PAST_PAID.has(from)) return;
  if (from !== "NEW" && from !== "PAYMENT_FAILED") return;
  if (!canTransition(from, "PAID")) return;

  await transitionPhase(orderId, from, "PAID", "Payment received");
  await appendOrderEvent({
    orderId,
    type: "payment_received",
    message: "Betaling godkjent",
    phase: "PAID",
  });
  await notifyOrderCustomer({
    orderId,
    kind: "payment_approved",
  });
}

/**
 * Advance a single order one meaningful step. Safe to call repeatedly.
 */
export async function advanceOrder(orderId: string): Promise<EngineStepResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      orderItems: { include: { product: true, variant: true } },
    },
  });

  if (!order) {
    return {
      orderId,
      from: "NEW",
      to: "NEW",
      didWork: false,
      message: "Order not found",
    };
  }

  let phase = order.automationPhase as AutomationPhase;

  // Sync: paid in Stripe but still NEW in automation
  if (
    order.paymentStatus === "paid" &&
    (phase === "NEW" || phase === "PAYMENT_FAILED")
  ) {
    await markOrderPaid(orderId);
    phase = "PAID";
  }

  if (order.paymentStatus !== "paid" && phase === "NEW") {
    return {
      orderId,
      from: phase,
      to: phase,
      didWork: false,
      message: "Venter på betaling",
    };
  }

  // Release retry window
  if (
    phase === "WAITING_FOR_RETRY" &&
    order.automationNextRetryAt &&
    order.automationNextRetryAt.getTime() <= Date.now()
  ) {
    await transitionPhase(
      orderId,
      "WAITING_FOR_RETRY",
      "READY_FOR_CJ",
      "Retry-vindu åpent — prøver CJ på nytt"
    );
    phase = "READY_FOR_CJ";
  } else if (
    phase === "WAITING_FOR_RETRY" &&
    order.automationNextRetryAt &&
    order.automationNextRetryAt.getTime() > Date.now()
  ) {
    return {
      orderId,
      from: phase,
      to: phase,
      didWork: false,
      message: `Venter til ${order.automationNextRetryAt.toISOString()}`,
    };
  }

  switch (phase) {
    case "PAID": {
      await transitionPhase(orderId, "PAID", "VALIDATING", "Starter validering");
      await appendOrderEvent({
        orderId,
        type: "validation_started",
        message: "AI validering startet",
        phase: "VALIDATING",
      });
      return {
        orderId,
        from: "PAID",
        to: "VALIDATING",
        didWork: true,
        message: "Validering startet",
      };
    }

    case "VALIDATING": {
      const fresh = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: true,
          orderItems: { include: { product: true, variant: true } },
        },
      });
      if (!fresh) {
        return {
          orderId,
          from: phase,
          to: phase,
          didWork: false,
          message: "Missing",
        };
      }
      const result = validateOrderForFulfillment(fresh);
      if (!result.ok) {
        const fail = result.failPhase || "MANUAL_REVIEW";
        const msg = result.issues
          .filter((i) => i.severity === "block")
          .map((i) => i.message)
          .join("; ");
        await transitionPhase(orderId, "VALIDATING", fail, msg);
        await appendOrderEvent({
          orderId,
          type: "validation_failed",
          message: msg,
          phase: fail,
          meta: { issues: result.issues },
        });
        return {
          orderId,
          from: "VALIDATING",
          to: fail,
          didWork: true,
          message: msg,
        };
      }
      await transitionPhase(
        orderId,
        "VALIDATING",
        "READY_FOR_CJ",
        "Validering OK"
      );
      await appendOrderEvent({
        orderId,
        type: "validated",
        message: "Validering OK",
        phase: "READY_FOR_CJ",
        meta: { warnings: result.issues.filter((i) => i.severity === "warn") },
      });
      return {
        orderId,
        from: "VALIDATING",
        to: "READY_FOR_CJ",
        didWork: true,
        message: "Klar for CJ",
      };
    }

    case "READY_FOR_CJ": {
      await transitionPhase(
        orderId,
        "READY_FOR_CJ",
        "SENT_TO_CJ",
        "Sender til CJ"
      );
      const cj = await createCjFulfillmentOrder(orderId);
      if (!cj.ok) {
        const to = await scheduleRetry(orderId, "SENT_TO_CJ", cj.error);
        await appendOrderEvent({
          orderId,
          type: "cj_error",
          message: cj.error,
          phase: to,
        });
        return {
          orderId,
          from: "READY_FOR_CJ",
          to,
          didWork: true,
          message: cj.error,
        };
      }
      await transitionPhase(
        orderId,
        "SENT_TO_CJ",
        "ORDERED",
        `CJ bekreftet: ${cj.supplierOrderId}`,
        { automationRetryCount: 0, automationNextRetryAt: null }
      );
      await appendOrderEvent({
        orderId,
        type: "cj_confirmed",
        message: `CJ Order ID ${cj.supplierOrderId}`,
        phase: "ORDERED",
      });
      await notifyOrderCustomer({
        orderId,
        kind: "sent_to_warehouse",
        detail: cj.supplierOrderId,
      });
      return {
        orderId,
        from: "READY_FOR_CJ",
        to: "ORDERED",
        didWork: true,
        message: `Bestilt: ${cj.supplierOrderId}`,
      };
    }

    case "SENT_TO_CJ": {
      // Recover mid-flight
      const cj = await createCjFulfillmentOrder(orderId);
      if (!cj.ok) {
        const to = await scheduleRetry(orderId, "SENT_TO_CJ", cj.error);
        return {
          orderId,
          from: "SENT_TO_CJ",
          to,
          didWork: true,
          message: cj.error,
        };
      }
      await transitionPhase(
        orderId,
        "SENT_TO_CJ",
        "ORDERED",
        `CJ bekreftet: ${cj.supplierOrderId}`
      );
      return {
        orderId,
        from: "SENT_TO_CJ",
        to: "ORDERED",
        didWork: true,
        message: cj.supplierOrderId,
      };
    }

    case "ORDERED": {
      const track = await pollOrderTracking(orderId);
      if (!track.ok) {
        return {
          orderId,
          from: "ORDERED",
          to: "ORDERED",
          didWork: false,
          message: track.error,
        };
      }
      if (track.changed && track.trackingNumber) {
        await transitionPhase(
          orderId,
          "ORDERED",
          "TRACKING_RECEIVED",
          `Tracking: ${track.trackingNumber}`
        );
        await appendOrderEvent({
          orderId,
          type: "tracking_received",
          message: track.trackingNumber,
          phase: "TRACKING_RECEIVED",
        });
        await notifyOrderCustomer({
          orderId,
          kind: "tracking_received",
          detail: track.trackingNumber,
        });
        return {
          orderId,
          from: "ORDERED",
          to: "TRACKING_RECEIVED",
          didWork: true,
          message: track.trackingNumber,
        };
      }
      return {
        orderId,
        from: "ORDERED",
        to: "ORDERED",
        didWork: false,
        message: "Venter på tracking fra CJ",
      };
    }

    case "TRACKING_RECEIVED": {
      await transitionPhase(
        orderId,
        "TRACKING_RECEIVED",
        "SHIPPED",
        "Markert som sendt"
      );
      await appendOrderEvent({
        orderId,
        type: "shipped",
        message: "Sendt til kunde",
        phase: "SHIPPED",
      });
      await notifyOrderCustomer({ orderId, kind: "shipped" });
      return {
        orderId,
        from: "TRACKING_RECEIVED",
        to: "SHIPPED",
        didWork: true,
        message: "Shipped",
      };
    }

    case "SHIPPED": {
      // Stay shipped until delivery confirmation exists (tracking / carrier).
      // Architecture phase: park here — DELIVERED/COMPLETED via later ticks.
      return {
        orderId,
        from: "SHIPPED",
        to: "SHIPPED",
        didWork: false,
        message: "Venter på leveringsbekreftelse",
      };
    }

    case "DELIVERED": {
      await transitionPhase(
        orderId,
        "DELIVERED",
        "COMPLETED",
        "Ordreflyt fullført"
      );
      await appendOrderEvent({
        orderId,
        type: "completed",
        message: "Completed",
        phase: "COMPLETED",
      });
      await notifyOrderCustomer({ orderId, kind: "delivered" });
      return {
        orderId,
        from: "DELIVERED",
        to: "COMPLETED",
        didWork: true,
        message: "Completed",
      };
    }

    case "ADDRESS_ERROR":
    case "WAITING_FOR_STOCK":
    case "CJ_ERROR":
    case "MANUAL_REVIEW":
    case "PAYMENT_FAILED":
    case "COMPLETED":
      return {
        orderId,
        from: phase,
        to: phase,
        didWork: false,
        message: `Parkert i ${phase}`,
      };

    default:
      return {
        orderId,
        from: phase,
        to: phase,
        didWork: false,
        message: `Ingen handling for ${phase}`,
      };
  }
}

/**
 * Order Brain tick unit — rebuild memory from order history.
 * Does not refund, cancel, or message customers.
 */
export async function advanceOrderBrain(): Promise<{
  memoryScore: number;
  ordersSeen: number;
  delayed: number;
  message: string;
}> {
  const { rebuildOrderMemory } = await import("./order-memory");
  const memory = await rebuildOrderMemory();
  return {
    memoryScore: memory.stats.memoryScore,
    ordersSeen: memory.stats.ordersSeen,
    delayed: memory.stats.delayed,
    message: `Order Memory ${memory.stats.memoryScore}/100 · ${memory.stats.ordersSeen} ordre · ${memory.stats.delayed} forsinket`,
  };
}

export type { OrderAutomationPhase };
