/**
 * AI Marketing Insights — analysis only (no predictions, no ad actions).
 * Answers store questions in plain Norwegian with a clear "why".
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { cleanProductName } from "@/lib/utils/url-decode";
import { getMarketingDashboard } from "./marketing-dashboard";

export type MarketingInsightKind =
  | "most_viewed"
  | "most_clicked"
  | "most_carts"
  | "sells"
  | "does_not_sell"
  | "high_ctr_low_conv"
  | "low_ctr_high_conv"
  | "high_margin_high_conv"
  | "views_no_buy"
  | "carts_no_buy"
  | "high_bounce"
  | "info";

export type MarketingInsight = {
  id: string;
  kind: MarketingInsightKind;
  /** The question this insight answers */
  question: string;
  /** Short story headline */
  title: string;
  /** Full explanation (shown as body) */
  detail: string;
  /** Explicit why — for Desk emphasis */
  why: string;
  productId?: string;
  productName?: string;
  metric?: number;
  tone: "positive" | "warning" | "neutral";
};

type ProductFunnel = {
  productId: string;
  name: string;
  category: string | null;
  price: number;
  supplierPrice: number | null;
  views: number;
  carts: number;
  checkouts: number;
  purchases: number;
  revenue: number;
};

function pct(num: number, den: number): number | null {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 10000) / 100;
}

function marginPct(price: number, supplierPrice: number | null): number | null {
  if (supplierPrice == null || supplierPrice <= 0 || price <= 0) return null;
  return ((price - supplierPrice) / price) * 100;
}

function label(p: ProductFunnel): string {
  return cleanProductName(p.name);
}

function categoryHint(p: ProductFunnel): string {
  return p.category?.trim() || "produktet";
}

async function loadProductFunnels(
  storeId: string,
  rangeDays: number
): Promise<ProductFunnel[]> {
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);

  const events = await prisma.marketingEvent.findMany({
    where: {
      storeId,
      createdAt: { gte: since },
      productId: { not: null },
      event: {
        in: ["view_item", "add_to_cart", "begin_checkout", "purchase"],
      },
    },
    select: {
      event: true,
      productId: true,
      productName: true,
      value: true,
    },
    take: 20000,
  });

  const map = new Map<string, ProductFunnel>();
  for (const e of events) {
    const id = e.productId!;
    const row =
      map.get(id) ||
      ({
        productId: id,
        name: e.productName || id,
        category: null,
        price: 0,
        supplierPrice: null,
        views: 0,
        carts: 0,
        checkouts: 0,
        purchases: 0,
        revenue: 0,
      } satisfies ProductFunnel);
    if (e.productName) row.name = e.productName;
    if (e.event === "view_item") row.views += 1;
    if (e.event === "add_to_cart") row.carts += 1;
    if (e.event === "begin_checkout") row.checkouts += 1;
    if (e.event === "purchase") {
      row.purchases += 1;
      row.revenue += e.value ?? 0;
    }
    map.set(id, row);
  }

  const ids = [...map.keys()];
  if (ids.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      supplierPrice: true,
    },
  });

  for (const p of products) {
    const row = map.get(p.id);
    if (!row) continue;
    row.name = p.name;
    row.category = p.category;
    row.price = p.price;
    row.supplierPrice = p.supplierPrice;
  }

  return [...map.values()];
}

/**
 * Build story-style insights answering the core marketing questions.
 */
