/**
 * Council member registry — plug in new AI modules without changing Rob or Mission Control.
 */

import type { CouncilMemberDefinition, CouncilMemberId } from "./types";

const members = new Map<CouncilMemberId, CouncilMemberDefinition>();
const order: CouncilMemberId[] = [];

/**
 * Register (or replace) a council member.
 * Call once at module load from lib/council/members.ts.
 */
export function registerCouncilMember(def: CouncilMemberDefinition): void {
  if (!members.has(def.memberId)) {
    order.push(def.memberId);
  }
  members.set(def.memberId, def);
}

export function getCouncilMember(
  id: CouncilMemberId
): CouncilMemberDefinition | undefined {
  return members.get(id);
}

export function listCouncilMembers(): CouncilMemberDefinition[] {
  return order
    .map((id) => members.get(id))
    .filter((m): m is CouncilMemberDefinition => Boolean(m));
}

export function resetCouncilRegistryForTests(): void {
  members.clear();
  order.length = 0;
}
