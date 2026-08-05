/**
 * Prioritize across domains — Rob CEO lists what matters, not everything.
 */

import type { CeoInsight, CeoPriority } from "./types";

const RANK: Record<CeoPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Max bullets shown per domain in the morning letter */
export const MAX_PER_DOMAIN = 2;

/** Max cross-domain priorities in the top strip */
export const MAX_PRIORITIES = 6;

/** Skip "all quiet" low items when higher signal exists in same domain */
export function pickDomainLines(insights: CeoInsight[]): CeoInsight[] {
  const sorted = [...insights].sort(
    (a, b) => RANK[a.priority] - RANK[b.priority] || b.confidence - a.confidence
  );
  const actionable = sorted.filter((i) => i.priority !== "low");
  if (actionable.length > 0) {
    return actionable.slice(0, MAX_PER_DOMAIN);
  }
  return sorted.slice(0, 1);
}

export function pickGlobalPriorities(all: CeoInsight[]): CeoInsight[] {
  return [...all]
    .filter((i) => i.priority === "critical" || i.priority === "high")
    .sort(
      (a, b) => RANK[a.priority] - RANK[b.priority] || b.confidence - a.confidence
    )
    .slice(0, MAX_PRIORITIES);
}
