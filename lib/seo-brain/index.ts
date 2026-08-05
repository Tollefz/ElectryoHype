/**
 * AI SEO Brain — monitor storefront SEO.
 * Never auto-generates content. Recommendations / explanations only.
 */

export {
  advanceSeoBrain,
  type SeoBrainSnapshot,
} from "./seo-brain";

export {
  scoreProductSeo,
  aggregateSeoScore,
  type SeoProductScoreResult,
  type SeoIssue,
  type SeoIssueCode,
} from "./seo-score";

export {
  buildSeoInsights,
  summarizeSeoAudit,
  type SeoInsight,
  type SeoAuditSummary,
} from "./seo-insights";

export {
  rebuildSeoMemory,
  getSeoMemory,
  SEO_MEMORY_SETTING_KEY,
  type SeoMemorySnapshot,
} from "./seo-memory";

export {
  getSeoDeskStatus,
  type SeoDeskStatus,
} from "./seo-desk-status";
