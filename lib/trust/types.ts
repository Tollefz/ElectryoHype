/**
 * AI Trust — shared types for scorecards, explanations, KPIs.
 */

export type AiEngineId =
  | "supplier"
  | "merchandiser"
  | "digital_buyer"
  | "store_intelligence"
  | "pricing"
  | "seo"
  | "quality_gate"
  | "autonomy";

export const AI_ENGINE_LABELS: Record<AiEngineId, string> = {
  supplier: "Supplier Engine",
  merchandiser: "Merchandiser",
  digital_buyer: "Digital Buyer",
  store_intelligence: "Store Intelligence",
  pricing: "Pricing",
  seo: "SEO",
  quality_gate: "Quality Gate",
  autonomy: "Autonomy",
};

export type EngineScorecard = {
  engine: AiEngineId;
  label: string;
  decisions: number;
  approvals: number;
  rejections: number;
  approvalRate: number;
  rejectionRate: number;
  hitRate: number;
  avgConfidence: number | null;
  avgProcessingMs: number | null;
};

export type StoreAiKpis = {
  productsAnalyzed: number;
  productsImported: number;
  productsPublished: number;
  avgMarginPct: number | null;
  hitRate: number;
  timeSavedHoursEst: number | null;
  improvement30d: number | null;
  decisions30d: number;
  overrides30d: number;
};

export type TrustExplanation = {
  why: string[];
  dataUsed: string[];
  against: string[];
  confidence: number | null;
  risks: string[];
  alternatives: string[];
};

export type SelfEvalResult = {
  summaryText: string;
  scorecards: EngineScorecard[];
  kpis: StoreAiKpis;
  learnings: string[];
  profileUpdates: Record<string, unknown>;
};
