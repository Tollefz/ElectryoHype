/**
 * Customer CRM score — LTV, AOV, persona, language, source, history.
 * Understand the customer. Never sends messages or runs ads.
 */

import "server-only";

import type { CustomerSegmentId } from "./customer-segments";
import {
  CUSTOMER_PERSONA_LABELS,
  CUSTOMER_SEGMENT_LABELS,
  detectCustomerSegments,
  recommendSegmentsForCustomer,
} from "./customer-segments";

export type CustomerScoreBreakdown = {
  lifetimeValue: number;
  orderCount: number;
  aov: number;
  purchaseFrequencyPerYear: number | null;
  daysSinceLastOrder: number | null;
  refundedOrders: number;
  returnRate: number;
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  riskScore: number;
  overall: number;
};

export type CustomerPurchaseRow = {
  orderNumber: string | null;
  at: string;
  total: number;
  titles: string[];
  categories: string[];
};

export type CustomerProfile = {
  customerId: string;
  email: string;
  name: string | null;
  /** BCP 47 from Customer.locale */
  locale: string | null;
  /** Human language label (Norsk / English / …) */
  language: string | null;
  /** Traffic sources seen with this customer's purchases (best-effort) */
  sources: string[];
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  /** Dominant category from line items */
  favoriteCategory: string | null;
  /** Primary CRM persona, e.g. Gaming-entusiast */
  persona: string | null;
  segments: Array<{
    id: CustomerSegmentId;
    label: string;
    persona: string;
    hits: number;
  }>;
  /** Recent purchase history (newest first, capped) */
  purchaseHistory: CustomerPurchaseRow[];
  score: CustomerScoreBreakdown;
  cohort: "new" | "returning" | "vip" | "churn_risk" | "high_ltv";
  recommendation: {
    shouldGet: string[];
    avoid: string[];
    why: string;
    /** «Denne kunden passer best med: Gaming · ikke Mobil» */
    headline: string;
  };
};

export type CustomerScoreInput = {
  customerId: string;
  email: string;
  name: string | null;
  locale?: string | null;
  language?: string | null;
  sources?: string[];
  orders: Array<{
    orderNumber?: string | null;
    total: number;
    createdAt: Date;
    paymentStatus: string;
    titles: string[];
    categories: Array<string | null | undefined>;
  }>;
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 86400000);
}

function favoriteFromCategories(
  categories: Array<string | null | undefined>
): string | null {
  const counts = new Map<string, number>();
  for (const c of categories) {
    const key = String(c || "").trim();
    if (!key || key === "Ukategorisert") continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of counts) {
    if (v > n) {
      best = k;
      n = v;
    }
  }
  return best;
}

/**
 * Score one customer from paid/refunded order history + CRM signals.
 */
