/**
 * Digital Buyer — types for continuous discovery.
 */

export type BuyerScanTarget = 10 | 25 | 50 | 100 | 500 | 1000 | 10000;

export type BuyerCheckpoint = {
  supplierIdx: number;
  seedIdx: number;
  page: number;
  /** Recent keys to skip within the run (DB unique is source of truth). */
  seenKeys: string[];
  /** Discovery Scheduler state — which families to explore next */
  discovery?: {
    familyScanCounts: Record<string, number>;
    groupScanCounts: Record<string, number>;
    recentFamilies: string[];
    queryVariantIdx: Record<string, number>;
    currentFamilyId: string | null;
    currentQuery: string | null;
    pagesOnCurrent: number;
    emptyStreak: number;
  };
};

export type ShopMatchResult = {
  pct: number;
  why: string[];
  risks: string[];
};

export type BuyerFilterResult = {
  pass: boolean;
  reasons: string[];
};

export type DiscoveryTag =
  | "niche"
  | "complementary"
  | "premium"
  | "budget"
  | "new_category"
  | "accessory"
  | "trending";

export type BuyerDiscoverySummary = {
  niches: string[];
  newCategories: string[];
  complementary: string[];
  premiumCount: number;
  budgetCount: number;
  accessoryCount: number;
};

export const DEFAULT_BUYER_FILTER = {
  minShopMatchPct: 50,
  minOverallScore: 55,
  /** Search-stage often has only a thumbnail URL. */
  minImages: 1,
  minMarginPct: 18,
  maxRiskFlags: 4,
  rejectLowStock: true,
};

export type BuyerFilterThresholds = typeof DEFAULT_BUYER_FILTER;