export async function getMarketingInsights(
  rangeDays = 7,
  storeId = DEFAULT_STORE_ID
): Promise<MarketingInsight[]> {
  const [funnels, dash] = await Promise.all([
    loadProductFunnels(storeId, rangeDays),
    getMarketingDashboard(rangeDays, storeId),
  ]);

  if (funnels.length === 0 && dash.empty) {
    return [
      {
        id: "waiting",
        kind: "info",
        question: "Hva skjer i markedsføringen?",
        title: "Jeg venter på signal",
        detail:
          "Når besøkende godtar cookies og ser produkter, begynner jeg å forklare hva som ses, klikkes og selger — uten å gjette.",
        why: "Ingen first-party funnel-events i perioden ennå.",
        tone: "neutral",
      },
    ];
  }

  const insights: MarketingInsight[] = [];
  const withViews = funnels.filter((p) => p.views >= 3);
  const period = `siste ${rangeDays} dager`;

  // 1. Mest sett
  const mostViewed = [...funnels].sort((a, b) => b.views - a.views)[0];
  if (mostViewed && mostViewed.views > 0) {
    insights.push({
      id: `viewed-${mostViewed.productId}`,
      kind: "most_viewed",
      question: "Hva blir mest sett?",
      title: `${label(mostViewed)} er mest sett`,
      detail: `${label(mostViewed)} (${categoryHint(mostViewed)}) har ${mostViewed.views} produktvisninger ${period}.`,
      why:
        mostViewed.purchases > 0
          ? `Trafikken fører også til ${mostViewed.purchases} kjøp — synlighet og salg henger sammen her.`
          : `Mange ser produktet, men det er få eller ingen kjøp ennå — synlighet alene er ikke nok.`,
      productId: mostViewed.productId,
      productName: label(mostViewed),
      metric: mostViewed.views,
      tone: mostViewed.purchases > 0 ? "positive" : "warning",
    });
  }

  // 2. Mest klikket (proxy: views as listing engagement, or carts as strong click)
  // "Klikket" ≈ view_item volume; strongest "click intent" often carts
  const mostClicked = [...funnels].sort((a, b) => b.views - a.views)[0];
  if (mostClicked && mostClicked.views > 0 && mostClicked !== mostViewed) {
    insights.push({
      id: `click-${mostClicked.productId}`,
      kind: "most_clicked",
      question: "Hva blir mest klikket?",
      title: `${label(mostClicked)} får flest produktklikk`,
      detail: `${mostClicked.views} visninger ${period} — det er det sterkeste klikksignalet vi har i first-party data.`,
      why: `Kundene åpner PDP for ${categoryHint(mostClicked)} oftere enn for andre varer i utvalget.`,
      productId: mostClicked.productId,
      productName: label(mostClicked),
      metric: mostClicked.views,
      tone: "neutral",
    });
  } else if (mostViewed && mostViewed.views > 0) {
    insights.push({
      id: `click-${mostViewed.productId}`,
      kind: "most_clicked",
      question: "Hva blir mest klikket?",
      title: `${label(mostViewed)} får flest produktklikk`,
      detail: `Samme produkt topper både synlighet og klikk med ${mostViewed.views} visninger.`,
      why: "I vår funnel er produktvisning det tydeligste klikksignalet etter listing.",
      productId: mostViewed.productId,
      productName: label(mostViewed),
      metric: mostViewed.views,
      tone: "neutral",
    });
  }

  // 3. Flest handlekurver
  const mostCarts = [...funnels].sort((a, b) => b.carts - a.carts)[0];
  if (mostCarts && mostCarts.carts > 0) {
    insights.push({
      id: `carts-${mostCarts.productId}`,
      kind: "most_carts",
      question: "Hva gir flest handlekurver?",
      title: `${label(mostCarts)} legges oftest i handlekurven`,
      detail: `${mostCarts.carts} add-to-cart ${period}${
        mostCarts.views > 0
          ? ` (${pct(mostCarts.carts, mostCarts.views)} % av visningene)`
          : ""
      }.`,
      why:
        mostCarts.purchases > 0
          ? `Kurven konverterer videre til ${mostCarts.purchases} kjøp — intensjonen er reell.`
          : `Sterk kjøpsintensjon i kurv, men kjøpene mangler — sjekk frakt, pris eller checkout.`,
      productId: mostCarts.productId,
      productName: label(mostCarts),
      metric: mostCarts.carts,
      tone: mostCarts.purchases > 0 ? "positive" : "warning",
    });
  }

  // 4. Hva selger?
  const sells = [...funnels]
    .filter((p) => p.purchases > 0)
    .sort((a, b) => b.purchases - a.purchases || b.revenue - a.revenue)[0];
  if (sells) {
    insights.push({
      id: `sells-${sells.productId}`,
      kind: "sells",
      question: "Hva selger?",
      title: `${label(sells)} selger`,
      detail: `${sells.purchases} kjøp og ca. ${Math.round(sells.revenue)} kr i omsetning ${period}.`,
      why: `${categoryHint(sells)} treffer kjøpere som faktisk betaler — ikke bare klikker.`,
      productId: sells.productId,
      productName: label(sells),
      metric: sells.purchases,
      tone: "positive",
    });
  }

  // 5. Hva selger ikke? (views but zero purchases)
  const doesNotSell = [...withViews]
    .filter((p) => p.purchases === 0)
    .sort((a, b) => b.views - a.views)[0];
  if (doesNotSell) {
    insights.push({
      id: `nosell-${doesNotSell.productId}`,
      kind: "does_not_sell",
      question: "Hva selger ikke?",
      title: `${label(doesNotSell)} selger ikke`,
      detail: `${doesNotSell.views} visninger og 0 kjøp ${period}${
        doesNotSell.carts > 0 ? `, til tross for ${doesNotSell.carts} handlekurver` : ""
      }.`,
      why: `Interesse finnes (${categoryHint(doesNotSell)}), men noe stopper kjøpet — pris, tillit, leveringstid eller feil forventning.`,
      productId: doesNotSell.productId,
      productName: label(doesNotSell),
      metric: doesNotSell.views,
      tone: "warning",
    });
  }

  // 6. Høy CTR, lav konvertering
  const highCtrLowConv = withViews
    .map((p) => ({
      p,
      ctr: p.views > 0 ? p.carts / p.views : 0,
      conv: p.views > 0 ? p.purchases / p.views : 0,
    }))
    .filter((x) => x.p.views >= 5 && x.ctr >= 0.08 && x.conv < 0.02)
    .sort((a, b) => b.ctr - a.ctr)[0];
  if (highCtrLowConv) {
    const { p, ctr, conv } = highCtrLowConv;
    insights.push({
      id: `ctr-lowconv-${p.productId}`,
      kind: "high_ctr_low_conv",
      question: "Hva har høy CTR men lav konvertering?",
      title: `${label(p)} har høy CTR men lav kjøpsrate`,
      detail: `${pct(p.carts, p.views)} % går til handlekurv, men bare ${pct(p.purchases, p.views)} % blir kjøp.`,
      why: `Folk er nysgjerrige på ${categoryHint(p)}, men dropper før betaling — klassisk friksjon i pris, frakt eller tillit.`,
      productId: p.productId,
      productName: label(p),
      metric: Math.round(ctr * 10000) / 100,
      tone: "warning",
    });
  }

  // 7. Lav CTR, høy konvertering
  const lowCtrHighConv = withViews
    .map((p) => ({
      p,
      ctr: p.views > 0 ? p.carts / p.views : 0,
      conv: p.views > 0 ? p.purchases / p.views : 0,
    }))
    .filter((x) => x.p.views >= 5 && x.ctr <= 0.06 && x.conv >= 0.03 && x.p.purchases > 0)
    .sort((a, b) => b.conv - a.conv)[0];
  if (lowCtrHighConv) {
    const { p, conv } = lowCtrHighConv;
    insights.push({
      id: `lowctr-highconv-${p.productId}`,
      kind: "low_ctr_high_conv",
      question: "Hva har lav CTR men høy konvertering?",
      title: `${label(p)} konverterer godt til tross for lav CTR`,
      detail: `Færre legger i kurv (${pct(p.carts, p.views)} %), men de som engasjerer kjøper (${pct(p.purchases, p.views)} %).`,
      why: `${categoryHint(p)} treffer en smal, kjøpsklar målgruppe — mindre støy, mer intensjon.`,
      productId: p.productId,
      productName: label(p),
      metric: Math.round(conv * 10000) / 100,
      tone: "positive",
    });
  }

  // 8. Høy margin + høy konvertering
  const highMarginHighConv = withViews
    .map((p) => ({
      p,
      margin: marginPct(p.price, p.supplierPrice),
      conv: p.views > 0 ? p.purchases / p.views : 0,
    }))
    .filter(
      (x) =>
        x.margin != null &&
        x.margin >= 45 &&
        x.p.purchases > 0 &&
        x.conv >= 0.02
    )
    .sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0))[0];
  if (highMarginHighConv) {
    const { p, margin, conv } = highMarginHighConv;
    insights.push({
      id: `margin-conv-${p.productId}`,
      kind: "high_margin_high_conv",
      question: "Hva har høy margin og høy konvertering?",
      title: `${label(p)} kombinerer god margin og salg`,
      detail: `Ca. ${Math.round(margin!)} % margin og ${pct(p.purchases, p.views)} % konvertering (${p.purchases} kjøp).`,
      why: `Dette er både lønnsomt og etterspurt — sterkt kandidat til manuell annonsering (jeg endrer ikke budsjett).`,
      productId: p.productId,
      productName: label(p),
      metric: Math.round(margin!),
      tone: "positive",
    });
  } else {
    // Fallback: sells well but low margin warning
    const lowMarginSeller = funnels
      .filter((p) => p.purchases > 0)
      .map((p) => ({ p, margin: marginPct(p.price, p.supplierPrice) }))
      .filter((x) => x.margin != null && x.margin < 30)
      .sort((a, b) => b.p.purchases - a.p.purchases)[0];
    if (lowMarginSeller) {
      const { p, margin } = lowMarginSeller;
      insights.push({
        id: `low-margin-sells-${p.productId}`,
        kind: "high_margin_high_conv",
        question: "Hva har høy margin og høy konvertering?",
        title: `${label(p)} selger, men med lav fortjeneste`,
        detail: `${p.purchases} kjøp, men bare ~${Math.round(margin!)} % margin.`,
        why: `Volum uten margin tærer på annonsekroner — ikke skalér ads før prising/kost er bedre.`,
        productId: p.productId,
        productName: label(p),
        metric: Math.round(margin!),
        tone: "warning",
      });
    }
  }

  // 9. Mange visninger, ingen kjøp (explicit question — always answer when data fits)
  const viewsNoBuy = [...withViews]
    .filter((p) => p.purchases === 0 && p.views >= 8)
    .sort((a, b) => b.views - a.views)[0];
  if (viewsNoBuy) {
    insights.push({
      id: `views-zero-${viewsNoBuy.productId}`,
      kind: "views_no_buy",
      question: "Hva har mange visninger og ingen kjøp?",
      title: `${label(viewsNoBuy)}: mange visninger, null kjøp`,
      detail: `${viewsNoBuy.views} visninger uten et eneste kjøp ${period}.`,
      why: `PDP tiltrekker, men konverterer ikke — typisk svak prisopplevelse, uklar verdi eller feil målgruppe.`,
      productId: viewsNoBuy.productId,
      productName: label(viewsNoBuy),
      metric: viewsNoBuy.views,
      tone: "warning",
    });
  }

  // Carts no buy
  const cartsNoBuy = [...funnels]
    .filter((p) => p.carts >= 3 && p.purchases === 0)
    .sort((a, b) => b.carts - a.carts)[0];
  if (cartsNoBuy) {
    insights.push({
      id: `carts-zero-${cartsNoBuy.productId}`,
      kind: "carts_no_buy",
      question: "Hva gir flest handlekurver uten kjøp?",
      title: `${label(cartsNoBuy)} fyller kurven uten at det blir kjøp`,
      detail: `${cartsNoBuy.carts} handlekurver, 0 kjøp.`,
      why: `Kjøpsintensjon er der — lekkasjen skjer i checkout (frakt, Vipps/kort, tillit eller totalpris).`,
      productId: cartsNoBuy.productId,
      productName: label(cartsNoBuy),
      metric: cartsNoBuy.carts,
      tone: "warning",
    });
  }

  // Bounce proxy
  if (
    dash.pageViews >= 20 &&
    dash.viewItem / Math.max(dash.pageViews, 1) < 0.15
  ) {
    insights.push({
      id: "bounce-proxy",
      kind: "high_bounce",
      question: "Hvor mister vi oppmerksomhet?",
      title: "Mange sidevisninger blir ikke produktklikk",
      detail: `Bare ${pct(dash.viewItem, dash.pageViews) ?? 0} % av sidevisninger blir produktvisning.`,
      why: "Trafikk treffer forsiden/kategori uten å gå videre — budskap, kategori eller landingsside matcher ikke intensjonen.",
      metric: pct(dash.viewItem, dash.pageViews) ?? 0,
      tone: "warning",
    });
  }

  // Prefer unique kinds, keep order of questions
  const seen = new Set<string>();
  const ordered: MarketingInsight[] = [];
  const kindOrder: MarketingInsightKind[] = [
    "most_viewed",
    "most_clicked",
    "most_carts",
    "sells",
    "does_not_sell",
    "high_ctr_low_conv",
    "low_ctr_high_conv",
    "high_margin_high_conv",
    "views_no_buy",
    "carts_no_buy",
    "high_bounce",
    "info",
  ];
  for (const kind of kindOrder) {
    for (const i of insights) {
      if (i.kind !== kind) continue;
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      ordered.push(i);
    }
  }

  return ordered.slice(0, 12);
}
