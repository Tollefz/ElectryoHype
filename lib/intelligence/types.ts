/**
 * Store Intelligence / AI Category Manager — types.
 * Layer on top of catalog, merchandiser, review — provider-agnostic.
 */

export type CategoryStrategyTag =
  | "too_small"
  | "balanced"
  | "overrepresented"
  | "missing_premium"
  | "missing_budget"
  | "missing_mid"
  | "missing_accessories"
  | "missing_newcomers";

export type CategoryHealth = {
  category: string;
  productCount: number;
  activeCount: number;
  publishedCount: number;
  inactiveCount: number;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  avgMarginPct: number | null;
  variantTotal: number;
  avgVariants: number;
  imageScore: number;
  seoScore: number;
  aiScore: number;
  reviewBacklog: number;
  supplierMix: Record<string, number>;
  strategy: CategoryStrategyTag[];
  healthScore: number;
  summary: string;
};

export type AssortmentGap = {
  id: string;
  severity: "high" | "medium" | "low";
  category: string | null;
  anchorFamily: string;
  missingFamily: string;
  anchorCount: number;
  missingCount: number;
  expectedMin: number;
  title: string;
  why: string[];
  suggestedQueries: string[];
};

export type ComplementChain = {
  id: string;
  name: string;
  category: string | null;
  steps: Array<{ family: string; label: string; count: number; status: "strong" | "weak" | "missing" }>;
  why: string;
};

export type IntelligenceRecommendation = {
  id: string;
  priority: number;
  kind: "gap_fill" | "complement" | "margin" | "seo" | "merchandiser" | "price" | "stock";
  title: string;
  why: string[];
  href?: string;
  meta?: Record<string, unknown>;
};

export type DailyTask = {
  id: string;
  urgency: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  count?: number;
  href: string;
  kind: string;
};

export type StoreIntelligenceReport = {
  storeHealthScore: number;
  strongestCategory: string | null;
  weakestCategory: string | null;
  bestMarginCategory: string | null;
  lowestMarginCategory: string | null;
  categories: CategoryHealth[];
  gaps: AssortmentGap[];
  complements: ComplementChain[];
  recommendations: IntelligenceRecommendation[];
  dailyTasks: DailyTask[];
  supplierMix: Record<string, number>;
  risks: string[];
  livingProfile: {
    identitySummary: string;
    audienceHint: string | null;
    priceLevelHint: string | null;
    qualityHint: string | null;
    brandHint: string | null;
    styleHint: string | null;
    categoryFocus: Array<{ category: string; share: number; count: number }>;
    preferenceModel: Record<string, number> | null;
  };
  generatedAt: string;
  catalogTotals: {
    products: number;
    active: number;
    inactive: number;
  };
};

/** Future signal adapters — architecture only. */
export type IntelligenceSignalProvider = {
  readonly id: string;
  readonly displayName: string;
  readonly status: "planned" | "stub" | "active";
  isConfigured(): Promise<boolean>;
  getSignals?(input: { category?: string }): Promise<Array<{ key: string; value: number; note?: string }>>;
};
