/**
 * AI Trust & Continuous Improvement — public surface.
 */

export type * from "@/lib/trust/types";
export { AI_ENGINE_LABELS } from "@/lib/trust/types";
export { buildTrustExplanation } from "@/lib/trust/explanations";
export {
  recordAiFeedback,
  recordAiOverride,
  listRecentOverrides,
  listRecentFeedback,
} from "@/lib/trust/feedback";
export { buildEngineScorecards } from "@/lib/trust/scorecard";
export { buildStoreAiKpis } from "@/lib/trust/kpis";
export { runAiSelfEvaluation, getLatestSelfEval } from "@/lib/trust/self-eval";