export function computeCustomerScore(input: CustomerScoreInput): CustomerProfile {
  const paid = input.orders.filter((o) => o.paymentStatus === "paid");
  const refunded = input.orders.filter((o) => o.paymentStatus === "refunded");
  const allForTitles = paid.length > 0 ? paid : input.orders;

  const lifetimeValue = paid.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const orderCount = paid.length;
  const aov = orderCount > 0 ? lifetimeValue / orderCount : 0;

  const dates = paid
    .map((o) => o.createdAt)
    .sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0] || null;
  const last = dates[dates.length - 1] || null;
  const now = new Date();
  const daysSinceLastOrder = last ? daysBetween(last, now) : null;

  let purchaseFrequencyPerYear: number | null = null;
  if (first && last && orderCount >= 2) {
    const spanDays = Math.max(1, daysBetween(first, last));
    purchaseFrequencyPerYear =
      Math.round((orderCount / spanDays) * 365 * 100) / 100;
  }

  const returnRate =
    paid.length + refunded.length > 0
      ? refunded.length / (paid.length + refunded.length)
      : 0;

  let recencyScore = 40;
  if (daysSinceLastOrder != null) {
    if (daysSinceLastOrder <= 30) recencyScore = 95;
    else if (daysSinceLastOrder <= 60) recencyScore = 75;
    else if (daysSinceLastOrder <= 90) recencyScore = 55;
    else if (daysSinceLastOrder <= 180) recencyScore = 35;
    else recencyScore = 15;
  }

  let frequencyScore = clamp(orderCount * 25);
  if (purchaseFrequencyPerYear != null) {
    frequencyScore = clamp(frequencyScore * 0.5 + purchaseFrequencyPerYear * 15);
  }

  const monetaryScore = clamp(Math.log10(lifetimeValue + 1) * 28);

  let riskScore = 20;
  if (returnRate >= 0.5) riskScore += 40;
  else if (returnRate >= 0.25) riskScore += 25;
  if (daysSinceLastOrder != null && daysSinceLastOrder > 120 && orderCount >= 2) {
    riskScore += 30;
  }
  riskScore = clamp(riskScore);

  const overall = clamp(
    recencyScore * 0.25 +
      frequencyScore * 0.25 +
      monetaryScore * 0.35 +
      (100 - riskScore) * 0.15
  );

  const titles = allForTitles.flatMap((o) => o.titles);
  const categories = allForTitles.flatMap((o) => o.categories);
  const segments = detectCustomerSegments({
    titles,
    categories,
    avgOrderValue: aov,
  });
  const recommendation = recommendSegmentsForCustomer(segments);
  const favoriteCategory =
    favoriteFromCategories(categories) ||
    segments[0]?.label ||
    null;
  const persona = segments[0]
    ? CUSTOMER_PERSONA_LABELS[segments[0].id]
    : null;

  let cohort: CustomerProfile["cohort"] = "new";
  const isChurn =
    orderCount >= 2 &&
    daysSinceLastOrder != null &&
    daysSinceLastOrder >= 90 &&
    daysSinceLastOrder < 365;
  const isVip =
    lifetimeValue >= 2500 || (orderCount >= 4 && overall >= 70);
  const isHighLtv = lifetimeValue >= 1500;

  if (isChurn) cohort = "churn_risk";
  else if (isVip) cohort = "vip";
  else if (isHighLtv) cohort = "high_ltv";
  else if (orderCount >= 2) cohort = "returning";
  else cohort = "new";

  const purchaseHistory: CustomerPurchaseRow[] = [...allForTitles]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8)
    .map((o) => ({
      orderNumber: o.orderNumber || null,
      at: o.createdAt.toISOString(),
      total: Math.round((Number(o.total) || 0) * 100) / 100,
      titles: o.titles.slice(0, 4),
      categories: o.categories
        .map((c) => String(c || "").trim())
        .filter(Boolean)
        .slice(0, 4),
    }));

  const sources = [...new Set((input.sources || []).filter(Boolean))].slice(
    0,
    5
  );

  return {
    customerId: input.customerId,
    email: input.email,
    name: input.name,
    locale: input.locale || null,
    language: input.language || null,
    sources,
    firstOrderAt: first?.toISOString() ?? null,
    lastOrderAt: last?.toISOString() ?? null,
    favoriteCategory,
    persona,
    segments,
    purchaseHistory,
    score: {
      lifetimeValue: Math.round(lifetimeValue * 100) / 100,
      orderCount,
      aov: Math.round(aov * 100) / 100,
      purchaseFrequencyPerYear,
      daysSinceLastOrder:
        daysSinceLastOrder != null ? Math.round(daysSinceLastOrder) : null,
      refundedOrders: refunded.length,
      returnRate: Math.round(returnRate * 1000) / 10,
      recencyScore,
      frequencyScore,
      monetaryScore,
      riskScore,
      overall,
    },
    cohort,
    recommendation,
  };
}

export function segmentLabel(id: CustomerSegmentId): string {
  return CUSTOMER_SEGMENT_LABELS[id];
}

export function personaLabel(id: CustomerSegmentId): string {
  return CUSTOMER_PERSONA_LABELS[id];
}
