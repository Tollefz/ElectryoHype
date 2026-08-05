/**
 * Shared Digital Buyer V4 review types (safe for client + server).
 */

export type BuyerReviewGroupId =
  | "all"
  | "ai-confident"
  | "premium"
  | "ready"
  | "gaming"
  | "mobil"
  | "audio"
  | "kontor"
  | "hjem"
  | "high-margin"
  | "margin-60"
  | "score-90"
  | "perfect-match"
  | "fantastic"
  | "low-score"
  | "needs-review"
  | "new";

export type BuyerReviewSort =
  | "match"
  | "rank"
  | "score"
  | "margin"
  | "newest"
  | "price"
  | "category";

export type BuyerReviewOverview = {
  scanRunId: string | null;
  total: number;
  /** Candidates created after client `since` (Nye siden sist). */
  newSince: number;
  premium: number;
  ready: number;
  aiConfident: number;
  highMargin: number;
  margin60: number;
  score90: number;
  needsReview: number;
  byCategory: Array<{ id: string; label: string; emoji: string; count: number }>;
  /** Fixed first-page decision board (may include zero counts). */
  groups: Array<{
    id: BuyerReviewGroupId;
    label: string;
    emoji: string;
    count: number;
  }>;
};

export type BuyerReviewFilters = {
  minMatch?: number | null;
  minMargin?: number | null;
  minConfidence?: number | null;
  maxPrice?: number | null;
  minPrice?: number | null;
  supplier?: string | null;
  premiumOnly?: boolean;
  readyOnly?: boolean;
  hasVideo?: boolean;
  manyImages?: boolean;
  inStock?: boolean;
  hasSeo?: boolean;
  hasAi?: boolean;
};

export type BuyerReviewPageMeta = {
  scanRunId: string | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  group: BuyerReviewGroupId;
};
