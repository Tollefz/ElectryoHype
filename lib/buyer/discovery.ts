/**
 * Discovery tags from Merchandiser analysis + catalog gaps.
 */

import type { MerchandiserAnalysis } from "@/lib/suppliers/merchandiser/types";
import type {
  BuyerDiscoverySummary,
  DiscoveryTag,
} from "@/lib/buyer/types";

export function tagDiscovery(
  analysis: MerchandiserAnalysis,
  categoryHint?: string | null
): DiscoveryTag[] {
  const tags: DiscoveryTag[] = [];
  if (analysis.market.niche) tags.push("niche");
  if (analysis.pricing.premiumPotential) tags.push("premium");
  if (analysis.pricing.estimatedRetailNOK < 250) tags.push("budget");
  if (analysis.market.impulseBuy || analysis.market.giftPotential) {
    tags.push("accessory");
  }
  if (categoryHint && analysis.scores.categoryFit < 55) {
    tags.push("new_category");
  }
  if (analysis.market.summary?.toLowerCase().includes("tilbehør")) {
    tags.push("complementary");
  }
  return [...new Set(tags)];
}

export function summarizeDiscovery(
  rows: Array<{ discoveryTags: unknown; categoryHint?: string | null }>
): BuyerDiscoverySummary {
  const niches = new Set<string>();
  const newCategories = new Set<string>();
  const complementary = new Set<string>();
  let premiumCount = 0;
  let budgetCount = 0;
  let accessoryCount = 0;

  for (const r of rows) {
    const tags = Array.isArray(r.discoveryTags)
      ? (r.discoveryTags as string[])
      : [];
    if (tags.includes("niche")) niches.add(r.categoryHint || "Nisje");
    if (tags.includes("new_category") && r.categoryHint) {
      newCategories.add(r.categoryHint);
    }
    if (tags.includes("complementary") && r.categoryHint) {
      complementary.add(r.categoryHint);
    }
    if (tags.includes("premium")) premiumCount += 1;
    if (tags.includes("budget")) budgetCount += 1;
    if (tags.includes("accessory")) accessoryCount += 1;
  }

  return {
    niches: [...niches].slice(0, 12),
    newCategories: [...newCategories].slice(0, 12),
    complementary: [...complementary].slice(0, 12),
    premiumCount,
    budgetCount,
    accessoryCount,
  };
}
