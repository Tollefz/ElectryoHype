/**
 * Fix living profile upsert for nullable storeId.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { getOrCreateShopProfile } from "@/lib/suppliers/merchandiser/shop-profile";
import { buildPreferenceModel } from "@/lib/intelligence/preferences";
import type { CategoryHealth } from "@/lib/intelligence/types";

export async function refreshLivingProfile(input: {
  storeId?: string | null;
  categories: CategoryHealth[];
  catalogTotals: { products: number; active: number };
}) {
  const base = await getOrCreateShopProfile(input.storeId);
  const prefs = await buildPreferenceModel(input.storeId);

  const activeCats = input.categories
    .filter((c) => c.activeCount > 0 && c.category !== "Ukategorisert")
    .sort((a, b) => b.activeCount - a.activeCount);

  const totalActive = Math.max(1, input.catalogTotals.active);
  const categoryFocus = activeCats.slice(0, 6).map((c) => ({
    category: c.category,
    count: c.activeCount,
    share: Math.round((c.activeCount / totalActive) * 1000) / 10,
  }));

  const topShare = categoryFocus[0]?.share || 0;
  const avgMarginVals = activeCats
    .map((c) => c.avgMarginPct)
    .filter((n): n is number => n != null);
  const avgMargin =
    avgMarginVals.length > 0
      ? avgMarginVals.reduce((a, b) => a + b, 0) / avgMarginVals.length
      : null;

  const avgPriceVals = activeCats
    .map((c) => c.avgPrice)
    .filter((n): n is number => n != null);
  const avgPrice =
    avgPriceVals.length > 0
      ? avgPriceVals.reduce((a, b) => a + b, 0) / avgPriceVals.length
      : null;

  let priceLevelHint = base.priceLevel;
  if (avgPrice != null) {
    if (avgPrice < 250) priceLevelHint = "budget-mid";
    else if (avgPrice > 900) priceLevelHint = "premium-mid";
    else priceLevelHint = "mid";
  }

  const qualityHint =
    activeCats.length > 0
      ? activeCats.reduce((s, c) => s + c.imageScore, 0) / activeCats.length >= 70
        ? "high"
        : "mixed"
      : base.qualityLevel;

  const brandHint =
    prefs.knownBrands > 0.6
      ? "Tenderer mot kjente merker"
      : prefs.knownBrands < 0.4
        ? "Åpen for no-name ved sterk margin/bilder"
        : "Blandet merkeprofil";

  const styleHint =
    prefs.manyImages > 0.6
      ? "Bildetung, premium presentasjon"
      : "Praktisk og funksjonell presentasjon";

  const focusNames = categoryFocus.map((c) => c.category).slice(0, 3);
  const identitySummary = [
    `${base.name} fremstår som en ${priceLevelHint}-butikk for norsk elektronikk.`,
    focusNames.length
      ? `Sterkest fokus: ${focusNames.join(", ")} (${topShare}% av aktive).`
      : "Katalogen er fortsatt tynn — bygg kjerneassortiment.",
    avgMargin != null ? `Snittmargin rundt ${Math.round(avgMargin)}%.` : "",
    prefs.gaming > 0.55 ? "Admin favoriserer gaming." : "",
    prefs.premium > 0.55 ? "Admin favoriserer premium-kandidater." : "",
    prefs.accessories > 0.55 ? "Tilbehør og økosystemprodukter prioriteres." : "",
    `Kvalitetsnivå: ${qualityHint}. ${brandHint}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const audienceHint =
    prefs.gaming > 0.55
      ? "Gamere og tech-interesserte 16–40 i Norge"
      : base.audience.slice(0, 160);

  const payload = {
    identitySummary,
    audienceHint,
    priceLevelHint,
    qualityHint,
    brandHint,
    styleHint,
    categoryFocus,
    preferenceModel: prefs,
    signalsUsed: {
      catalogProducts: input.catalogTotals.products,
      decisionsSample: prefs.sampleSize,
      refreshedFrom: "catalog+decisions",
    },
    refreshedAt: new Date(),
  };

  const existing = input.storeId
    ? await prisma.storeLivingProfile.findUnique({ where: { storeId: input.storeId } })
    : await prisma.storeLivingProfile.findFirst({ orderBy: { updatedAt: "desc" } });

  const row = existing
    ? await prisma.storeLivingProfile.update({
        where: { id: existing.id },
        data: payload,
      })
    : await prisma.storeLivingProfile.create({
        data: {
          storeId: input.storeId || null,
          ...payload,
        },
      });

  return {
    id: row.id,
    identitySummary: row.identitySummary,
    audienceHint: row.audienceHint,
    priceLevelHint: row.priceLevelHint,
    qualityHint: row.qualityHint,
    brandHint: row.brandHint,
    styleHint: row.styleHint,
    categoryFocus,
    preferenceModel: prefs as unknown as Record<string, number>,
  };
}
