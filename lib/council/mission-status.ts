/**
 * Mission Control — one unified status for the AI Management Team.
 */

import "server-only";

import { conveneCouncil } from "./convene";
import { listCouncilMembers } from "./registry";
import { ensureBuiltinCouncilMembers } from "./members";
import type {
  AiManagementMissionStatus,
  CouncilInsight,
  CouncilPriority,
  CouncilSession,
} from "./types";

const RANK: Record<CouncilPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sortPriorities(insights: CouncilInsight[]): CouncilInsight[] {
  return [...insights]
    .filter((i) => i.priority === "critical" || i.priority === "high")
    .sort(
      (a, b) =>
        RANK[a.priority] - RANK[b.priority] || b.confidence - a.confidence
    )
    .slice(0, 8);
}

export function buildMissionStatusFromSession(
  session: CouncilSession
): AiManagementMissionStatus {
  ensureBuiltinCouncilMembers();
  const defs = listCouncilMembers();
  const hrefById = new Map(defs.map((d) => [d.memberId, d.deskHref]));

  const reportingCount = session.members.filter(
    (m) => m.health !== "error" && m.health !== "offline"
  ).length;
  const criticalCount = session.insights.filter(
    (i) => i.priority === "critical"
  ).length;
  const proposalCount = session.insights.filter(
    (i) => i.kind === "proposal"
  ).length;
  const topPriorities = sortPriorities(session.insights);
  const errorCount = session.failures.length;

  let overall: AiManagementMissionStatus["overall"] = "green";
  if (reportingCount === 0) overall = "grey";
  else if (errorCount > 0 || criticalCount > 0) overall = "red";
  else if (proposalCount > 0 || topPriorities.length > 0) overall = "amber";

  const headline =
    overall === "grey"
      ? "AI-teamet har ikke rapportert ennå"
      : overall === "red"
        ? criticalCount > 0
          ? `${criticalCount} kritiske saker krever din beslutning`
          : `${errorCount} AI-er klarte ikke å rapportere`
        : overall === "amber"
          ? `${topPriorities.length} prioriteringer venter på Approval Gate`
          : "AI-teamet er rolig — ingen kritiske beslutninger";

  const narrative =
    overall === "green"
      ? "Buyer, Marketing, Orders, Finance, SEO og Customer har sendt fakta til Rob. Ingenting haster."
      : "Hver AI sender kun egne fakta. Rob prioriterer. Du godkjenner — ingen AI utfører butikkhandlinger.";

  return {
    generatedAt: session.convenedAt,
    overall,
    headline,
    narrative,
    memberCount: session.members.length,
    reportingCount,
    criticalCount,
    proposalCount,
    members: session.members.map((m) => {
      const top =
        [...m.insights]
          .sort(
            (a, b) =>
              RANK[a.priority] - RANK[b.priority] ||
              b.confidence - a.confidence
          )
          .find((i) => i.priority !== "low") || m.insights[0];
      return {
        memberId: m.memberId,
        label: m.label,
        sourceAi: m.sourceAi,
        health: m.health,
        summary: m.summary,
        insightCount: m.insights.length,
        topHeadline: top?.headline ?? null,
        href: hrefById.get(m.memberId) || "#rob-ceo",
      };
    }),
    topPriorities,
    session,
  };
}

export async function getAiManagementMissionStatus(): Promise<AiManagementMissionStatus> {
  const session = await conveneCouncil();
  return buildMissionStatusFromSession(session);
}
