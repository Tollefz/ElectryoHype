/**
 * Order Dashboard — lifecycle rollups (facts only).
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { isErrorPhase, type AutomationPhase } from "./order-state-machine";
import { isDelayedOrder } from "./order-memory";

export type OrderDashboard = {
  rangeDays: number;
  orders24h: number;
  processing: number;
  shipped: number;
  delivered24h: number;
  delayed: number;
  exceptions: number;
  cancelled7d: number;
  needsAttention: number;
  empty: boolean;
};

export async function getOrderDashboard(): Promise<OrderDashboard> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 86400000);
  const paid = {
    paymentStatus: "paid" as const,
    archivedAt: null,
    isTestOrder: false,
  };

  const [
    orders24h,
    processing,
    shipped,
    delivered24h,
    cancelled7d,
    openOrders,
  ] = await Promise.all([
    prisma.order.count({
      where: { ...paid, createdAt: { gte: since24h } },
    }),
    prisma.order.count({
      where: {
        ...paid,
        automationPhase: {
          in: [
            "NEW",
            "PAID",
            "VALIDATING",
            "READY_FOR_CJ",
            "SENT_TO_CJ",
            "ORDERED",
            "WAITING_FOR_RETRY",
            "WAITING_FOR_STOCK",
          ],
        },
      },
    }),
    prisma.order.count({
      where: {
        ...paid,
        OR: [
          { automationPhase: { in: ["TRACKING_RECEIVED", "SHIPPED"] } },
          { fulfillmentStatus: "SHIPPED" },
        ],
      },
    }),
    prisma.order.count({
      where: {
        ...paid,
        OR: [
          { automationPhase: { in: ["DELIVERED", "COMPLETED"] } },
          { fulfillmentStatus: "DELIVERED" },
        ],
        updatedAt: { gte: since24h },
      },
    }),
    prisma.order.count({
      where: {
        archivedAt: null,
        isTestOrder: false,
        OR: [
          { fulfillmentStatus: "CANCELLED" },
          { automationPhase: "PAYMENT_FAILED" },
        ],
        updatedAt: { gte: since7d },
      },
    }),
    prisma.order.findMany({
      where: {
        ...paid,
        fulfillmentStatus: { notIn: ["DELIVERED", "CANCELLED"] },
        automationPhase: { notIn: ["COMPLETED", "DELIVERED"] },
      },
      select: {
        automationPhase: true,
        automationPhaseAt: true,
        createdAt: true,
        trackingNumber: true,
        fulfillmentStatus: true,
      },
      take: 500,
    }),
  ]);

  const delayed = openOrders.filter((o) => isDelayedOrder(o)).length;
  const exceptions = openOrders.filter((o) =>
    isErrorPhase(o.automationPhase as AutomationPhase)
  ).length;
  const needsAttention = delayed + exceptions;

  const empty =
    orders24h === 0 &&
    processing === 0 &&
    shipped === 0 &&
    delayed === 0 &&
    exceptions === 0;

  return {
    rangeDays: 7,
    orders24h,
    processing,
    shipped,
    delivered24h,
    delayed,
    exceptions,
    cancelled7d,
    needsAttention,
    empty,
  };
}
