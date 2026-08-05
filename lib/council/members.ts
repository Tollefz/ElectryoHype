/**
 * Built-in AI Council members.
 * Adapters only — reuse existing desk status + CEO extractors. No new brains.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { ImportQueueStatus } from "@prisma/client";
import { getDigitalBuyerDeskStatus } from "@/lib/buyer/desk-status";
import { getMarketingDeskStatus } from "@/lib/marketing/desk-status";
import { getOrderBrainDeskStatus } from "@/lib/orders/order-desk-status";
import { getFinanceDeskStatus } from "@/lib/finance/finance-desk-status";
import { getCustomerDeskStatus } from "@/lib/customer/customer-desk-status";
import { getSeoDeskStatus } from "@/lib/seo-brain/seo-desk-status";
import {
  extractBuyerInsights,
  extractMarketingInsights,
  extractOrderInsights,
  extractFinanceInsights,
  extractSeoInsights,
  extractCustomerInsights,
} from "@/lib/ceo/extract";
import type { CeoInsight } from "@/lib/ceo/types";
import { registerCouncilMember } from "./registry";
import type {
  CouncilInsight,
  CouncilMemberHealth,
  HumanApprovalKind,
} from "./types";

let registered = false;

function mapApproval(insight: CeoInsight): HumanApprovalKind | undefined {
  if (insight.priority === "low") return undefined;
  switch (insight.domain) {
    case "buyer":
      if (insight.id.includes("publish")) return "publish_product";
      if (insight.id.includes("review") || insight.id.includes("candidates"))
        return "import_product";
      return "other_store_change";
    case "marketing":
      return "spend_ads";
    case "orders":
      return "refund_or_cancel";
    case "finance":
      return "change_price";
    case "seo":
      return "generate_seo_content";
    case "customer":
      return "send_email";
    default:
      return "other_store_change";
  }
}

function toCouncilInsight(insight: CeoInsight): CouncilInsight {
  const requiresApproval = mapApproval(insight);
  return {
    id: insight.id,
    memberId: insight.domain,
    sourceAi: insight.sourceAi,
    priority: insight.priority,
    headline: insight.headline,
    why: insight.why,
    data: insight.data,
    confidence: insight.confidence,
    kind: requiresApproval ? "proposal" : "observation",
    requiresApproval,
    href: insight.href,
    productId: insight.productId,
    orderId: insight.orderId,
  };
}

function healthFromStatus(
  status: string | undefined,
  hasCritical: boolean
): CouncilMemberHealth {
  if (!status) return "waiting";
  if (status === "error") return "error";
  if (status === "waiting") return "waiting";
  if (status === "learning" || hasCritical) return "learning";
  if (status === "ready" || status === "idle" || status === "running")
    return "ready";
  return "waiting";
}

async function importQueueCounts(): Promise<{
  review: number;
  approved: number;
}> {
  try {
    const [review, approved] = await Promise.all([
      prisma.importQueueItem.count({
        where: { status: ImportQueueStatus.review },
      }),
      prisma.importQueueItem.count({
        where: { status: ImportQueueStatus.approved },
      }),
    ]);
    return { review, approved };
  } catch {
    return { review: 0, approved: 0 };
  }
}

/**
 * Ensure built-in members are registered (idempotent).
 * Import this module (or call ensureBuiltinCouncilMembers) before convene.
 */
export function ensureBuiltinCouncilMembers(): void {
  if (registered) return;
  registered = true;

  registerCouncilMember({
    memberId: "buyer",
    label: "Buyer",
    sourceAi: "Buyer Brain",
    deskHref: "#desk-buyer",
    collect: async () => {
      const [status, queues] = await Promise.all([
        getDigitalBuyerDeskStatus(),
        importQueueCounts(),
      ]);
      const insights = extractBuyerInsights(status, queues).map(toCouncilInsight);
      const hasCritical = insights.some((i) => i.priority === "critical");
      return {
        health: healthFromStatus(
          status.trafficLight === "waiting_api"
            ? "learning"
            : status.trafficLight,
          hasCritical
        ),
        summary: status.nextStep || `Fase ${status.phase}`,
        insights,
      };
    },
  });

  registerCouncilMember({
    memberId: "marketing",
    label: "Marketing",
    sourceAi: "Marketing Brain",
    deskHref: "#desk-marketing",
    collect: async () => {
      const status = await getMarketingDeskStatus();
      const insights = extractMarketingInsights(status).map(toCouncilInsight);
      const hasCritical = insights.some((i) => i.priority === "critical");
      return {
        health: healthFromStatus(status.status, hasCritical),
        summary: status.narrative,
        insights,
      };
    },
  });

  registerCouncilMember({
    memberId: "orders",
    label: "Orders",
    sourceAi: "Order Brain",
    deskHref: "#orders-today",
    collect: async () => {
      const status = await getOrderBrainDeskStatus();
      const insights = extractOrderInsights(status).map(toCouncilInsight);
      const hasCritical = insights.some((i) => i.priority === "critical");
      return {
        health: healthFromStatus(status.status, hasCritical),
        summary: status.narrative,
        insights,
      };
    },
  });

  registerCouncilMember({
    memberId: "finance",
    label: "Finance",
    sourceAi: "Finance Brain",
    deskHref: "#desk-finance",
    collect: async () => {
      const status = await getFinanceDeskStatus();
      const insights = extractFinanceInsights(status).map(toCouncilInsight);
      const hasCritical = insights.some((i) => i.priority === "critical");
      return {
        health: healthFromStatus(status.status, hasCritical),
        summary: status.narrative,
        insights,
      };
    },
  });

  registerCouncilMember({
    memberId: "seo",
    label: "SEO",
    sourceAi: "SEO Brain",
    deskHref: "#desk-seo",
    collect: async () => {
      const status = await getSeoDeskStatus();
      const insights = extractSeoInsights(status).map(toCouncilInsight);
      const hasCritical = insights.some((i) => i.priority === "critical");
      return {
        health: healthFromStatus(status.status, hasCritical),
        summary: status.narrative,
        insights,
      };
    },
  });

  registerCouncilMember({
    memberId: "customer",
    label: "Customer",
    sourceAi: "Customer Brain",
    deskHref: "#desk-customer",
    collect: async () => {
      const status = await getCustomerDeskStatus();
      const insights = extractCustomerInsights(status).map(toCouncilInsight);
      const hasCritical = insights.some((i) => i.priority === "critical");
      return {
        health: healthFromStatus(status.status, hasCritical),
        summary: status.narrative,
        insights,
      };
    },
  });
}
