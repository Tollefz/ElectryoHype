/**
 * Customer Insights — facts about the customer base (no LLM).
 */

import type { CustomerProfile } from "./customer-score";
import type { CustomerMemorySnapshot } from "./customer-memory";

export type CustomerInsightKind =
  | "new"
  | "returning"
  | "vip"
  | "churn"
  | "high_ltv"
  | "segment"
  | "recommend"
  | "info";

export type CustomerInsight = {
  id: string;
  kind: CustomerInsightKind;
  question: string;
  title: string;
  detail: string;
  why: string;
  tone: "positive" | "warning" | "neutral";
  sampleEmails?: string[];
};

export function buildCustomerInsights(
  profiles: CustomerProfile[],
  memory: CustomerMemorySnapshot
): CustomerInsight[] {
  if (profiles.length === 0) {
    return [
      {
        id: "waiting",
        kind: "info",
        question: "Hvem er kundene?",
        title: "Customer Brain venter på signal",
        detail:
          "Når kunder knyttes til betalte ordre, lærer jeg segmenter, LTV og churn-risiko — uten å sende e-post automatisk.",
        why: "Ingen Customer-profiler med ordre i snapshot.",
        tone: "neutral",
      },
    ];
  }

  const insights: CustomerInsight[] = [];
  const neu = profiles.filter((p) => p.cohort === "new" || p.score.orderCount === 1);
  const returning = profiles.filter(
    (p) =>
      p.cohort === "returning" ||
      p.cohort === "vip" ||
      p.cohort === "high_ltv" ||
      p.score.orderCount >= 2
  );
  const vip = profiles.filter((p) => p.cohort === "vip");
  const churn = profiles.filter((p) => p.cohort === "churn_risk");
  const highLtv = profiles.filter(
    (p) => p.cohort === "high_ltv" || p.score.lifetimeValue >= 1500
  );

  insights.push({
    id: "new",
    kind: "new",
    question: "Nye kunder?",
    title: `${neu.length} nye / engangskjøpere`,
    detail:
      neu.length === 0
        ? "Ingen engangskjøpere i snapshot."
        : neu
            .slice(0, 5)
            .map((p) => p.email)
            .join(", "),
    why: "1 betalt ordre (eller cohort=new).",
    tone: "neutral",
    sampleEmails: neu.slice(0, 5).map((p) => p.email),
  });

  insights.push({
    id: "returning",
    kind: "returning",
    question: "Tilbakevendende?",
    title: `${returning.length} tilbakevendende kunder`,
    detail:
      returning.length === 0
        ? "Ingen med ≥2 betalte ordre."
        : `Snitt LTV blant dem: ${Math.round(
            returning.reduce((s, p) => s + p.score.lifetimeValue, 0) /
              Math.max(returning.length, 1)
          )} kr`,
    why: "≥2 betalte ordre.",
    tone: "positive",
    sampleEmails: returning.slice(0, 5).map((p) => p.email),
  });

  insights.push({
    id: "vip",
    kind: "vip",
    question: "VIP?",
    title: `${vip.length} VIP-kunder`,
    detail:
      vip.length === 0
        ? "Ingen VIP ennå (LTV ≥ 2500 eller ≥4 ordre + god score)."
        : vip
            .slice(0, 5)
            .map((p) => `${p.email} (${Math.round(p.score.lifetimeValue)} kr)`)
            .join(" · "),
    why: "Høy livstidsverdi eller frekvens + score.",
    tone: vip.length > 0 ? "positive" : "neutral",
    sampleEmails: vip.slice(0, 5).map((p) => p.email),
  });

  insights.push({
    id: "churn",
    kind: "churn",
    question: "Risiko for churn?",
    title: `${churn.length} med churn-risiko`,
    detail:
      churn.length === 0
        ? "Ingen som har handlet før og vært stille ≥90 dager."
        : churn
            .slice(0, 5)
            .map(
              (p) =>
                `${p.email} (${p.score.daysSinceLastOrder ?? "?"} d siden)`
            )
            .join(" · "),
    why: "≥2 kjøp og ≥90 dager siden siste betalte ordre.",
    tone: churn.length > 0 ? "warning" : "positive",
    sampleEmails: churn.slice(0, 5).map((p) => p.email),
  });

  insights.push({
    id: "high-ltv",
    kind: "high_ltv",
    question: "Høy livstidsverdi?",
    title: `${highLtv.length} med høy LTV`,
    detail:
      highLtv.length === 0
        ? "Ingen med LTV ≥ 1500 kr."
        : highLtv
            .slice(0, 5)
            .map((p) => `${p.email}: ${Math.round(p.score.lifetimeValue)} kr`)
            .join(" · "),
    why: "Sum betalte ordre totals per kunde.",
    tone: highLtv.length > 0 ? "positive" : "neutral",
    sampleEmails: highLtv.slice(0, 5).map((p) => p.email),
  });

  if (memory.topSegments[0]) {
    insights.push({
      id: "seg",
      kind: "segment",
      question: "Sterkeste segment?",
      title: `${memory.topSegments[0].label} dominerer`,
      detail: memory.topSegments
        .slice(0, 4)
        .map((s) => `${s.label} (${s.customers})`)
        .join(" · "),
      why: "Segmenter fra produktnavn/kategori i kjøpshistorikk.",
      tone: "neutral",
    });
  }

  const withRec = profiles.filter((p) => p.recommendation.shouldGet.length > 0);
  if (withRec[0]) {
    const p = withRec.sort((a, b) => b.score.overall - a.score.overall)[0];
    insights.push({
      id: `rec-${p.customerId}`,
      kind: "recommend",
      question: "Hva bør denne kunden få?",
      title: `${p.email}: ${p.recommendation.shouldGet.join(", ")}`,
      detail:
        p.recommendation.avoid.length > 0
          ? `Anbefalt: ${p.recommendation.shouldGet.join(", ")}. Unngå: ${p.recommendation.avoid.join(", ")}.`
          : `Anbefalt: ${p.recommendation.shouldGet.join(", ")}.`,
      why: p.recommendation.why,
      tone: "positive",
      sampleEmails: [p.email],
    });
  }

  return insights;
}
