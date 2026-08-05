/**
 * SEO Insights — explain why a page should improve (no LLM, no auto-content).
 */

import type { SeoProductScoreResult } from "./seo-score";

export type SeoInsightKind =
  | "score"
  | "indexing"
  | "warning"
  | "opportunity"
  | "duplicate"
  | "metadata"
  | "faq"
  | "alt"
  | "category"
  | "info";

export type SeoInsight = {
  id: string;
  kind: SeoInsightKind;
  question: string;
  title: string;
  detail: string;
  why: string;
  path?: string;
  tone: "positive" | "warning" | "neutral";
};

export type SeoAuditSummary = {
  productCount: number;
  avgScore: number;
  indexingLikely: number;
  indexingUnlikely: number;
  warningCount: number;
  opportunityCount: number;
  criticalCount: number;
  missingMeta: number;
  duplicates: number;
  missingFaq: number;
  missingAlt: number;
  missingCategory: number;
};

export function summarizeSeoAudit(
  results: SeoProductScoreResult[]
): SeoAuditSummary {
  let warningCount = 0;
  let opportunityCount = 0;
  let criticalCount = 0;
  let missingMeta = 0;
  let duplicates = 0;
  let missingFaq = 0;
  let missingAlt = 0;
  let missingCategory = 0;
  let indexingLikely = 0;

  for (const r of results) {
    if (r.indexingLikely) indexingLikely += 1;
    for (const i of r.issues) {
      if (i.severity === "warning") warningCount += 1;
      if (i.severity === "opportunity") opportunityCount += 1;
      if (i.severity === "critical") criticalCount += 1;
      if (
        i.code === "missing_meta_title" ||
        i.code === "missing_meta_description"
      ) {
        missingMeta += 1;
      }
      if (i.code === "duplicate_meta_title") duplicates += 1;
      if (i.code === "missing_faq") missingFaq += 1;
      if (i.code === "missing_alt_capability") missingAlt += 1;
      if (i.code === "missing_category") missingCategory += 1;
    }
  }

  const avgScore =
    results.length === 0
      ? 0
      : Math.round(
          results.reduce((s, r) => s + r.score, 0) / results.length
        );

  return {
    productCount: results.length,
    avgScore,
    indexingLikely,
    indexingUnlikely: results.length - indexingLikely,
    warningCount,
    opportunityCount,
    criticalCount,
    missingMeta,
    duplicates,
    missingFaq,
    missingAlt,
    missingCategory,
  };
}

export function buildSeoInsights(
  results: SeoProductScoreResult[],
  summary: SeoAuditSummary
): SeoInsight[] {
  if (results.length === 0) {
    return [
      {
        id: "waiting",
        kind: "info",
        question: "Hvordan er SEO-helsen?",
        title: "SEO Brain venter på katalog",
        detail:
          "Når aktive produkter finnes, overvåker jeg metadata, duplikater, FAQ og indekseringsklarhet — uten å generere innhold automatisk.",
        why: "Ingen aktive produkter i audit.",
        tone: "neutral",
      },
    ];
  }

  const insights: SeoInsight[] = [];

  insights.push({
    id: "score",
    kind: "score",
    question: "SEO Score?",
    title: `SEO Score ${summary.avgScore}/100`,
    detail: `Snitt over ${summary.productCount} aktive produktsider.`,
    why: "Vektet fra metadata, beskrivelse, bilder, kategori, schema-grunnlag og duplikater.",
    tone:
      summary.avgScore >= 75
        ? "positive"
        : summary.avgScore >= 50
          ? "neutral"
          : "warning",
  });

  insights.push({
    id: "index",
    kind: "indexing",
    question: "Indeksering?",
    title: `${summary.indexingLikely} sannsynlig indexbare · ${summary.indexingUnlikely} usikre`,
    detail:
      "Basert på aktiv status, slug, bilde og tittel — ikke Google Search Console-crawl.",
    why: "Uten GSC-API er dette en butikk-side readiness-score, ikke faktisk index-status.",
    tone: summary.indexingUnlikely > 0 ? "warning" : "positive",
  });

  insights.push({
    id: "warnings",
    kind: "warning",
    question: "Warnings?",
    title: `${summary.warningCount} advarsler · ${summary.criticalCount} kritiske`,
    detail: `${summary.missingMeta} metadata-mangler · ${summary.duplicates} duplikat-titler · ${summary.missingCategory} uten kategori.`,
    why: "Advarsler bør fikses før du skalerer organisk trafikk.",
    tone:
      summary.criticalCount > 0 || summary.warningCount > 5
        ? "warning"
        : "positive",
  });

  insights.push({
    id: "opps",
    kind: "opportunity",
    question: "Opportunities?",
    title: `${summary.opportunityCount} muligheter`,
    detail: `${summary.missingFaq} uten FAQ-signal · ${summary.missingAlt} uten lagret alt-tekst.`,
    why: "Opportunities er ikke blockers — men forbedrer snippet, long-tail og a11y.",
    tone: "neutral",
  });

  // Worst pages with explanation
  const worst = [...results]
    .filter((r) => r.issues.length > 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);

  for (const page of worst) {
    const top = page.issues[0];
    insights.push({
      id: `page-${page.productId}`,
      kind: "metadata",
      question: "Hvorfor bør denne siden forbedres?",
      title: `${page.name} (score ${page.score})`,
      detail: page.issues
        .slice(0, 3)
        .map((i) => i.message)
        .join(" · "),
      why: top?.why || "Flere SEO-signaler mangler på produktsiden.",
      path: page.path,
      tone: page.score < 50 ? "warning" : "neutral",
    });
  }

  if (summary.duplicates > 0) {
    insights.push({
      id: "dupes",
      kind: "duplicate",
      question: "Duplikater?",
      title: `${summary.duplicates} produkter med duplikat meta title`,
      detail: "Finn og unik-gjør titles manuelt — AI skriver ikke om automatisk.",
      why: "Duplikate titles svekker klarhet i søkeresultater og kan splitte ranking.",
      tone: "warning",
    });
  }

  return insights;
}
