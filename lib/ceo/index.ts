/**
 * Rob CEO — ElectroHypeX managing director.
 * Reads Buyer, Marketing, Orders, Finance, SEO, Customer.
 * Facts only. Approval Gate only — never executes.
 */

export type {
  CeoDomain,
  CeoPriority,
  CeoInsight,
  CeoGateActionId,
  CeoGateAction,
  CeoProposal,
  CeoDomainSection,
  CeoMorningBrief,
  CeoDeskStatus,
} from "./types";

export {
  extractBuyerInsights,
  extractMarketingInsights,
  extractOrderInsights,
  extractFinanceInsights,
  extractSeoInsights,
  extractCustomerInsights,
} from "./extract";

export { pickDomainLines, pickGlobalPriorities } from "./prioritize";
export { buildCeoProposals } from "./proposals";
export { buildCeoMorningBrief, emptyCeoBrief } from "./brief";
export type { CeoBriefMemberInput } from "./brief";
export {
  getCeoDeskStatus,
  ceoStatusFallback,
  buildCeoDeskStatusFromSession,
} from "./ceo-desk-status";
