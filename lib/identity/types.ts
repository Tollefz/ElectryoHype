/**
 * Store Identity Fit — types for the generic store-identity engine.
 * Identity comes from Store Profile / DNA / focus / memory — not hardcoded brand lists.
 */

export type StoreIdentitySignalId =
  | "profile_category"
  | "avoid_category"
  | "product_focus"
  | "catalog_family"
  | "dna_trait"
  | "memory"
  | "living_focus"
  | "strategy_token"
  | "unknown_family";

export type StoreIdentitySignal = {
  id: StoreIdentitySignalId;
  /** Contribution toward 0–100 (can be negative) */
  delta: number;
  detail: string;
};

export type StoreIdentityFitResult = {
  /** 0–100 — “Would a customer expect this in this store?” */
  score: number;
  /** Band for gates / UI */
  band: "strong" | "good" | "weak" | "reject";
  /** Norwegian explanation (required when band is weak/reject) */
  why: string;
  /** Extra reasons for Mission Control / cards */
  reasons: string[];
  signals: StoreIdentitySignal[];
  familyId: string | null;
  familyLabel: string | null;
  /** Normally should not publish when true */
  normallyBlockPublish: boolean;
  /** Rare exception only — caller must supply rationale */
  exceptionAllowed: boolean;
};

/** Snapshot of who the store is — profile-driven, reusable for any vertical. */
export type StoreIdentityContext = {
  version: 1;
  storeId: string | null;
  storeName: string;
  rebuiltAt: string;
  /** Profile category labels (owner intent) */
  profileCategories: string[];
  avoidCategories: string[];
  audience: string;
  productStrategy: string;
  /** Token set derived from profile/strategy/audience (normalized) */
  identityTokens: string[];
  avoidTokens: string[];
  /** Product Focus stars by family */
  focusStarsByFamily: Record<string, number>;
  /** Share of active catalog by familyId (0–100) */
  catalogFamilyShare: Record<string, number>;
  catalogFamilyCount: Record<string, number>;
  catalogProductCount: number;
  /** DNA traits with intensity */
  dnaTraits: Array<{ id: string; label: string; pct: number }>;
  /** Living profile category focus */
  livingCategories: Array<{ category: string; share: number }>;
  /** Memory experience by family key −100..+100 */
  memoryFamilyExperience: Record<string, number>;
  /** Families with strong reject signal from memory */
  memoryRejectFamilies: string[];
};

export type StoreIdentityProductInput = {
  title: string;
  categoryHint?: string | null;
  subcategoryHint?: string | null;
  supplierCategory?: string | null;
  description?: string | null;
  tags?: string[] | string | null;
  /** Pre-resolved family if caller already matched */
  familyId?: string | null;
  shopMatchPct?: number | null;
};

/** Thresholds — soft assessment, strong gate when reject. */
export const IDENTITY_FIT_STRONG = 85;
export const IDENTITY_FIT_GOOD = 70;
export const IDENTITY_FIT_WEAK = 45;
/** Below this → normally do not publish (even with good margin) */
export const IDENTITY_FIT_REJECT = 25;

export type StoreIdentityMissionSnapshot = {
  rebuiltAt: string;
  contextStoreName: string;
  catalogProductCount: number;
  lowFitCandidates: Array<{
    id: string;
    title: string;
    score: number;
    why: string;
    familyId: string | null;
  }>;
  commonReasons: Array<{ reason: string; count: number }>;
  rejectedCategoryHints: Array<{ label: string; count: number }>;
  strengthensProfile: Array<{
    title: string;
    score: number;
    why: string;
    familyId: string | null;
  }>;
  avgFitRecent: number | null;
  rejectBandCount: number;
  weakBandCount: number;
};
