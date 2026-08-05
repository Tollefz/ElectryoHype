/**
 * AI Council / Management Team — collaboration layer (not new AIs).
 */

export type {
  CouncilMemberId,
  CouncilPriority,
  HumanApprovalKind,
  CouncilInsight,
  CouncilMemberHealth,
  CouncilMemberReport,
  CouncilMemberDefinition,
  CouncilSession,
  AiManagementMissionStatus,
} from "./types";

export {
  registerCouncilMember,
  getCouncilMember,
  listCouncilMembers,
  resetCouncilRegistryForTests,
} from "./registry";

export { ensureBuiltinCouncilMembers } from "./members";
export { conveneCouncil } from "./convene";
export {
  getAiManagementMissionStatus,
  buildMissionStatusFromSession,
} from "./mission-status";
