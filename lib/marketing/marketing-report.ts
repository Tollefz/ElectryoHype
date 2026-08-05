/**
 * Marketing report — narrative for Desk / Mission Control.
 * Analyse only.
 */

import type { MarketingDashboard } from "./marketing-dashboard";
import type { MarketingInsight } from "./marketing-insights";
import type { MarketingRecommendation } from "./recommendations";
import type { MarketingMemorySnapshot } from "./marketing-memory";

export type MarketingReport = {
  generatedAt: string;
  headline: string;
  summary: string;
  bullets: string[];
};

export function buildMarketingReport(input: {
  dashboard: MarketingDashboard;
  insights: MarketingInsight[];
  recommendations: MarketingRecommendation[];
  memory: MarketingMemorySnapshot;
  workerStatus?: "running" | "idle" | "stopped" | "waiting";
}): MarketingReport {
  const { dashboard: d, insights, recommendations, memory } = input;
  const bullets: string[] = [];

  if (d.empty) {
    return {
      generatedAt: new Date().toISOString(),
      headline: "Marketing Brain venter på data",
      summary:
        "Jeg er klar til å lære av markedsføringen. Når events kommer inn, oppdaterer jeg Memory, Score og anbefalinger — uten å bruke penger eller publisere annonser.",
      bullets: [
        "Sett opp pixels / GTM",
        "Godta cookies i test og gå gjennom funnel",
        "Kjør Marketing Worker for å aggregere",
      ],
    };
  }

  bullets.push(
    `${d.sessions} sessions · ${d.addToCart} handlekurver · ${d.purchases} kjøp (siste ${d.rangeDays} d)`
  );
  if (d.conversionRate != null) {
    bullets.push(`Konvertering ${d.conversionRate} %`);
  }
  if (d.roas != null) bullets.push(`ROAS ${d.roas}x`);
  if (memory.stories[0]) {
    bullets.push(`Memory: ${memory.stories[0].text}`);
  }
  if (memory.highConversion[0]) {
    bullets.push(
      `Beste konvertering: ${memory.highConversion[0].name}`
    );
  }
  if (memory.neverBought[0]) {
    bullets.push(
      `Aldri kjøpt til tross for trafikk: ${memory.neverBought[0].name}`
    );
  }
  if (memory.channels[0]) {
    const ch = memory.channels[0];
    bullets.push(
      `Sterkeste kanal: ${ch.channel}${
        ch.conversionPct != null ? ` (${ch.conversionPct} % conv.)` : ""
      }`
    );
  }
  for (const i of insights.slice(0, 2)) {
    bullets.push(i.title);
  }
  if (recommendations[0]) {
    bullets.push(`Anbefaling: ${recommendations[0].title}`);
  }

  return {
    generatedAt: new Date().toISOString(),
    headline:
      recommendations.find((r) => r.severity === "urgent")?.title ||
      `Lærte av ${memory.stats.events} events`,
    summary: `Memory score ${memory.stats.memoryScore}/100. ${
      recommendations[0]?.rationale ||
      "Ingen kritiske lekkasjer — fortsett å samle signal."
    }`,
    bullets: bullets.slice(0, 8),
  };
}
