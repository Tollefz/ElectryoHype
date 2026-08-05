/**
 * Convene the AI Council — each member sends insights to Rob in parallel.
 */

import "server-only";

import { listCouncilMembers } from "./registry";
import { ensureBuiltinCouncilMembers } from "./members";
import type {
  CouncilMemberId,
  CouncilMemberReport,
  CouncilSession,
} from "./types";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Ask every registered member for facts. One failure does not block others.
 */
export async function conveneCouncil(): Promise<CouncilSession> {
  ensureBuiltinCouncilMembers();
  const defs = listCouncilMembers();
  const convenedAt = new Date().toISOString();

  const settled = await Promise.allSettled(
    defs.map(async (def) => {
      const partial = await def.collect();
      const report: CouncilMemberReport = {
        memberId: def.memberId,
        label: def.label,
        sourceAi: def.sourceAi,
        health: partial.health,
        summary: partial.summary,
        insights: (partial.insights || []).map((i) => ({
          ...i,
          memberId: i.memberId || def.memberId,
          sourceAi: i.sourceAi || def.sourceAi,
        })),
        error: partial.error,
        collectedAt: convenedAt,
      };
      return report;
    })
  );

  const members: CouncilMemberReport[] = [];
  const failures: Array<{ memberId: CouncilMemberId; error: string }> = [];

  settled.forEach((result, idx) => {
    const def = defs[idx];
    if (result.status === "fulfilled") {
      members.push(result.value);
      return;
    }
    const error = errMsg(result.reason);
    failures.push({ memberId: def.memberId, error });
    members.push({
      memberId: def.memberId,
      label: def.label,
      sourceAi: def.sourceAi,
      health: "error",
      summary: `Kunne ikke rapportere: ${error}`,
      insights: [],
      error,
      collectedAt: convenedAt,
    });
  });

  const insights = members.flatMap((m) =>
    m.health === "error" ? [] : m.insights
  );

  return { convenedAt, members, insights, failures };
}
