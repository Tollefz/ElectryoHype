/**
 * Store Intelligence / AI Category Manager — public API.
 */

export type * from "@/lib/intelligence/types";
export { buildStoreIntelligence, getLatestIntelligenceSnapshot } from "@/lib/intelligence/report";
export { recordCategoryManagerDecision, buildPreferenceModel } from "@/lib/intelligence/preferences";
export { refreshLivingProfile } from "@/lib/intelligence/living-profile";
export { INTELLIGENCE_SIGNAL_PROVIDERS } from "@/lib/intelligence/signals";
export { findAssortmentGaps, buildComplementChains } from "@/lib/intelligence/assortment";
export { analyzeCategoryHealth } from "@/lib/intelligence/category-health";
