/**
 * Finance Insights — story facts about store economics (no LLM, no auto-pricing).
 */

import "server-only";

import { DEFAULT_STORE_ID } from "@/lib/store";
import { getFinanceDashboard } from "./finance-dashboard";
import { getFinanceMemory } from "./finance-memory";

export type FinanceInsightKind =
  | "gross"
  | "net"
  | "roi"
  | "loss_makers"
  | "winners"
  | "compare"
  | "thin_revenue"
  | "roas"
  | "aov"
  | "fx"
  | "shipping"
  | "info";

export type FinanceInsight = {
  id: string;
  kind: FinanceInsightKind;
  question: string;
  title: string;
  detail: string;
  why: string;
  tone: "positive" | "warning" | "neutral";
};

export async function getFinanceInsights(
  rangeDays = 30,
  storeId = DEFAULT_STORE_ID
): Promise<FinanceInsight[]> {
  const [dash, memory] = await Promise.all([
    getFinanceDashboard(rangeDays, storeId),
    getFinanceMemory({ storeId }),
  ]);

  if (dash.empty) {
    return [
      {
        id: "waiting",
        kind: "info",
        question: "Hvordan går butikkøkonomien?",
        title: "Finance Brain venter på signal",
        detail:
          "Når betalte ordre og katalogpriser finnes, forklarer jeg margin, fortjeneste og tapsbringere — uten å endre priser.",
        why: "Ingen betalte ordre eller aktive produkter i snapshot.",
        tone: "neutral",
      },
    ];
  }

  const insights: FinanceInsight[] = [];

  insights.push({
    id: "gross",
    kind: "gross",
    question: "Bruttofortjeneste?",
    title: `Bruttofortjeneste ${Math.round(dash.grossProfit)} kr`,
    detail: `Omsetning ${Math.round(dash.revenue)} kr − leverandørkost ${Math.round(dash.supplierCost)} kr (siste ${rangeDays} d).`,
    why: "Brutto = betalt ordresum minus estimert leverandørkost (Product.supplierPrice × antall).",
    tone: dash.grossProfit >= 0 ? "positive" : "warning",
  });

  insights.push({
    id: "net",
    kind: "net",
    question: "Nettofortjeneste?",
    title: `Netto (est.) ${Math.round(dash.netProfit)} kr`,
    detail: `Etter Stripe-gebyr ~${Math.round(dash.stripeFeesEst)} kr${
      dash.adSpend > 0 ? ` og adSpend ${Math.round(dash.adSpend)} kr` : ""
    }.`,
    why: "Netto est. = brutto − Stripe-estimat − adSpend fra MarketingDailyStat. Ikke fullt regnskap.",
    tone: dash.netProfit >= 0 ? "positive" : "warning",
  });

  if (dash.roi != null) {
    insights.push({
      id: "roi",
      kind: "roi",
      question: "ROI?",
      title: `ROI ${dash.roi} % på leverandørkost`,
      detail: `Bruttofortjeneste ${Math.round(dash.grossProfit)} kr / leverandørkost ${Math.round(dash.supplierCost)} kr.`,
      why: "ROI = bruttofortjeneste ÷ leverandørkost × 100 (butikkøkonomi, ikke investor-ROI).",
      tone: dash.roi >= 50 ? "positive" : dash.roi >= 0 ? "neutral" : "warning",
    });
  }

  const losses = dash.lossMaking.filter((p) => p.profit < 0 || (p.marginPct != null && p.marginPct < 15));
  if (losses.length > 0) {
    const names = losses.slice(0, 5).map((p) => p.name);
    insights.push({
      id: "losses",
      kind: "loss_makers",
      question: "Hva taper penger?",
      title:
        names.length === 1
          ? `${names[0]} taper eller har for lav margin`
          : `Disse produktene taper penger`,
      detail: names.join(" · "),
      why: "Solgt med negativ/lav fortjeneste, eller katalogmargin under 15–20 %.",
      tone: "warning",
    });
  }

  if (dash.profitable[0]) {
    const p = dash.profitable[0];
    insights.push({
      id: "winner",
      kind: "winners",
      question: "Hva er lønnsomt?",
      title: `${p.name} er blant de mest lønnsomme`,
      detail: `Fortjeneste ${Math.round(p.profit)} kr · margin ${p.marginPct ?? "—"} % · ${p.units} solgt.`,
      why: "Rangert på faktisk fortjeneste (salgspris − leverandørkost) i perioden.",
      tone: "positive",
    });
  }

  if (dash.highestMargin[0] && (dash.highestMargin[0].marginPct ?? 0) >= 45) {
    const p = dash.highestMargin[0];
    insights.push({
      id: "hi-margin",
      kind: "winners",
      question: "Høyeste margin?",
      title: `${p.name} gir høy margin`,
      detail: `Margin ~${p.marginPct} %.`,
      why: "marginPct = (pris − supplierPrice) / pris.",
      tone: "positive",
    });
  }

  if (dash.lowestMargin[0]) {
    const p = dash.lowestMargin[0];
    insights.push({
      id: "lo-margin",
      kind: "loss_makers",
      question: "Laveste margin?",
      title: `${p.name} har lavest margin`,
      detail: `Margin ~${p.marginPct ?? "—"} %.`,
      why: "Lavest marginPct blant solgte/katalog med kjent kost.",
      tone: "warning",
    });
  }

  const thin = memory.stories.find((s) => s.id.startsWith("rev-thin"));
  if (thin) {
    insights.push({
      id: thin.id,
      kind: "thin_revenue",
      question: "Høy omsetning, lav fortjeneste?",
      title: thin.text,
      detail: thin.why,
      why: "Memory: produkter med høy revenue og margin under ~35 %.",
      tone: "warning",
    });
  }

  const compare = memory.stories.find((s) => s.id.startsWith("fam-compare"));
  if (compare) {
    insights.push({
      id: compare.id,
      kind: "compare",
      question: "Hvilke kategorier er mer lønnsomme?",
      title: compare.text,
      detail: compare.why,
      why: "Sammenligning av snittmargin mellom produktfamilier i katalogen (fakta, ikke LLM).",
      tone: "positive",
    });
  } else {
    // Also surface any fam-hi story as softer compare context
    const famHi = memory.stories.find((s) => s.id.startsWith("fam-hi"));
    if (famHi) {
      insights.push({
        id: famHi.id,
        kind: "compare",
        question: "Hvilke kategorier er mer lønnsomme?",
        title: famHi.text,
        detail: famHi.why,
        why: "Familie med høy snittmargin i katalogen.",
        tone: "positive",
      });
    }
  }

  if (dash.aov != null) {
    insights.push({
      id: "aov",
      kind: "aov",
      question: "AOV?",
      title: `AOV ${Math.round(dash.aov)} kr`,
      detail: `${dash.paidOrders} betalte ordre · ${Math.round(dash.revenue)} kr omsetning.`,
      why: "AOV = total omsetning / antall betalte ordre i perioden.",
      tone: "neutral",
    });
  }

  if (dash.adSpend > 0) {
    insights.push({
      id: "roas",
      kind: "roas",
      question: "ROAS / CPA / CAC?",
      title: `ROAS ${dash.roas ?? "—"}x · CPA ${dash.cpa ?? "—"} · CAC ${dash.cac ?? "—"}`,
      detail: `AdSpend ${Math.round(dash.adSpend)} kr · ${dash.uniqueCustomers} unike kunder.`,
      why: "ROAS = revenue/adSpend. CPA = adSpend/ordre. CAC ≈ adSpend/unike kunder (inntil bedre attribusjon).",
      tone: dash.roas != null && dash.roas >= 1 ? "positive" : "warning",
    });
  }

  insights.push({
    id: "shipping",
    kind: "shipping",
    question: "Frakt?",
    title: `Innkrevd frakt ${Math.round(dash.shippingCollected)} kr`,
    detail: "Sum Order.shippingCost på betalte ordre i perioden.",
    why: "Kunde betalt frakt — ikke leverandørens fraktkost (den ligger ofte i landed cost).",
    tone: "neutral",
  });

  insights.push({
    id: "fx",
    kind: "fx",
    question: "Valuta?",
    title: `USD/NOK ${dash.fxUsdNok} (${dash.fxSource})`,
    detail: "Brukes når leverandørpriser konverteres til NOK i katalog/import.",
    why: "Fra lib/fx/usd-nok (live/env/fallback). Finance Brain endrer ikke FX.",
    tone: "neutral",
  });

  return insights;
}
