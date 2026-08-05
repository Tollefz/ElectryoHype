/**
 * Order Insights — facts about the order lifecycle (no LLM, no auto-refunds).
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { phaseLabelNb, isErrorPhase, type AutomationPhase } from "./order-state-machine";
import { isDelayedOrder } from "./order-memory";

export type OrderInsightKind =
  | "orders_24h"
  | "processing"
  | "shipped"
  | "delivered"
  | "delayed"
  | "exceptions"
  | "cancelled"
  | "info";

export type OrderInsight = {
  id: string;
  kind: OrderInsightKind;
  question: string;
  title: string;
  detail: string;
  why: string;
  count: number;
  tone: "positive" | "warning" | "neutral";
  sampleOrderNumbers?: string[];
};

/**
 * Build story-style order insights from fulfillment facts.
 */
export async function getOrderInsights(): Promise<OrderInsight[]> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const insights: OrderInsight[] = [];

  const paidWhere = {
    paymentStatus: "paid" as const,
    archivedAt: null,
    isTestOrder: false,
  };

  const [
    last24h,
    processing,
    shipped,
    delivered,
    cancelled,
    openOrders,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { ...paidWhere, createdAt: { gte: since24h } },
      select: { orderNumber: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.order.findMany({
      where: {
        ...paidWhere,
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
      select: {
        orderNumber: true,
        automationPhase: true,
        automationPhaseAt: true,
        createdAt: true,
        trackingNumber: true,
        fulfillmentStatus: true,
      },
      take: 100,
    }),
    prisma.order.findMany({
      where: {
        ...paidWhere,
        OR: [
          { automationPhase: { in: ["TRACKING_RECEIVED", "SHIPPED"] } },
          { fulfillmentStatus: "SHIPPED" },
        ],
      },
      select: {
        orderNumber: true,
        trackingNumber: true,
        automationPhase: true,
        automationPhaseAt: true,
        createdAt: true,
        fulfillmentStatus: true,
      },
      take: 100,
    }),
    prisma.order.findMany({
      where: {
        ...paidWhere,
        OR: [
          { automationPhase: { in: ["DELIVERED", "COMPLETED"] } },
          { fulfillmentStatus: "DELIVERED" },
        ],
        updatedAt: { gte: since24h },
      },
      select: { orderNumber: true },
      take: 50,
    }),
    prisma.order.findMany({
      where: {
        archivedAt: null,
        isTestOrder: false,
        OR: [
          { fulfillmentStatus: "CANCELLED" },
          { automationPhase: "PAYMENT_FAILED" },
        ],
        updatedAt: { gte: new Date(Date.now() - 7 * 86400000) },
      },
      select: { orderNumber: true, automationPhase: true, fulfillmentStatus: true },
      take: 50,
    }),
    prisma.order.findMany({
      where: {
        ...paidWhere,
        fulfillmentStatus: { notIn: ["DELIVERED", "CANCELLED"] },
        automationPhase: { notIn: ["COMPLETED", "DELIVERED"] },
      },
      select: {
        orderNumber: true,
        automationPhase: true,
        automationPhaseAt: true,
        createdAt: true,
        trackingNumber: true,
        fulfillmentStatus: true,
        automationLastError: true,
      },
      take: 200,
    }),
  ]);

  insights.push({
    id: "orders-24h",
    kind: "orders_24h",
    question: "Ordre siste døgn?",
    title: `${last24h.length} betalte ordre siste 24 timer`,
    detail:
      last24h.length === 0
        ? "Ingen nye betalte ordre siste døgn."
        : `Eksempler: ${last24h
            .slice(0, 5)
            .map((o) => o.orderNumber)
            .join(", ")}`,
    why: "Telt fra Order.createdAt med paymentStatus=paid (ekskl. test/arkiv).",
    count: last24h.length,
    tone: last24h.length > 0 ? "positive" : "neutral",
    sampleOrderNumbers: last24h.slice(0, 5).map((o) => o.orderNumber),
  });

  insights.push({
    id: "processing",
    kind: "processing",
    question: "Ordre under behandling?",
    title: `${processing.length} ordre under behandling`,
    detail:
      processing.length === 0
        ? "Ingen aktive behandlingsfaser akkurat nå."
        : `Faser: ${summarizePhases(processing.map((o) => o.automationPhase))}`,
    why: "Ordre i NEW→ORDERED / retry / stock — fortsatt ikke sendt til kunde.",
    count: processing.length,
    tone: processing.length > 10 ? "warning" : "neutral",
    sampleOrderNumbers: processing.slice(0, 5).map((o) => o.orderNumber),
  });

  insights.push({
    id: "shipped",
    kind: "shipped",
    question: "Sendt?",
    title: `${shipped.length} ordre sendt / med tracking`,
    detail:
      shipped.length === 0
        ? "Ingen ordre i sendt-fase."
        : `${shipped.filter((o) => o.trackingNumber).length} har trackingnummer.`,
    why: "automationPhase TRACKING_RECEIVED/SHIPPED eller fulfillmentStatus SHIPPED.",
    count: shipped.length,
    tone: "positive",
    sampleOrderNumbers: shipped.slice(0, 5).map((o) => o.orderNumber),
  });

  insights.push({
    id: "delivered",
    kind: "delivered",
    question: "Levert?",
    title: `${delivered.length} levert siste 24 timer`,
    detail:
      delivered.length === 0
        ? "Ingen leveranser registrert siste døgn."
        : `Oppdatert til DELIVERED/COMPLETED: ${delivered
            .slice(0, 5)
            .map((o) => o.orderNumber)
            .join(", ")}`,
    why: "Basert på phase/fulfillment oppdatert siste 24 timer.",
    count: delivered.length,
    tone: delivered.length > 0 ? "positive" : "neutral",
    sampleOrderNumbers: delivered.slice(0, 5).map((o) => o.orderNumber),
  });

  const delayed = openOrders.filter((o) => isDelayedOrder(o));
  insights.push({
    id: "delayed",
    kind: "delayed",
    question: "Forsinket?",
    title: `${delayed.length} forsinkede ordre`,
    detail:
      delayed.length === 0
        ? "Ingen ordre over forsinkelses-terskel (≥5d uten tracking, eller ≥14d i SHIPPED)."
        : delayed
            .slice(0, 5)
            .map(
              (o) =>
                `${o.orderNumber} (${phaseLabelNb(o.automationPhase as AutomationPhase)})`
            )
            .join(" · "),
    why: "Fakta: dager i fase uten tracking / uten levering over terskel.",
    count: delayed.length,
    tone: delayed.length > 0 ? "warning" : "positive",
    sampleOrderNumbers: delayed.slice(0, 5).map((o) => o.orderNumber),
  });

  const exceptions = openOrders.filter((o) =>
    isErrorPhase(o.automationPhase as AutomationPhase)
  );
  insights.push({
    id: "exceptions",
    kind: "exceptions",
    question: "Avvik?",
    title: `${exceptions.length} ordre med avvik`,
    detail:
      exceptions.length === 0
        ? "Ingen error-faser (CJ/adresse/lager/manual review)."
        : exceptions
            .slice(0, 5)
            .map(
              (o) =>
                `${o.orderNumber}: ${phaseLabelNb(o.automationPhase as AutomationPhase)}${
                  o.automationLastError
                    ? ` — ${o.automationLastError.slice(0, 60)}`
                    : ""
                }`
            )
            .join(" · "),
    why: "automationPhase i CJ_ERROR, ADDRESS_ERROR, WAITING_FOR_STOCK, PAYMENT_FAILED, MANUAL_REVIEW.",
    count: exceptions.length,
    tone: exceptions.length > 0 ? "warning" : "positive",
    sampleOrderNumbers: exceptions.slice(0, 5).map((o) => o.orderNumber),
  });

  insights.push({
    id: "cancelled",
    kind: "cancelled",
    question: "Kansellert?",
    title: `${cancelled.length} kansellerte / feilet betaling (7d)`,
    detail:
      cancelled.length === 0
        ? "Ingen kanselleringer siste 7 dager."
        : cancelled
            .slice(0, 5)
            .map((o) => o.orderNumber)
            .join(", "),
    why: "fulfillmentStatus=CANCELLED eller phase=PAYMENT_FAILED, oppdatert siste 7d.",
    count: cancelled.length,
    tone: cancelled.length > 3 ? "warning" : "neutral",
    sampleOrderNumbers: cancelled.slice(0, 5).map((o) => o.orderNumber),
  });

  if (insights.every((i) => i.count === 0 && i.kind !== "info")) {
    insights.unshift({
      id: "waiting",
      kind: "info",
      question: "Hva skjer med ordrene?",
      title: "Order Brain venter på signal",
      detail:
        "Når betalte ordre kommer inn, forklarer jeg behandling, forsendelse, forsinkelser og avvik — uten å refundere eller bestemme for kunden.",
      why: "Ingen betalte non-test ordre i snapshot.",
      count: 0,
      tone: "neutral",
    });
  }

  return insights;
}

function summarizePhases(phases: string[]): string {
  const map = new Map<string, number>();
  for (const p of phases) {
    map.set(p, (map.get(p) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p, n]) => `${phaseLabelNb(p as AutomationPhase)} ${n}`)
    .join(", ");
}
