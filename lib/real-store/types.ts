/**
 * Real Store Mode — maturity, automation score, catalog QA.
 * Surfaces on Rob's Desk only. No new admin modules.
 */

export type AutomationArea =
  | "procurement"
  | "seo"
  | "categorization"
  | "pricing"
  | "product_improvement"
  | "supplier_monitoring";

export type AutomationScore = {
  areas: Array<{ id: AutomationArea; label: string; pct: number }>;
  adminMinutesPerDayEst: number;
  overallPct: number;
};

export type CatalogQaIssue = {
  id: string;
  label: string;
  count: number;
  href: string;
  severity: "high" | "medium" | "low";
};

export type MaturityGate = {
  id: string;
  label: string;
  met: boolean;
  detail: string;
};

export type RealStoreSnapshot = {
  maturityScore: number;
  maturityLabel: string;
  gates: MaturityGate[];
  automation: AutomationScore;
  catalogQualityAvg: number | null;
  catalogIssues: CatalogQaIssue[];
  performanceProblems: Array<{ id: string; label: string; detail: string }>;
  dailyImprovements: number;
  workSavedHours30d: number;
  aiReview: string | null;
  readyFor20MinDay: boolean;
};
