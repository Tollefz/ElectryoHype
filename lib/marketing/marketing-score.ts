/**
 * Marketing Score — independent of Buyer / Merch Brain.
 * Analyse only; never triggers ads or budget changes.
 */

export type MarketingScoreInput = {
  productId: string;
  productName: string;
  category?: string | null;
  price: number;
  supplierPrice?: number | null;
  stock: number;
  isActive: boolean;
  views: number;
  addToCarts: number;
  beginCheckouts: number;
  purchases: number;
  revenue: number;
  /** Optional memory nudge −3..+3 */
  memoryNudge?: number;
  /** Category preferred by store (0–1) */
  storeFitHint?: number;
};

export type MarketingScoreBreakdown = {
  ctr: number;
  conversion: number;
  margin: number;
  profit: number;
  popularity: number;
  storeFit: number;
  inventory: number;
  returnRisk: number;
  marketingPotential: number;
  overall: number;
};

export type MarketingScoreResult = {
  productId: string;
  overallScore: number;
  breakdown: MarketingScoreBreakdown;
  reasons: string[];
  risks: string[];
  conversionPct: number | null;
  ctrPct: number | null;
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function marginPct(price: number, supplierPrice?: number | null): number | null {
  if (supplierPrice == null || supplierPrice <= 0 || price <= 0) return null;
  return ((price - supplierPrice) / price) * 100;
}

/**
 * Compute Marketing Score pillars for one product.
 */
export function computeMarketingProductScore(
  input: MarketingScoreInput
): MarketingScoreResult {
  const reasons: string[] = [];
  const risks: string[] = [];

  const views = Math.max(0, input.views);
  const carts = Math.max(0, input.addToCarts);
  const purchases = Math.max(0, input.purchases);
  const revenue = Math.max(0, input.revenue);

  const ctrPct = views > 0 ? (carts / views) * 100 : null;
  const conversionPct = views > 0 ? (purchases / views) * 100 : null;

  // CTR: cart/view (or soft default when no data)
  let ctr = 40;
  if (views >= 5 && ctrPct != null) {
    ctr = clamp(ctrPct * 8); // 12.5% cart rate → 100
    if (ctrPct >= 8) reasons.push(`Sterk CTR-proxy (${ctrPct.toFixed(1)} % kurv/visning)`);
    if (ctrPct < 2 && views >= 10) risks.push("Lav CTR — mange visninger, få handlekurver");
  }

  // Conversion: purchase/view
  let conversion = 35;
  if (views >= 5 && conversionPct != null) {
    conversion = clamp(conversionPct * 20); // 5% → 100
    if (conversionPct >= 3) reasons.push(`Høy konvertering (${conversionPct.toFixed(1)} %)`);
    if (views >= 8 && purchases === 0) {
      conversion = 10;
      risks.push("Mange visninger, null kjøp");
    }
  }

  // Margin
  const m = marginPct(input.price, input.supplierPrice);
  let margin = 45;
  if (m != null) {
    margin = clamp(m); // 50% margin → 50 score-ish; scale
    margin = clamp(m * 1.2);
    if (m >= 50) reasons.push(`God margin (~${Math.round(m)} %)`);
    if (m < 25) risks.push("Lav margin — dyrt å annonsere");
  }

  // Profit: revenue signal
  let profit = 30;
  if (revenue > 0) {
    profit = clamp(20 + Math.log10(revenue + 1) * 25);
    reasons.push(`Omsetning ${Math.round(revenue)} kr i perioden`);
  } else if (purchases === 0 && carts >= 3) {
    profit = 15;
    risks.push("Handlekurver uten inntekt");
  }

  // Popularity: views + carts volume
  const popularity = clamp(
    Math.min(100, views * 2 + carts * 5 + purchases * 15)
  );
  if (views >= 20) reasons.push("Høy popularitet (trafikk)");

  // Store fit
  const storeFit = clamp((input.storeFitHint ?? 0.55) * 100);
  if ((input.storeFitHint ?? 0) >= 0.75) reasons.push("God butikk-fit");

  // Inventory — dropship: stock>0 or active = OK
  let inventory = input.isActive ? 70 : 20;
  if (input.stock > 0) inventory = 85;
  if (!input.isActive) risks.push("Inaktivt produkt");

  // Return risk — soft heuristic (electronics dropship)
  let returnRisk = 65; // higher = safer for ads
  if (input.price > 1500) {
    returnRisk = 45;
    risks.push("Høy pris — høyere returrisiko ved ads");
  }
  if (m != null && m < 30) returnRisk = Math.min(returnRisk, 40);

  // Marketing potential — weighted blend before memory
  let marketingPotential = clamp(
    ctr * 0.15 +
      conversion * 0.25 +
      margin * 0.15 +
      profit * 0.15 +
      popularity * 0.1 +
      storeFit * 0.1 +
      inventory * 0.05 +
      returnRisk * 0.05
  );

  const nudge = input.memoryNudge ?? 0;
  let overall = clamp(marketingPotential + nudge);

  if (views === 0 && carts === 0 && purchases === 0) {
    overall = clamp(storeFit * 0.4 + margin * 0.3 + inventory * 0.3);
    reasons.push("Ingen funnel-data ennå — score basert på katalogsignal");
  }

  return {
    productId: input.productId,
    overallScore: Math.round(overall * 10) / 10,
    breakdown: {
      ctr: Math.round(ctr * 10) / 10,
      conversion: Math.round(conversion * 10) / 10,
      margin: Math.round(margin * 10) / 10,
      profit: Math.round(profit * 10) / 10,
      popularity: Math.round(popularity * 10) / 10,
      storeFit: Math.round(storeFit * 10) / 10,
      inventory: Math.round(inventory * 10) / 10,
      returnRisk: Math.round(returnRisk * 10) / 10,
      marketingPotential: Math.round(marketingPotential * 10) / 10,
      overall: Math.round(overall * 10) / 10,
    },
    reasons,
    risks,
    conversionPct: conversionPct != null ? Math.round(conversionPct * 100) / 100 : null,
    ctrPct: ctrPct != null ? Math.round(ctrPct * 100) / 100 : null,
  };
}
