/**
 * AI CRM / Customer Brain — understand customers, not just orders.
 * Separate from Buyer / Marketing / Order / Finance.
 * Recommendations only — never auto-emails or CRM writes.
 */

export {
  advanceCustomerBrain,
  getCustomerBrain,
  type CustomerBrainSnapshot,
} from "./customer-brain";

export {
  detectCustomerSegments,
  recommendSegmentsForCustomer,
  CUSTOMER_SEGMENT_LABELS,
  CUSTOMER_PERSONA_LABELS,
  type CustomerSegmentId,
} from "./customer-segments";

export {
  computeCustomerScore,
  personaLabel,
  segmentLabel,
  type CustomerProfile,
  type CustomerScoreBreakdown,
  type CustomerScoreInput,
  type CustomerPurchaseRow,
} from "./customer-score";

export {
  rebuildCustomerMemory,
  getCustomerMemory,
  CUSTOMER_MEMORY_SETTING_KEY,
  type CustomerMemorySnapshot,
  type CustomerMemoryStory,
} from "./customer-memory";

export {
  buildCustomerInsights,
  type CustomerInsight,
  type CustomerInsightKind,
} from "./customer-insights";

export {
  getCustomerDeskStatus,
  type CustomerDeskStatus,
} from "./customer-desk-status";
