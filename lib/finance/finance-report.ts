/**
 * Finance report — narrative for Desk.
 */

import type { FinanceDashboard } from "./finance-dashboard";
import type { FinanceInsight } from "./finance-insights";
import type { FinanceRecommendation } from "./finance-recommendations";
import type { FinanceMemorySnapshot } from "./finance-memory";

export type FinanceReport = {
  generatedAt: string;
  headline: string;
  summary: string;
  bullets: string[];
};

export function buildFinanceReport(input: {
  dashboard: FinanceDashboard;
  insights: FinanceInsight[];
  recommendations: FinanceRecommendation[];
  memory: FinanceMemorySnapshot;
}): FinanceReport {
  const { dashboard: d, insights, recommendations, memory } = input;
  const bullets: string[] = [];

  if (d.empty) {
    return {
      generatedAt: new Date().toISOString(),
      headline: "Finance Brain venter på data",
      summary:
        "Jeg er klar til å forklare butikkøkonomi — margin, fortjeneste, ROAS — uten å endre priser.",
      bullets: [
        "Betalte ordre gir omsetning og AOV",
        "supplierPrice gir kost og margin",
        "adSpend (hvis satt) gir ROAS/CPA/CAC",
      ],
    };
  }

  bullets.push(
    `Brutto ${Math.round(d.grossProfit)} kr · netto est. ${Math.round(d.netProfit)} kr`
  );
  if (d.aov != null) bullets.push(`AOV ${Math.round(d.aov)} kr`);
  if (d.roas != null) bullets.push(`ROAS ${d.roas}x`);
  if (memory.stories[0]) bullets.push(`Memory: ${memory.stories[0].text}`);
  for (const i of insights.filter((x) => x.tone === "warning").slice(0, 2)) {
    bullets.push(i.title);
  }
  if (recommendations[0]) {
    bullets.push(`Anbefaling: ${recommendations[0].title}`);
  }

  return {
    generatedAt: new Date().toISOString(),
    headline:
      recommendations.find((r) => r.severity === "urgent")?.title ||
      `Butikkøkonomi siste ${d.rangeDays} dager`,
    summary: `Memory ${memory.stats.memoryScore}/100. ${
      recommendations[0]?.rationale ||
      "Ingen kritiske tap i snapshot — jeg endrer ikke priser."
    }`,
    bullets: bullets.slice(0, 8),
  };
}
