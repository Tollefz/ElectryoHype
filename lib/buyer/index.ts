/**
 * Digital Buyer — public surface.
 */

export type * from "@/lib/buyer/types";
export { DEFAULT_BUYER_FILTER } from "@/lib/buyer/types";
export {
  CATEGORY_MISSIONS,
  QUANTITY_OPTIONS,
  MISSION_SIZE_OPTIONS,
  MISSION_STAGE_ORDER,
  REJECT_BUCKET_LABELS,
  getCategoryMission,
  parseScanRequest,
  stageLabel,
} from "@/lib/buyer/category-missions";
export type {
  BuyerMissionSize,
  BuyerMissionHistoryRow,
  BuyerQuantityChoice,
  BuyerScanProgress,
  BuyerScanResultSummary,
  CategoryMissionDef,
} from "@/lib/buyer/category-missions";
export {
  buildProductHuntReport,
  formatHuntReportText,
  parseHuntReport,
} from "@/lib/buyer/hunt-report";
export type {
  ProductHuntReport,
  HuntReportShareRow,
  HuntReportAverages,
} from "@/lib/buyer/hunt-report";
export {
  buildDiscoveryDecisionRecord,
  buildDiscoverySummary,
  formatDiscoveryDecisionLog,
  formatDiscoverySummaryText,
  parseDiscoveryValidation,
} from "@/lib/buyer/discovery-validation";
export type {
  DiscoveryDecisionRecord,
  DiscoverySummary,
  DiscoveryObservedMetrics,
} from "@/lib/buyer/discovery-validation";
export { computeShopMatch } from "@/lib/buyer/match";
export {
  buildCatalogSnapshot,
  rankByAssortmentMerchandising,
  scoreAssortmentFit,
  scoreCoverageAgainstTarget,
  computeMerchandisingScore,
} from "@/lib/buyer/assortment-score";
export { filterBuyerCandidate } from "@/lib/buyer/filter";
export { productFingerprint } from "@/lib/buyer/fingerprint";
export { tagDiscovery, summarizeDiscovery } from "@/lib/buyer/discovery";
export {
  startBuyerScan,
  processBuyerScanBatch,
  finalizeBuyerScan,
  getLatestBuyerScan,
  listBuyerRanking,
  listBuyerMissionHistory,
  ensureNightDeepScan,
  drainBuyerScan,
  supersedeActiveBuyerScans,
  resolveBuyerRankingScanId,
  pauseBuyerMission,
  resumeBuyerMission,
  stopBuyerMission,
  getLiveMissionSnapshot,
} from "@/lib/buyer/scan";
export {
  tickBuyerHuntWorker,
  getBuyerHuntWorkerStatus,
  runBuyerHuntWorkerLoop,
  BUYER_HUNT_WORKER_SETTING_KEY,
} from "@/lib/buyer/buyer-worker";
export type { BuyerHuntWorkerMetrics } from "@/lib/buyer/buyer-worker";
export { getMissionControlSnapshot } from "@/lib/buyer/mission-control";
export type { MissionControlSnapshot } from "@/lib/buyer/mission-control";
export {
  getAiMemory,
  rebuildAiMemory,
  scoreAiMemory,
  applyAiMemoryNudge,
  MEMORY_NUDGE_MAX,
  AI_MEMORY_SETTING_KEY,
} from "@/lib/buyer/ai-memory";
export type {
  AiMemorySnapshot,
  AiMemoryNudge,
  AiMemoryPattern,
} from "@/lib/buyer/ai-memory";
export {
  getStoreDna,
  rebuildStoreDna,
  scoreStoreDna,
  applyStoreDnaNudge,
  DNA_NUDGE_MAX,
  STORE_DNA_SETTING_KEY,
} from "@/lib/buyer/store-dna";
export type {
  StoreDnaSnapshot,
  StoreDnaNudge,
  StoreDnaTrait,
} from "@/lib/buyer/store-dna";
export {
  getAiFeedback,
  rebuildAiFeedback,
  scoreAiFeedback,
  applyAiFeedbackNudge,
  FEEDBACK_NUDGE_MAX,
  AI_FEEDBACK_SETTING_KEY,
} from "@/lib/buyer/ai-feedback";
export type {
  AiFeedbackSnapshot,
  AiFeedbackNudge,
  FeedbackExperience,
} from "@/lib/buyer/ai-feedback";
export { importTopBuyerCandidates, importBuyerCandidatesByIds } from "@/lib/buyer/bulk";
export {
  getBuyerReviewOverview,
  listBuyerReviewPage,
  listBuyerReviewIds,
  resolveBuyerSelectionIds,
  decideBuyerCandidates,
} from "@/lib/buyer/review-board";
export type {
  BuyerReviewOverview,
  BuyerReviewGroupId,
  BuyerReviewSort,
} from "@/lib/buyer/review-types";
export type { BuyerReviewPageResult } from "@/lib/buyer/review-board";
export {
  findAlternativeSuppliers,
  listOpenAltOffers,
  decideAltOffer,
} from "@/lib/buyer/alternatives";
export {
  refreshProductLifecycles,
  getLifecycleCounts,
} from "@/lib/buyer/lifecycle";
