/**
 * Shop profile matching — 0–100 with explanation.
 * Composes Merchandiser scores + Store Memory (no duplicate scoring logic).
 */

import type { MerchandiserAnalysis } from "@/lib/suppliers/merchandiser/types";
import type { ShopProfileData } from "@/lib/suppliers/merchandiser/types";
import type { StoreMemoryData } from "@/lib/autonomy/memory";
import type { ShopMatchResult } from "@/lib/buyer/types";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeShopMatch(input: {
  analysis: MerchandiserAnalysis;
  profile: ShopProfileData;
  memory?: StoreMemoryData | null;
  memoryFit?: number | null;
}): ShopMatchResult {
  const { analysis, profile, memory, memoryFit } = input;
  const s = analysis.scores;
  const why: string[] = [];
  const risks: string[] = [];

  const category = s.categoryFit;
  const market = s.marketFit;
  const audience = s.norwegianAudience;
  const margin = s.marginPotential;
  const mem = clamp(memoryFit ?? 50);

  // Weighted shop match
  const pct = clamp(
    category * 0.28 +
      market * 0.22 +
      audience * 0.15 +
      margin * 0.15 +
      mem * 0.2
  );

  why.push(`Kategoritilpasning ${category}%`);
  why.push(`Markedsfit ${market}%`);
  why.push(`Norsk publikum ${audience}%`);
  why.push(`Marginpotensial ${margin}%`);
  why.push(`Store Memory-fit ${mem}%`);

  if (analysis.market.fitsStore) {
    why.push(`Passer butikkprofilen (${profile.name})`);
  } else {
    risks.push("Svak butikkfit ifølge Merchandiser");
  }

  if (memory?.favoriteCategories?.length) {
    const hit = memory.favoriteCategories.some((c) =>
      (analysis.market.summary || "").toLowerCase().includes(c.toLowerCase().slice(0, 5))
    );
    if (hit) why.push("Treffer favorittkategori fra hukommelse");
  }

  if (pct < 50) risks.push("Lav butikk-match — vurder avvisning");
  if (pct >= 90) why.push("Sterk ElectroHypeX-match");

  return { pct, why: why.slice(0, 8), risks };
}
