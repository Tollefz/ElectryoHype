/**
 * Rob CEO — gathers facts via AI Council (not hardcoded brain fan-out).
 * Never invents. Never executes.
 */

import "server-only";

import { conveneCouncil } from "@/lib/council/convene";
import type { CouncilInsight, CouncilSession } from "@/lib/council/types";
import { buildCeoMorningBrief, emptyCeoBrief } from "./brief";
import type { CeoDeskStatus, CeoDomain, CeoInsight } from "./types";

function councilToCeoInsight(i: CouncilInsight): CeoInsight {
  return {
    id: i.id,
    domain: i.memberId as CeoDomain,
    priority: i.priority,
    headline: i.headline,
    why: i.why,
    data: i.data,
    confidence: i.confidence,
    sourceAi: i.sourceAi,
    href: i.href,
    productId: i.productId,
    orderId: i.orderId,
  };
}

export function buildCeoDeskStatusFromSession(
  session: CouncilSession
): CeoDeskStatus {
  const sourceErrors: Partial<Record<CeoDomain, string>> = {};
  for (const f of session.failures) {
    sourceErrors[f.memberId as CeoDomain] = f.error;
  }

  const members = session.members.map((m) => ({
    domain: m.memberId as CeoDomain,
    label: m.label,
    sourceAi: m.sourceAi,
    insights: m.insights.map(councilToCeoInsight),
    error: m.error,
  }));

  const brief = buildCeoMorningBrief({ members });
  const errorCount = session.failures.length;
  const memberCount = session.members.length;

  let status: CeoDeskStatus["status"] = "ready";
  if (memberCount > 0 && errorCount >= memberCount) status = "error";
  else if (errorCount > 0) status = "partial";
  else if (brief.priorities.length === 0) status = "waiting";

  return { status, brief, sourceErrors };
}

/**
 * Build full CEO desk status via AI Council convene.
 * Prefer calling from /api/admin/ceo — do not block dashboard SSR.
 */
export async function getCeoDeskStatus(): Promise<CeoDeskStatus> {
  const session = await conveneCouncil();
  return buildCeoDeskStatusFromSession(session);
}

export function ceoStatusFallback(message?: string): CeoDeskStatus {
  return {
    status: "error",
    brief: emptyCeoBrief(message || "Rob CEO kunne ikke lese butikkdata."),
    sourceErrors: {
      buyer: message,
      marketing: message,
      orders: message,
      finance: message,
      seo: message,
      customer: message,
    },
  };
}
