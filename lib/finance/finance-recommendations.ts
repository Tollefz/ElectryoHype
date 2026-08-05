/**
 * Finance recommendations — insight only.
 * Never changes prices, never spends money.
 */

import "server-only";

import { DEFAULT_STORE_ID } from "@/lib/store";
import { getFinanceDashboard } from "./finance-dashboard";
import { getFinanceInsights } from "./finance-insights";
import { getFinanceMemory } from "./finance-memory";

export type FinanceRecommendation = {
  id: string;
  severity: "info" | "suggest" | "urgent";
  title: string;
  rationale: string;
  actionRequired: true;
};

export async function getFinanceRecommendations(
  rangeDays = 30,
  storeId = DEFAULT_STORE_ID
): Promise<FinanceRecommendation[]> {
  const [dash, insights, memory] = await Promise.all([
    getFinanceDashboard(rangeDays, storeId),
    getFinanceInsights(rangeDays, storeId),
    getFinanceMemory({ storeId }),
  ]);

  const recs: FinanceRecommendation[] = [];

  if (dash.empty) {
    return [
      {
        id: "no-data",
        severity: "info",
        title: "Ingen økonomianbefalinger ennå",
        rationale:
          "Jeg trenger betalte ordre og leverandørkost før jeg foreslår noe. Jeg endrer aldri priser automatisk.",
        actionRequired: true,
      },
    ];
  }

  const loss = insights.find((i) => i.kind === "loss_makers");
  if (loss && dash.lossMaking.some((p) => p.profit < 0 || (p.marginPct ?? 100) < 15)) {
    recs.push({
      id: "rec-loss",
      severity: "urgent",
      title: "Gjennomgå tapsgivende / lavmargin-produkter",
      rationale: `${loss.detail} Vurder pris, leverandørbytte eller pause — jeg endrer ikke priser.`,
      actionRequired: true,
    });
  }

  if (dash.netProfit < 0 && dash.paidOrders >= 3) {
    recs.push({
      id: "rec-net-neg",
      severity: "urgent",
      title: "Netto est. er negativ i perioden",
      rationale: `Netto ~${Math.round(dash.netProfit)} kr etter leverandørkost, Stripe og adSpend. Sjekk kost og annonsering manuelt.`,
      actionRequired: true,
    });
  }

  if (dash.roas != null && dash.roas < 1 && dash.adSpend > 0) {
    recs.push({
      id: "rec-roas",
      severity: "suggest",
      title: "ROAS under 1 — ikke skalér ads blindt",
      rationale: `ROAS ${dash.roas}x. Flytt budsjett til produkter med høy margin (se Finance Brain) — jeg publiserer ikke ads.`,
      actionRequired: true,
    });
  }

  const winner = dash.highestMargin[0];
  if (winner && (winner.marginPct ?? 0) >= 50) {
    recs.push({
      id: "rec-push-margin",
      severity: "suggest",
      title: `Prioriter «${winner.name}» (høy margin)`,
      rationale: `Margin ~${winner.marginPct} %. God kandidat til manuell synlighet/annonsering.`,
      actionRequired: true,
    });
  }

  if (memory.stories.some((s) => s.id.startsWith("rev-thin"))) {
    const s = memory.stories.find((x) => x.id.startsWith("rev-thin"))!;
    recs.push({
      id: "rec-thin",
      severity: "suggest",
      title: "Høy omsetning, tynn margin — ikke jage volum alene",
      rationale: `${s.text} ${s.why}`,
      actionRequired: true,
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: "rec-ok",
      severity: "info",
      title: "Økonomien ser stabil ut i snapshot",
      rationale: `Brutto ${Math.round(dash.grossProfit)} kr · netto est. ${Math.round(dash.netProfit)} kr. Fortsett å overvåke — ingen auto-pris.`,
      actionRequired: true,
    });
  }

  const rank = { urgent: 0, suggest: 1, info: 2 } as const;
  return [...recs]
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, 6);
}
