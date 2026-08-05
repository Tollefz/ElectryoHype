/**
 * Autonomous Commerce Engine — types (orchestration only).
 */

export type AutonomyMode = "off" | "semi" | "auto";

export type StoreGoal = {
  /** Maximize listing / image / SEO quality */
  quality: number;
  /** Maximize sustainable margin */
  margin: number;
  /** Maximize customer experience signals */
  customerExperience: number;
  /** Minimize manual admin work */
  minimizeManual: number;
};

export type AutonomyQualityThresholds = {
  minImages: number;
  minSpecs: number;
  minMarginPct: number;
  minMerchandiserScore: number;
  minCategoryConfidence: number;
  minOverallConfidence: number;
  requireKnownCategory: boolean;
};

export type ConfidenceMap = {
  category: number;
  price: number;
  description: number;
  seo: number;
  margin: number;
  import: number;
  overall: number;
};

export type ExplainedDecision = {
  stage: string;
  subjectKey: string;
  action: "accept" | "reject" | "skip" | "queue" | "process" | "approve_review";
  confidence: number;
  why: string[];
  risks: string[];
  data?: Record<string, unknown>;
  confidenceMap?: Partial<ConfidenceMap>;
};

export type AutonomyRunSummary = {
  productsAnalyzed: number;
  newCandidatesFound: number;
  fittedProfile: number;
  imported: number;
  passedQualityGate: number;
  readyForPublish: number;
  priceUpdates: number;
  outOfStock: number;
  needImages: number;
  weakSeo: number;
  criticalErrors: number;
  tasksOpened: number;
};

export type AutonomyStepLog = {
  name: string;
  ok: boolean;
  detail?: string;
  ms?: number;
};

export const DEFAULT_STORE_GOAL: StoreGoal = {
  quality: 0.9,
  margin: 0.85,
  customerExperience: 0.8,
  minimizeManual: 0.95,
};

export const DEFAULT_QUALITY_GATE: AutonomyQualityThresholds = {
  minImages: 2,
  minSpecs: 2,
  minMarginPct: 25,
  minMerchandiserScore: 80,
  minCategoryConfidence: 70,
  minOverallConfidence: 75,
  requireKnownCategory: true,
};
