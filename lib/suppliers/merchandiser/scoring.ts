/**
 * Heuristic + weighted overall merchandiser scoring.
 * Provider-agnostic — uses SupplierSearchProduct / SupplierProductDetail.
 */

import type {
  SupplierProductDetail,
  SupplierSearchProduct,
} from "@/lib/suppliers/provider";
import { estimateMerchandiserPricing } from "@/lib/suppliers/merchandiser/pricing-advice";
import { getActiveBatchTimer } from "@/lib/buyer/batch-timing";
import { scoreMarginPotential } from "@/lib/buyer/margin-policy";
import type {
  MerchandiserAnalysis,
  MerchandiserMarketProfile,
  MerchandiserRiskFlag,
  MerchandiserScoreBreakdown,
  MerchandiserShelf,
  MerchandiserVisualAdvice,
  ShopProfileData,
} from "@/lib/suppliers/merchandiser/types";

const WEIGHTS: Record<keyof Omit<MerchandiserScoreBreakdown, "overall">, number> = {
  visualQuality: 10,
  marketFit: 12,
  marginPotential: 12,
  norwegianAudience: 10,
  competitionRisk: 6,
  brandPotential: 6,
  imageQuality: 10,
  specificationQuality: 8,
  categoryFit: 10,
  shippingQuality: 5,
  variantQuality: 6,
  seoPotential: 5,
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function textBlob(p: {
  title?: string | null;
  category?: string | null;
  description?: string;
}): string {
  return `${p.title || ""} ${p.category || ""} ${p.description || ""}`.toLowerCase();
}

export function inferShelf(
  product: { title?: string | null; category?: string | null; listedCount?: number | null },
  preferred?: MerchandiserShelf
): MerchandiserShelf {
  if (preferred && preferred !== "today") return preferred;
  const t = textBlob(product);
  if (/(gaming|spill|rgb|mechanical keyboard|gamepad)/.test(t)) return "gaming";
  if (/(phone|mobil|iphone|samsung|case|deksel|powerbank|ladekabel)/.test(t)) return "mobil";
  if (/(office|kontor|keyboard|mouse|mus|laptop|usb hub|monitor)/.test(t)) return "kontor";
  if (/(home|hjem|smart home|led|lamp)/.test(t)) return "hjem";
  if ((product.listedCount || 0) > 5000) return "trending";
  if (/(electronic|elektronikk|audio|headphone|earbuds)/.test(t)) return "elektronikk";
  return preferred || "today";
}

export function inferCategoryHint(product: {
  title?: string | null;
  category?: string | null;
}): string | null {
  const t = textBlob(product);
  if (/(gaming|spill)/.test(t)) return "Gaming";
  if (/(mobil|phone|case|deksel)/.test(t)) return "Mobil & Tilbehør";
  if (/(pc|laptop|keyboard|mouse|mus|usb)/.test(t)) return "Data & IT";
  if (/(tv|audio|speaker|headphone)/.test(t)) return "TV, Lyd & Bilde";
  if (product.category) return product.category;
  return "Hjem & Fritid";
}

function scoreCategoryFit(
  product: { title?: string | null; category?: string | null },
  profile: ShopProfileData
): number {
  const hint = inferCategoryHint(product);
  const cats = profile.categories.map((c) => c.toLowerCase());
  const avoid = (profile.avoidCategories || []).map((c) => c.toLowerCase());
  const blob = textBlob(product);

  if (avoid.some((a) => a && blob.includes(a.toLowerCase().slice(0, 8)))) return 25;
  if (hint && cats.some((c) => c.includes(hint.split("&")[0].trim().toLowerCase()) || hint.toLowerCase().includes(c.split("&")[0].trim()))) {
    return 90;
  }
  if (/(gaming|mobil|usb|mouse|keyboard|earbuds|charger)/.test(blob)) return 75;
  return 45;
}

function buildVisualFromSearch(p: SupplierSearchProduct): MerchandiserVisualAdvice {
  const hasImage = Boolean(p.imageUrl);
  return {
    premiumFeel: hasImage ? 55 : 20,
    whiteBackgroundLikely: false,
    resolutionHint: hasImage ? "medium" : "unknown",
    watermarkRisk: false,
    chineseTextRisk: /[\u4e00-\u9fff]/.test(p.title || ""),
    lifestyleImages: false,
    packagingVisible: false,
    summary: hasImage
      ? "Har hovedbilde — full visuell analyse krever detalj/AI."
      : "Mangler bilde.",
    aiAnalyzed: false,
  };
}

function buildVisualFromDetail(d: SupplierProductDetail): MerchandiserVisualAdvice {
  const n = d.images?.length || 0;
  const chinese =
    /[\u4e00-\u9fff]/.test(d.title) ||
    /[\u4e00-\u9fff]/.test(d.description || "") ||
    Object.values(d.specifications || {}).some((v) => /[\u4e00-\u9fff]/.test(String(v)));
  return {
    premiumFeel: clamp(30 + n * 8),
    whiteBackgroundLikely: n >= 3,
    resolutionHint: n >= 5 ? "high" : n >= 2 ? "medium" : n === 1 ? "low" : "unknown",
    watermarkRisk: false,
    chineseTextRisk: chinese,
    lifestyleImages: n >= 6,
    packagingVisible: n >= 4,
    summary:
      n === 0
        ? "Ingen bilder."
        : `${n} bilder. ${chinese ? "Kinesisk tekst i data — risiko for butikk." : "Ingen åpenbar kinesisk tekst."}`,
    aiAnalyzed: false,
  };
}

function buildMarket(
  product: { title?: string | null; category?: string | null; price?: number },
  profile: ShopProfileData,
  categoryFit: number
): MerchandiserMarketProfile {
  const t = textBlob(product);
  const impulse = (product.price || 0) > 0 && (product.price || 0) < 25;
  const gift = /(gift|gave|set|kit|rgb)/.test(t);
  const niche = /(niche|pro |industrial|lab )/.test(t);
  const seasonal = /(christmas|halloween|summer|winter|jul)/.test(t);
  const gaming = /gaming/.test(t);
  const fitsStore = categoryFit >= 60;

  let persona = "Norsk tech-interessert forbruker";
  if (gaming) persona = "Gamer 16–35 som vil ha synlig RGB/ytelse til fornuftig pris";
  else if (/mobil|phone|case/.test(t)) persona = "Mobilbruker som trenger praktisk tilbehør";
  else if (impulse) persona = "Impulskjøper i checkout / gaveleter";

  return {
    fitsStore,
    buyerPersona: persona,
    impulseBuy: impulse,
    giftPotential: gift || impulse,
    niche,
    seasonal,
    broadAudience: !niche && categoryFit >= 70,
    summary: fitsStore
      ? `Passer ${profile.name}: ${persona}.`
      : `Svakere fit for ${profile.name} — vurder kun ved høy margin/visuell styrke.`,
  };
}

function collectRisks(input: {
  imageCount: number;
  variantCount: number;
  specCount: number;
  stock: number | null;
  hasVideo: boolean;
  descriptionLen: number;
  price: number;
  visual: MerchandiserVisualAdvice;
}): MerchandiserRiskFlag[] {
  const risks: MerchandiserRiskFlag[] = [];
  if (input.variantCount > 40) risks.push("too_many_variants");
  if (input.imageCount < 2) risks.push("too_few_images");
  if (input.specCount < 2) risks.push("missing_specs");
  if (input.descriptionLen < 40) risks.push("unclear_description");
  if (input.stock != null && input.stock < 5) risks.push("low_stock");
  if (!input.hasVideo) risks.push("missing_video");
  if (input.price <= 0) risks.push("zero_price");
  if (input.visual.watermarkRisk) risks.push("watermark_suspected");
  if (input.visual.chineseTextRisk) risks.push("chinese_text_suspected");
  if (input.variantCount > 80 || (input.price <= 0 && input.imageCount === 0)) {
    risks.push("suspicious_product");
  }
  if (input.variantCount > 25 && input.specCount < 3) risks.push("return_risk");
  return risks;
}

function weightedOverall(scores: Omit<MerchandiserScoreBreakdown, "overall">): number {
  let sum = 0;
  let w = 0;
  for (const [key, weight] of Object.entries(WEIGHTS) as Array<
    [keyof typeof WEIGHTS, number]
  >) {
    sum += scores[key] * weight;
    w += weight;
  }
  return clamp(sum / w);
}

function buildReasons(scores: MerchandiserScoreBreakdown, risks: MerchandiserRiskFlag[]): string[] {
  const reasons: string[] = [];
  if (scores.imageQuality >= 75) reasons.push("Sterke produktbilder");
  if (scores.visualQuality >= 75) reasons.push("Premium visuelt inntrykk");
  if (scores.marginPotential >= 75) reasons.push("Sunn marginpotensial");
  if (scores.categoryFit >= 80) reasons.push("Passer butikkens kategorier");
  if (scores.shippingQuality >= 70) reasons.push("Akseptabel levering/lager");
  if (scores.variantQuality >= 70) reasons.push("Fornuftig variantstruktur");
  if (scores.specificationQuality >= 70) reasons.push("Gode spesifikasjoner");
  if (scores.norwegianAudience >= 75) reasons.push("Treffer norsk målgruppe");
  if (scores.seoPotential >= 70) reasons.push("SEO-potensial");
  if (risks.includes("low_stock")) reasons.push("Lav lagerstatus — vær obs");
  if (risks.includes("chinese_text_suspected")) reasons.push("Kinesisk tekst i data");
  if (risks.includes("too_few_images")) reasons.push("Få bilder");
  if (reasons.length === 0) reasons.push("Moderat kandidat — vurder manuelt");
  return reasons.slice(0, 8);
}

function explain(overall: number, reasons: string[]): string {
  return `Score ${overall}/100. ${reasons.slice(0, 5).join(". ")}.`;
}

type ScoreContext = {
  profile: ShopProfileData;
  shelf?: MerchandiserShelf;
};

/** Fast path from catalog search cards. */
export function analyzeSearchProduct(
  product: SupplierSearchProduct,
  ctx: ScoreContext
): MerchandiserAnalysis {
  const timer = getActiveBatchTimer();
  const preT0 = performance.now();

  const visual = buildVisualFromSearch(product);
  const categoryFit = scoreCategoryFit(product, ctx.profile);
  const market = buildMarket(product, ctx.profile, categoryFit);
  const preMs = performance.now() - preT0;

  // Pricing internals report price/shipping/currency on the active timer
  const pricing = estimateMerchandiserPricing({
    supplierPrice: product.price,
    currency: product.currency,
    weightGrams: product.weightGrams,
    category: product.category,
    title: product.title,
    profile: ctx.profile,
    inStock: product.stock == null ? undefined : product.stock > 0,
    variantCount: product.variantCount,
  });

  const dimsT0 = performance.now();
  const imageQuality = product.imageUrl ? 62 : 15;
  const visualQuality = clamp((visual.premiumFeel + imageQuality) / 2);
  const marginPotential = scoreMarginPotential(pricing.estimatedMarginPct);
  const norwegianAudience = clamp(
    40 +
      (market.fitsStore ? 25 : 0) +
      (market.impulseBuy ? 10 : 0) +
      (visual.chineseTextRisk ? -20 : 10)
  );
  const competitionRisk = clamp(55 + (product.listedCount && product.listedCount > 8000 ? -15 : 10));
  const brandPotential = clamp(40 + (product.rating || 0) * 8 + (product.imageUrl ? 10 : 0));
  const specificationQuality = 40; // unknown at search level
  const shippingQuality = clamp(
    40 +
      (product.stock != null && product.stock > 20 ? 25 : product.stock && product.stock > 0 ? 10 : -10) +
      (product.deliveryTime ? 15 : 0)
  );
  const vc = product.variantCount || 0;
  const variantQuality =
    vc === 0 ? 45 : vc <= 12 ? 85 : vc <= 30 ? 70 : vc <= 50 ? 50 : 30;
  const seoPotential = clamp(
    40 + ((product.title?.length || 0) > 20 ? 20 : 0) + (categoryFit > 70 ? 20 : 0)
  );
  const marketFit = clamp(
    categoryFit * 0.55 + norwegianAudience * 0.25 + (market.broadAudience ? 15 : 5)
  );

  const dim: Omit<MerchandiserScoreBreakdown, "overall"> = {
    visualQuality,
    marketFit,
    marginPotential,
    norwegianAudience,
    competitionRisk,
    brandPotential,
    imageQuality,
    specificationQuality,
    categoryFit,
    shippingQuality,
    variantQuality,
    seoPotential,
  };
  const overall = weightedOverall(dim);
  const risks = collectRisks({
    imageCount: product.imageUrl ? 1 : 0,
    variantCount: vc,
    specCount: 0,
    stock: product.stock,
    hasVideo: false,
    descriptionLen: 0,
    price: product.price,
    visual,
  });
  const full: MerchandiserScoreBreakdown = { ...dim, overall };
  const reasons = buildReasons(full, risks);
  const inferred = inferShelf(
    { title: product.title, category: product.category, listedCount: product.listedCount },
    ctx.shelf
  );

  timer?.add("merchScore", preMs + (performance.now() - dimsT0));

  return {
    scores: full,
    reasons,
    risks,
    market,
    pricing,
    visual,
    explanation: explain(overall, reasons),
    shelf: ctx.shelf || inferred,
    categoryHint: inferCategoryHint(product),
  };
}

/** Deeper path when full SupplierProductDetail is available. */
export function analyzeProductDetail(
  detail: SupplierProductDetail,
  ctx: ScoreContext,
  visualOverride?: MerchandiserVisualAdvice | null
): MerchandiserAnalysis {
  const visual = visualOverride || buildVisualFromDetail(detail);
  const categoryFit = scoreCategoryFit(detail, ctx.profile);
  const market = buildMarket(
    { title: detail.title, category: detail.category, price: detail.price },
    ctx.profile,
    categoryFit
  );
  const pricing = estimateMerchandiserPricing({
    supplierPrice: detail.price,
    currency: detail.currency,
    shipping: detail.shippingEstimate,
    weightGrams: detail.weightGrams,
    category: detail.category,
    title: detail.title,
    profile: ctx.profile,
    inStock: detail.stock == null ? undefined : detail.stock > 0,
    variantCount: detail.variants?.length || 0,
    variantPrices: (detail.variants || [])
      .map((v) => Number(v.price))
      .filter((p) => Number.isFinite(p) && p > 0),
  });

  const imageCount = detail.images?.length || 0;
  const imageQuality = clamp(imageCount === 0 ? 10 : 35 + imageCount * 10);
  const visualQuality = clamp(
    visual.premiumFeel * 0.5 +
      imageQuality * 0.35 +
      (visual.watermarkRisk || visual.chineseTextRisk ? -20 : 10) +
      (visual.whiteBackgroundLikely ? 8 : 0)
  );
  const marginPotential = Math.min(
    100,
    scoreMarginPotential(pricing.estimatedMarginPct) +
      (pricing.premiumPotential ? 4 : 0)
  );
  const norwegianAudience = clamp(
    45 +
      (market.fitsStore ? 25 : 0) +
      (visual.chineseTextRisk ? -25 : 12) +
      (market.giftPotential ? 8 : 0)
  );
  const competitionRisk = clamp(
    50 + ((detail.listedCount || 0) > 10000 ? -20 : 15) + (imageCount >= 4 ? 10 : 0)
  );
  const brandPotential = clamp(
    35 + imageCount * 5 + (detail.videos?.length ? 10 : 0) + (Object.keys(detail.specifications || {}).length > 4 ? 15 : 0)
  );
  const specCount = Object.keys(detail.specifications || {}).length;
  const specificationQuality = clamp(specCount === 0 ? 20 : 40 + specCount * 8);
  const shippingQuality = clamp(
    35 +
      (detail.stock != null && detail.stock > 30 ? 30 : detail.stock && detail.stock > 0 ? 12 : -15) +
      (detail.deliveryTime ? 20 : 0) +
      (detail.warehouse && detail.warehouse !== "CN" ? 10 : 0)
  );
  const vc = detail.variants?.length || 0;
  const variantQuality =
    vc === 0 ? 50 : vc <= 12 ? 88 : vc <= 25 ? 72 : vc <= 40 ? 55 : 28;
  const seoPotential = clamp(
    35 +
      Math.min(25, (detail.title?.length || 0) / 3) +
      (specCount > 3 ? 15 : 0) +
      (categoryFit > 70 ? 15 : 0)
  );
  const marketFit = clamp(
    categoryFit * 0.5 + norwegianAudience * 0.3 + (market.fitsStore ? 15 : 0)
  );

  const dim: Omit<MerchandiserScoreBreakdown, "overall"> = {
    visualQuality,
    marketFit,
    marginPotential,
    norwegianAudience,
    competitionRisk,
    brandPotential,
    imageQuality,
    specificationQuality,
    categoryFit,
    shippingQuality,
    variantQuality,
    seoPotential,
  };
  const overall = weightedOverall(dim);
  const risks = collectRisks({
    imageCount,
    variantCount: vc,
    specCount,
    stock: detail.stock,
    hasVideo: (detail.videos?.length || 0) > 0,
    descriptionLen: (detail.description || "").length,
    price: detail.price,
    visual,
  });
  const full: MerchandiserScoreBreakdown = { ...dim, overall };
  const reasons = buildReasons(full, risks);
  const inferred = inferShelf(
    { title: detail.title, category: detail.category, listedCount: detail.listedCount },
    ctx.shelf
  );

  return {
    scores: full,
    reasons,
    risks,
    market,
    pricing,
    visual,
    explanation: explain(overall, reasons),
    shelf: ctx.shelf || inferred,
    categoryHint: inferCategoryHint(detail),
  };
}
