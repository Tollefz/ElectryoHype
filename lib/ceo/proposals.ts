/**
 * Approval Gate — Rob proposes; human decides.
 * Never executes publish, ads, refunds, prices, or emails.
 */

import type { CeoInsight, CeoProposal, CeoGateAction } from "./types";

const DETAILS_HREF: Record<string, string> = {
  buyer: "#desk-buyer",
  marketing: "#desk-marketing",
  orders: "#orders-today",
  finance: "#desk-finance",
  seo: "#desk-seo",
  customer: "#desk-customer",
};

function gateActionsFor(insight: CeoInsight): CeoGateAction[] {
  const detailsHref =
    insight.href || DETAILS_HREF[insight.domain] || "#rob-ceo";
  const actions: CeoGateAction[] = [];

  if (
    insight.domain === "buyer" &&
    (insight.id === "buyer-publish" || insight.id.includes("publish"))
  ) {
    actions.push({
      id: "publish",
      label: "Publiser",
      href: "#desk-publish",
    });
  } else if (insight.domain === "marketing" && insight.productId) {
    actions.push({
      id: "publish",
      label: "Annonser",
      href: insight.href || "#desk-marketing",
    });
  } else if (
    insight.priority === "critical" ||
    insight.priority === "high"
  ) {
    actions.push({
      id: "publish",
      label: "Følg opp",
      href: detailsHref,
    });
  }

  actions.push({ id: "ignore", label: "Ignorer" });
  actions.push({
    id: "details",
    label: "Vis detaljer",
    href: detailsHref,
  });

  return actions;
}

/**
 * Build gate proposals from prioritized insights only.
 * Low/"all quiet" items are not proposals.
 */
export function buildCeoProposals(priorities: CeoInsight[]): CeoProposal[] {
  return priorities
    .filter((i) => i.priority === "critical" || i.priority === "high")
    .slice(0, 8)
    .map((i) => ({
      id: `gate-${i.id}`,
      domain: i.domain,
      headline: i.headline,
      why: i.why,
      data: i.data,
      confidence: i.confidence,
      sourceAi: i.sourceAi,
      actions: gateActionsFor(i),
      href: i.href,
      productId: i.productId,
      orderId: i.orderId,
    }));
}
