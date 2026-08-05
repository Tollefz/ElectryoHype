/**
 * Marketing recommendations — analysis only.
 * Never changes bids, never publishes ads.
 * Marketing Memory influences wording as insight — never auto-executes.
 */

import { getMarketingDashboard } from "./marketing-dashboard";
import { getMarketingInsights } from "./marketing-insights";
import { getMarketingMemory } from "./marketing-memory";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { prisma } from "@/lib/prisma";

export type MarketingRecommendation = {
  id: string;
  severity: "info" | "suggest" | "urgent";
  title: string;
  rationale: string;
  /** Explicit: human must act — AI does not execute */
  actionRequired: true;
  /** Optional: which memory story informed this */
  fromMemory?: string;
};

export async function getMarketingRecommendations(
  rangeDays = 7,
  storeId = DEFAULT_STORE_ID
): Promise<MarketingRecommendation[]> {
  const [dash, insights, memory] = await Promise.all([
    getMarketingDashboard(rangeDays, storeId),
    getMarketingInsights(rangeDays, storeId),
    getMarketingMemory({ storeId }),
  ]);

  const recs: MarketingRecommendation[] = [];

  if (dash.empty) {
    return [
      {
        id: "no-data",
        severity: "info",
        title: "Ingen anbefalinger ennå",
        rationale:
          "Jeg trenger ekte trafikk- og kjøpssignal før jeg foreslår budsjett eller produkter. Marketing Worker lærer når events finnes.",
        actionRequired: true,
      },
    ];
  }

  // Memory stories → insight recommendations (human must act)
  for (const story of memory.stories.slice(0, 2)) {
    if (story.polarity === "positive") {
      recs.push({
        id: `mem-pos-${story.id}`,
        severity: "suggest",
        title: `Memory: ${story.text.replace(/\.$/, "")} — vurder å prioritere denne kanalen`,
        rationale: `${story.why} Dette er innsikt fra tidligere funnel — jeg endrer ikke budsjett automatisk.`,
        actionRequired: true,
        fromMemory: story.text,
      });
    } else if (story.polarity === "negative") {
      recs.push({
        id: `mem-neg-${story.id}`,
        severity: "suggest",
        title: `Memory: ${story.text.replace(/\.$/, "")} — ikke skalér her`,
        rationale: `${story.why} Bruk dette som advarsel før mer adspend — du bestemmer.`,
        actionRequired: true,
        fromMemory: story.text,
      });
    }
  }

  const viewsNoBuy = insights.find((i) => i.kind === "views_no_buy");
  if (viewsNoBuy?.productName) {
    recs.push({
      id: `rec-pause-or-fix-${viewsNoBuy.productId}`,
      severity: "suggest",
      title: `Ikke skalér annonser for «${viewsNoBuy.productName}» ennå`,
      rationale: viewsNoBuy.why || viewsNoBuy.detail,
      actionRequired: true,
    });
  }

  const sells = insights.find((i) => i.kind === "sells");
  if (sells?.productName && (sells.metric ?? 0) >= 1) {
    const memHit = memory.stories.find((s) =>
      s.text.toLowerCase().includes((sells.productName || "").slice(0, 12).toLowerCase())
    );
    recs.push({
      id: `rec-boost-${sells.productId}`,
      severity: "suggest",
      title: `Dette produktet bør annonseres: «${sells.productName}»`,
      rationale: `${sells.why || sells.detail}${
        memHit ? ` Memory: ${memHit.text}` : ""
      } Flytt forsiktig budsjett hit — jeg endrer ikke bud automatisk.`,
      actionRequired: true,
      fromMemory: memHit?.text,
    });
  }

  const highCtrLow = insights.find((i) => i.kind === "high_ctr_low_conv");
  if (highCtrLow?.productName) {
    recs.push({
      id: `rec-ctr-gap-${highCtrLow.productId}`,
      severity: "suggest",
      title: `Høy CTR, lav kjøp: «${highCtrLow.productName}»`,
      rationale: highCtrLow.why || highCtrLow.detail,
      actionRequired: true,
    });
  }

  const marginWin = insights.find((i) => i.kind === "high_margin_high_conv");
  if (marginWin?.productName) {
    recs.push({
      id: `rec-margin-${marginWin.productId}`,
      severity: "suggest",
      title: `Prioriter margin + konvertering: «${marginWin.productName}»`,
      rationale: marginWin.why || marginWin.detail,
      actionRequired: true,
    });
  }

  const cartsNoBuy = insights.find((i) => i.kind === "carts_no_buy");
  if (cartsNoBuy) {
    recs.push({
      id: `rec-checkout-${cartsNoBuy.productId}`,
      severity: "urgent",
      title: "Stopp eller paus kampanje på produkter som fyller kurv uten kjøp",
      rationale: `${cartsNoBuy.why || cartsNoBuy.detail} Fiks checkout/frakt før mer adspend.`,
      actionRequired: true,
    });
  }

  if (dash.addToCart >= 10 && dash.purchases === 0) {
    recs.push({
      id: "rec-funnel-break",
      severity: "urgent",
      title: "Stopp kampanje-trafikk til checkout-feil er løst",
      rationale: `${dash.addToCart} add-to-cart og 0 kjøp siste ${rangeDays} dager.`,
      actionRequired: true,
    });
  }

  if (dash.roas != null && dash.roas < 1 && dash.adSpend > 0) {
    recs.push({
      id: "rec-roas",
      severity: "suggest",
      title: "Flytt budsjett fra lav ROAS til produkter med bevis",
      rationale: `ROAS er ${dash.roas}x. Bruk Marketing Score / Memory — jeg publiserer ikke endringer.`,
      actionRequired: true,
    });
  }

  const top = await prisma.marketingProductScore.findFirst({
    where: { storeId, rangeDays, overallScore: { gte: 70 } },
    orderBy: { overallScore: "desc" },
    include: { product: { select: { name: true } } },
  });
  if (top?.product) {
    recs.push({
      id: `rec-score-${top.productId}`,
      severity: "suggest",
      title: `Høy Marketing Score: «${top.product.name}» (${top.overallScore})`,
      rationale:
        "Produktet scorer høyt på CTR/konvertering/margin-fit. Vurder å prioritere i manuelt kampanjeoppsett.",
      actionRequired: true,
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: "rec-steady",
      severity: "info",
      title: "Hold kursen — ingen kritiske lekkasjer",
      rationale: `Siste ${rangeDays} dager: ${dash.purchases} kjøp, ${dash.addToCart} handlekurver.`,
      actionRequired: true,
    });
  }

  const rank = { urgent: 0, suggest: 1, info: 2 } as const;
  return [...recs]
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, 6);
}
