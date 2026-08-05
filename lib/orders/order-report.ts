/**
 * Order report — narrative for Desk (analyse only).
 */

import type { OrderDashboard } from "./order-dashboard";
import type { OrderInsight } from "./order-insights";
import type { OrderMemorySnapshot } from "./order-memory";

export type OrderReport = {
  generatedAt: string;
  headline: string;
  summary: string;
  bullets: string[];
};

export function buildOrderReport(input: {
  dashboard: OrderDashboard;
  insights: OrderInsight[];
  memory: OrderMemorySnapshot;
  workerStatus?: string;
}): OrderReport {
  const { dashboard: d, insights, memory } = input;
  const bullets: string[] = [];

  if (d.empty) {
    return {
      generatedAt: new Date().toISOString(),
      headline: "Order Brain venter på ordre",
      summary:
        "Jeg er klar til å følge ordre-livssyklusen. Når betalte ordre kommer inn, forklarer jeg status, forsinkelser og leverandørmønstre — uten refusjon eller kundeavgjørelser.",
      bullets: [
        "Worker følger fulfillment-faser",
        "Memory lærer av leverandører og frakt",
        "Du godkjenner alltid menneskelige tiltak",
      ],
    };
  }

  bullets.push(
    `${d.orders24h} nye · ${d.processing} under behandling · ${d.shipped} sendt`
  );
  if (d.delayed > 0) bullets.push(`${d.delayed} forsinket`);
  if (d.exceptions > 0) bullets.push(`${d.exceptions} avvik`);
  if (d.delivered24h > 0) bullets.push(`${d.delivered24h} levert siste døgn`);

  if (memory.stories[0]) bullets.push(`Memory: ${memory.stories[0].text}`);
  for (const i of insights.filter((x) => x.tone === "warning").slice(0, 2)) {
    bullets.push(i.title);
  }

  const urgent = d.needsAttention > 0;
  return {
    generatedAt: new Date().toISOString(),
    headline: urgent
      ? `${d.needsAttention} ordre trenger oppmerksomhet`
      : `Order Brain: ${memory.stats.ordersSeen} ordre i hukommelsen`,
    summary: `Memory score ${memory.stats.memoryScore}/100. ${
      urgent
        ? "Se forsinkelser og avvik på Desk — jeg refunderer ikke automatisk."
        : "Ingen kritiske forsinkelser i snapshot."
    }`,
    bullets: bullets.slice(0, 8),
  };
}
