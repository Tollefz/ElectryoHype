/**
 * AI Merchandiser — public module surface for Supplier Engine.
 */

export type {
  MerchandiserShelf,
  MerchandiserScoreBreakdown,
  MerchandiserRiskFlag,
  MerchandiserMarketProfile,
  MerchandiserPricingAdvice,
  MerchandiserVisualAdvice,
  MerchandiserAnalysis,
  ShopProfileData,
  MerchandiserSettings,
  TrendSignalProvider,
} from "@/lib/suppliers/merchandiser/types";
export {
  MERCHANDISER_SHELVES,
  DEFAULT_MERCHANDISER_SETTINGS,
} from "@/lib/suppliers/merchandiser/types";
export {
  DEFAULT_SHOP_PROFILE,
  getOrCreateShopProfile,
  updateShopProfile,
  shopProfilePromptBlock,
} from "@/lib/suppliers/merchandiser/shop-profile";
export { runMerchandiserScan } from "@/lib/suppliers/merchandiser/scanner";
export {
  listMerchandiserRecommendations,
  getMerchandiserSummary,
  queueRecommendationsToImport,
  decideOnRecommendation,
} from "@/lib/suppliers/merchandiser/actions";
export {
  analyzeSearchProduct,
  analyzeProductDetail,
} from "@/lib/suppliers/merchandiser/scoring";
export { compareMerchandiserCandidates } from "@/lib/suppliers/merchandiser/compare";
export {
  recordMerchandiserDecision,
  getDecisionStats,
} from "@/lib/suppliers/merchandiser/decisions";
export {
  TREND_SIGNAL_PROVIDERS,
  getTrendBoost,
} from "@/lib/suppliers/merchandiser/trends";
