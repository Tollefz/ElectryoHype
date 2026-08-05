/**
 * AI Finance Brain — store economics (not accounting).
 * Separate from Buyer, Marketing, Order.
 * Analyse + recommend only. Never changes prices.
 */

export {
  getFinanceDashboard,
  type FinanceDashboard,
  type FinanceProductRow,
} from "./finance-dashboard";

export {
  getFinanceInsights,
  type FinanceInsight,
  type FinanceInsightKind,
} from "./finance-insights";

export {
  getFinanceRecommendations,
  type FinanceRecommendation,
} from "./finance-recommendations";

export {
  rebuildFinanceMemory,
  getFinanceMemory,
  FINANCE_MEMORY_SETTING_KEY,
  type FinanceMemorySnapshot,
  type FinanceMemoryStory,
} from "./finance-memory";

export { buildFinanceReport, type FinanceReport } from "./finance-report";

export { advanceFinanceBrain } from "./finance-engine";

export {
  tickFinanceWorker,
  runFinanceWorkerLoop,
  getFinanceWorkerStatus,
  FINANCE_WORKER_SETTING_KEY,
  type FinanceWorkerDeskStatus,
} from "./finance-worker";

export {
  getFinanceDeskStatus,
  type FinanceDeskStatus,
} from "./finance-desk-status";

export {
  getFinancePeriodBoards,
  periodKeyFromDays,
  daysFromPeriodKey,
  type FinancePeriodKey,
  type FinancePeriodSummary,
} from "./finance-periods";

export {
  appendFinanceEvent,
  listFinanceEvents,
  type FinanceEvent,
} from "./finance-events";

export {
  marginPct,
  profitNok,
  roiPct,
  estimateStripeFee,
  round2,
} from "./finance-math";
