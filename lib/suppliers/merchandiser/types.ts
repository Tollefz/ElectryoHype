/**
 * AI Merchandiser — provider-agnostic types.
 * Works on SupplierSearchProduct / SupplierProductDetail only.
 * Never imports CJ/Temu/CSV internals.
 */

export type MerchandiserShelf =
  | "today"
  | "gaming"
  | "mobil"
  | "kontor"
  | "hjem"
  | "elektronikk"
  | "trending"
  | "new";

export const MERCHANDISER_SHELVES: Array<{
  id: MerchandiserShelf;
  label: string;
  description: string;
}> = [
  { id: "today", label: "Anbefalt i dag", description: "Beste kandidater for butikken nå" },
  { id: "gaming", label: "Gaming", description: "Spillutstyr og gaming-tilbehør" },
  { id: "mobil", label: "Mobil", description: "Mobil og tilbehør" },
  { id: "kontor", label: "Kontor", description: "Data, IT og kontor" },
  { id: "hjem", label: "Hjem", description: "Hjem og fritid" },
  { id: "elektronikk", label: "Elektronikk", description: "Bred elektronikk" },
  { id: "trending", label: "Trending", description: "Høy listet-aktivitet / etterspørsel" },
  { id: "new", label: "Nye produkter", description: "Nyeste katalogtreff" },
];

/** Multi-dimension score — all 0–100. */
export type MerchandiserScoreBreakdown = {
  visualQuality: number;
  marketFit: number;
  marginPotential: number;
  norwegianAudience: number;
  competitionRisk: number; // higher = safer (less risk)
  brandPotential: number;
  imageQuality: number;
  specificationQuality: number;
  categoryFit: number;
  shippingQuality: number;
  variantQuality: number;
  seoPotential: number;
  overall: number;
};

export type MerchandiserRiskFlag =
  | "too_many_variants"
  | "too_few_images"
  | "missing_specs"
  | "unclear_description"
  | "low_stock"
  | "missing_video"
  | "suspicious_product"
  | "return_risk"
  | "watermark_suspected"
  | "chinese_text_suspected"
  | "zero_price";

export type MerchandiserMarketProfile = {
  fitsStore: boolean;
  buyerPersona: string;
  impulseBuy: boolean;
  giftPotential: boolean;
  niche: boolean;
  seasonal: boolean;
  broadAudience: boolean;
  summary: string;
};

export type MerchandiserPricingAdvice = {
  estimatedRetailNOK: number;
  estimatedMarginNOK: number;
  estimatedMarginPct: number;
  priceSensitivity: "low" | "medium" | "high";
  premiumPotential: boolean;
  rationale: string;
  /** 0–100 — how confident we are in this retail pick */
  confidence?: number;
  competitorBandLow?: number;
  competitorBandHigh?: number;
  reasons?: Array<{ ok: boolean; label: string }>;
  /** Economic Validation — landed cost basis */
  costNOK?: number;
  shippingNOK?: number;
  feesNOK?: number;
  vatNOK?: number;
  landedCostNOK?: number;
  retailNOK?: number;
  marginPct?: number;
  marginNOK?: number;
  breakEvenNOK?: number;
  economicConfidence?: number;
  fxRate?: number;
  fxFetchedAt?: string;
  economic?: unknown;
};

export type MerchandiserVisualAdvice = {
  premiumFeel: number;
  whiteBackgroundLikely: boolean;
  resolutionHint: "low" | "medium" | "high" | "unknown";
  watermarkRisk: boolean;
  chineseTextRisk: boolean;
  lifestyleImages: boolean;
  packagingVisible: boolean;
  summary: string;
  /** Set when vision model was used. */
  aiAnalyzed: boolean;
};

export type MerchandiserAnalysis = {
  scores: MerchandiserScoreBreakdown;
  reasons: string[];
  risks: MerchandiserRiskFlag[];
  market: MerchandiserMarketProfile;
  pricing: MerchandiserPricingAdvice;
  visual: MerchandiserVisualAdvice;
  explanation: string;
  shelf: MerchandiserShelf;
  categoryHint: string | null;
};

export type ShopProfileData = {
  id?: string;
  storeId?: string | null;
  name: string;
  audience: string;
  priceLevel: string;
  designStyle: string | null;
  productStrategy: string | null;
  categories: string[];
  qualityLevel: string;
  brandVoice: string | null;
  avoidCategories: string[];
  merchandiserSettings: MerchandiserSettings;
};

export type MerchandiserSettings = {
  /** Show suggestions only vs auto-queue high scorers into Import Queue (review — never publish). */
  autoQueueEnabled: boolean;
  autoQueueMinScore: number;
  defaultBatchSize: 10 | 25 | 100;
  minScoreToShow: number;
  /** Future: Google Trends / sales / season — architecture only. */
  trendSignalsEnabled: boolean;
};

export const DEFAULT_MERCHANDISER_SETTINGS: MerchandiserSettings = {
  autoQueueEnabled: false,
  autoQueueMinScore: 95,
  defaultBatchSize: 25,
  minScoreToShow: 55,
  trendSignalsEnabled: false,
};

/** Future trend signal adapters — not implemented, contract only. */
export type TrendSignalProvider = {
  readonly id: string;
  readonly displayName: string;
  isConfigured(): Promise<boolean>;
  getSignals(input: {
    category?: string;
    keywords?: string[];
  }): Promise<Array<{ keyword: string; score: number; source: string }>>;
};
