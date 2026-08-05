/**
 * AI Marketing Brain — separate from Product Buyer and Order Automation.
 * Analyse, learn, recommend only. Never publishes ads or spends money.
 */

export {
  ingestMarketingEvent,
  ingestMarketingEventBatch,
  reaggregateDailyStats,
  type MarketingIngestPayload,
} from "./marketing-events";

export {
  getMarketingDashboard,
  type MarketingDashboard,
} from "./marketing-dashboard";

export type {
  MarketingInsight,
  MarketingInsightKind,
} from "./marketing-insights";
export { getMarketingInsights } from "./marketing-insights";

export {
  getMarketingRecommendations,
  type MarketingRecommendation,
} from "./recommendations";

export {
  getMarketingDeskStatus,
  type MarketingDeskStatus,
} from "./desk-status";

export {
  computeMarketingProductScore,
  type MarketingScoreResult,
  type MarketingScoreInput,
} from "./marketing-score";

export {
  getMarketingBrainBoard,
  type MarketingBrainBoard,
  type BrainProductFact,
} from "./marketing-brain-board";

export {
  getWeeklyAdSuggestions,
  type WeeklyAdSuggestions,
  type AdChannelSuggestion,
  type AdProductSuggestion,
} from "./ad-suggestions";

export {
  rebuildMarketingMemory,
  getMarketingMemory,
  scoreMarketingMemoryNudge,
  marketingMemoryInsightsForProduct,
  normalizeChannel,
  seasonFromDate,
  MARKETING_MEMORY_NUDGE_MAX,
  type MarketingMemorySnapshot,
  type MarketingMemoryPattern,
  type MarketingMemoryStory,
} from "./marketing-memory";

export { advanceMarketingBrain } from "./marketing-engine";

export {
  tickMarketingWorker,
  runMarketingWorkerLoop,
  getMarketingWorkerStatus,
  MARKETING_WORKER_SETTING_KEY,
  type MarketingWorkerDeskStatus,
} from "./marketing-worker";

export { buildMarketingReport, type MarketingReport } from "./marketing-report";
