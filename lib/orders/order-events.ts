/**
 * Order Automation — append-only event log.
 */

import "server-only";

import type { OrderAutomationPhase, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type OrderEventType =
  | "payment_received"
  | "validation_started"
  | "validated"
  | "validation_failed"
  | "ready_for_cj"
  | "sent_to_cj"
  | "cj_confirmed"
  | "cj_error"
  | "tracking_received"
  | "shipped"
  | "delivered"
  | "completed"
  | "customer_notified"
  | "retry_scheduled"
  | "manual_review"
  | "phase_changed"
  | "note";

export async function appendOrderEvent(input: {
  orderId: string;
  type: OrderEventType | string;
  message: string;
  phase?: OrderAutomationPhase | null;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.orderAutomationEvent.create({
    data: {
      orderId: input.orderId,
      type: input.type,
      message: input.message.slice(0, 2000),
      phase: input.phase ?? undefined,
      meta: input.meta ?? undefined,
    },
  });
}

export async function listOrderEvents(orderId: string, take = 50) {
  return prisma.orderAutomationEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    take,
  });
}
