/**
 * Order Brain desk snapshot — facts for Rob's Desk.
 * Separate from Buyer and Marketing. Observation only.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getOrderAutomationDeskStatus,
  type OrderWorkerDeskStatus,
} from "./order-worker";
import { getOrderDashboard } from "./order-dashboard";
import { getOrderInsights, type OrderInsight } from "./order-insights";
import { getOrderMemory, isDelayedOrder, type OrderMemorySnapshot } from "./order-memory";
import { buildOrderReport, type OrderReport } from "./order-report";
import {
  isErrorPhase,
  phaseLabelNb,
  type AutomationPhase,
} from "./order-state-machine";

export type OrderBrainAttentionItem = {
  orderId: string;
  orderNumber: string;
  reason: string;
  fact: string;
  phase: string;
  severity: "attention" | "delayed" | "high_risk" | "tracking";
};

export type OrderBrainDeskStatus = {
  status: "learning" | "ready" | "waiting" | "error";
  worker: OrderWorkerDeskStatus;
  narrative: string;
  report: OrderReport;
  dashboard: Awaited<ReturnType<typeof getOrderDashboard>>;
  insights: OrderInsight[];
  memory: {
    memoryScore: number;
    rebuiltAt: string;
    stories: OrderMemorySnapshot["stories"];
    suppliers: OrderMemorySnapshot["suppliers"];
    families: OrderMemorySnapshot["families"];
    carriers: OrderMemorySnapshot["carriers"];
  };
  needsAttention: OrderBrainAttentionItem[];
  delayed: OrderBrainAttentionItem[];
  highRisk: OrderBrainAttentionItem[];
  supplierIssues: Array<{
    supplier: string;
    fact: string;
    polarity: string;
  }>;
  trackingGaps: OrderBrainAttentionItem[];
  errors: string[];
};

export async function getOrderBrainDeskStatus(): Promise<OrderBrainDeskStatus> {
  const errors: string[] = [];
  try {
    const [worker, dashboard, insights, memory, openOrders] = await Promise.all([
      getOrderAutomationDeskStatus(),
      getOrderDashboard(),
      getOrderInsights(),
      getOrderMemory(),
      prisma.order.findMany({
        where: {
          paymentStatus: "paid",
          archivedAt: null,
          isTestOrder: false,
          fulfillmentStatus: { notIn: ["DELIVERED", "CANCELLED"] },
          automationPhase: { notIn: ["COMPLETED", "DELIVERED"] },
        },
        select: {
          id: true,
          orderNumber: true,
          automationPhase: true,
          automationPhaseAt: true,
          createdAt: true,
          trackingNumber: true,
          fulfillmentStatus: true,
          automationLastError: true,
          shippingCarrier: true,
          orderItems: {
            select: {
              product: { select: { supplierName: true, name: true } },
            },
            take: 3,
          },
        },
        take: 200,
        orderBy: { updatedAt: "asc" },
      }),
    ]);

    const delayed: OrderBrainAttentionItem[] = [];
    const highRisk: OrderBrainAttentionItem[] = [];
    const trackingGaps: OrderBrainAttentionItem[] = [];
    const needsAttention: OrderBrainAttentionItem[] = [];

    for (const o of openOrders) {
      const phase = phaseLabelNb(o.automationPhase as AutomationPhase);
      const delayedFlag = isDelayedOrder(o);
      const errorFlag = isErrorPhase(o.automationPhase as AutomationPhase);
      const gapFlag =
        (o.automationPhase === "ORDERED" ||
          o.automationPhase === "SENT_TO_CJ" ||
          o.fulfillmentStatus === "ORDERED_FROM_SUPPLIER") &&
        !o.trackingNumber;

      if (delayedFlag) {
        const item: OrderBrainAttentionItem = {
          orderId: o.id,
          orderNumber: o.orderNumber,
          reason: "Forsinket",
          fact: `${phase} · fase siden ${
            (o.automationPhaseAt || o.createdAt).toLocaleDateString("nb-NO")
          }${o.trackingNumber ? "" : " · mangler tracking"}`,
          phase,
          severity: "delayed",
        };
        delayed.push(item);
        needsAttention.push(item);
      }

      if (errorFlag) {
        const item: OrderBrainAttentionItem = {
          orderId: o.id,
          orderNumber: o.orderNumber,
          reason: "Høy risiko / avvik",
          fact: `${phase}${
            o.automationLastError
              ? ` — ${o.automationLastError.slice(0, 80)}`
              : ""
          }`,
          phase,
          severity: "high_risk",
        };
        highRisk.push(item);
        needsAttention.push(item);
      }

      if (gapFlag && !delayedFlag) {
        const item: OrderBrainAttentionItem = {
          orderId: o.id,
          orderNumber: o.orderNumber,
          reason: "Tracking-avvik",
          fact: `Bestilt hos leverandør uten trackingnummer (${phase})`,
          phase,
          severity: "tracking",
        };
        trackingGaps.push(item);
        needsAttention.push(item);
      }
    }

    const supplierIssues = memory.suppliers
      .filter((s) => s.polarity === "negative")
      .slice(0, 5)
      .map((s) => ({
        supplier: s.supplier,
        fact: s.why,
        polarity: s.polarity,
      }));

    const report = buildOrderReport({
      dashboard,
      insights,
      memory,
      workerStatus: worker.status,
    });

    let status: OrderBrainDeskStatus["status"] = "waiting";
    if (!dashboard.empty) {
      status = dashboard.needsAttention > 0 ? "learning" : "ready";
    }

    return {
      status,
      worker,
      narrative: report.summary,
      report,
      dashboard,
      insights,
      memory: {
        memoryScore: memory.stats.memoryScore,
        rebuiltAt: memory.rebuiltAt,
        stories: memory.stories.slice(0, 8),
        suppliers: memory.suppliers.slice(0, 8),
        families: memory.families.slice(0, 6),
        carriers: memory.carriers.slice(0, 6),
      },
      needsAttention: dedupeAttention(needsAttention).slice(0, 12),
      delayed: delayed.slice(0, 8),
      highRisk: highRisk.slice(0, 8),
      supplierIssues,
      trackingGaps: trackingGaps.slice(0, 8),
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    const worker = await getOrderAutomationDeskStatus().catch(() => ({
      status: "stopped" as const,
      lastTickAt: null,
      tickAgeMs: -1,
      lastWorkerId: null,
      lastBatch: null,
      counts: {
        queue: 0,
        validating: 0,
        cj: 0,
        tracking: 0,
        retry: 0,
        errors: 0,
        completedToday: 0,
        ordersToday: 0,
      },
    }));
    return {
      status: "error",
      worker,
      narrative: "Order Brain kunne ikke lese ordre-data.",
      report: {
        generatedAt: new Date().toISOString(),
        headline: "Feil",
        summary: message,
        bullets: [],
      },
      dashboard: {
        rangeDays: 7,
        orders24h: 0,
        processing: 0,
        shipped: 0,
        delivered24h: 0,
        delayed: 0,
        exceptions: 0,
        cancelled7d: 0,
        needsAttention: 0,
        empty: true,
      },
      insights: [],
      memory: {
        memoryScore: 0,
        rebuiltAt: new Date().toISOString(),
        stories: [],
        suppliers: [],
        families: [],
        carriers: [],
      },
      needsAttention: [],
      delayed: [],
      highRisk: [],
      supplierIssues: [],
      trackingGaps: [],
      errors,
    };
  }
}

function dedupeAttention(
  items: OrderBrainAttentionItem[]
): OrderBrainAttentionItem[] {
  const seen = new Set<string>();
  const out: OrderBrainAttentionItem[] = [];
  for (const i of items) {
    const key = `${i.orderId}:${i.severity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}
