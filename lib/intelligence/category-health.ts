/**
 * Category health scoring from live Product catalog.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { getAllDbValues } from "@/lib/categories";
import type { CategoryHealth, CategoryStrategyTag } from "@/lib/intelligence/types";

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseImages(images: string): number {
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).length;
  } catch {
    if (images?.includes("http")) return images.split(",").filter(Boolean).length;
  }
  return images?.trim() ? 1 : 0;
}

function marginPct(price: number, supplierPrice: number | null | undefined): number | null {
  if (!supplierPrice || supplierPrice <= 0 || price <= 0) return null;
  return ((price - supplierPrice) / price) * 100;
}

type ProductRow = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  supplierPrice: number | null;
  images: string;
  metaTitle: string | null;
  metaDescription: string | null;
  isActive: boolean;
  supplierName: string | null;
  aiCategoryStatus: string | null;
  _count: { variants: number };
};

export async function loadCatalogProducts(storeId?: string | null): Promise<ProductRow[]> {
  // Cap transfer — category health must not pull entire catalog unbounded
  const take = Number(process.env.INTEL_CATALOG_TAKE || 2500);
  return prisma.product.findMany({
    where: storeId ? { storeId } : undefined,
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      supplierPrice: true,
      images: true,
      metaTitle: true,
      metaDescription: true,
      isActive: true,
      supplierName: true,
      aiCategoryStatus: true,
      _count: { select: { variants: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: Number.isFinite(take) && take > 0 ? take : 2500,
  });
}

export function analyzeCategoryHealth(
  products: ProductRow[],
  reviewByCategory: Record<string, number> = {}
): CategoryHealth[] {
  const known = getAllDbValues();
  const byCat = new Map<string, ProductRow[]>();

  for (const p of products) {
    const cat = p.category && known.includes(p.category) ? p.category : p.category || "Ukategorisert";
    const list = byCat.get(cat) || [];
    list.push(p);
    byCat.set(cat, list);
  }

  // Ensure known categories appear even if empty
  for (const cat of known) {
    if (!byCat.has(cat)) byCat.set(cat, []);
  }

  const totalActive = products.filter((p) => p.isActive).length || 1;
  const results: CategoryHealth[] = [];

  for (const [category, rows] of byCat) {
    const active = rows.filter((p) => p.isActive);
    const inactive = rows.filter((p) => !p.isActive);
    const prices = active.map((p) => p.price).filter((n) => n > 0);
    const margins = active
      .map((p) => marginPct(p.price, p.supplierPrice))
      .filter((n): n is number => n != null);

    const imageCounts = active.map((p) => parseImages(p.images));
    const avgImages =
      imageCounts.length > 0
        ? imageCounts.reduce((a, b) => a + b, 0) / imageCounts.length
        : 0;
    const imageScore = clamp(avgImages === 0 ? 10 : 30 + avgImages * 12);

    const seoOk = active.filter((p) => p.metaTitle && p.metaDescription).length;
    const seoScore =
      active.length === 0 ? 0 : clamp((seoOk / active.length) * 100);

    const aiOk = active.filter(
      (p) =>
        p.aiCategoryStatus === "applied" ||
        p.aiCategoryStatus === "corrected" ||
        (p.metaTitle && p.metaDescription)
    ).length;
    const aiScore =
      active.length === 0 ? 0 : clamp(40 + (aiOk / Math.max(1, active.length)) * 60);

    const variantTotal = rows.reduce((s, p) => s + (p._count.variants || 0), 0);
    const avgVariants = rows.length ? variantTotal / rows.length : 0;

    const supplierMix: Record<string, number> = {};
    for (const p of rows) {
      const key = p.supplierName || "ukjent";
      supplierMix[key] = (supplierMix[key] || 0) + 1;
    }

    const avgPrice =
      prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    const avgMargin =
      margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : null;

    const share = active.length / totalActive;
    const strategy: CategoryStrategyTag[] = [];

    if (active.length === 0) strategy.push("too_small");
    else if (share < 0.05 && active.length < 5) strategy.push("too_small");
    else if (share > 0.4 || active.length > 80) strategy.push("overrepresented");
    else strategy.push("balanced");

    if (prices.length >= 3) {
      const sorted = [...prices].sort((a, b) => a - b);
      const low = sorted[Math.floor(sorted.length * 0.2)];
      const high = sorted[Math.floor(sorted.length * 0.8)];
      if (high < (avgPrice || 0) * 1.4) strategy.push("missing_premium");
      if (low > (avgPrice || 0) * 0.7) strategy.push("missing_budget");
      const midBand = prices.filter(
        (p) => p >= (avgPrice || 0) * 0.75 && p <= (avgPrice || 0) * 1.25
      );
      if (midBand.length < prices.length * 0.25) strategy.push("missing_mid");
    } else if (active.length > 0) {
      strategy.push("missing_premium", "missing_budget");
    }

    if (avgImages < 3 && active.length > 0) {
      // accessories often need more SKUs — soft signal via low depth
    }
    if (inactive.length > active.length && inactive.length > 3) {
      strategy.push("missing_newcomers");
    }

    const reviewBacklog = reviewByCategory[category] || 0;

    // Health composite
    let health = 50;
    if (active.length === 0) health = 15;
    else {
      health =
        20 +
        Math.min(25, active.length * 2) +
        imageScore * 0.15 +
        seoScore * 0.15 +
        aiScore * 0.1 +
        (avgMargin != null ? Math.min(20, avgMargin * 0.35) : 5) -
        (reviewBacklog > 5 ? 10 : 0) -
        (strategy.includes("too_small") ? 15 : 0) -
        (strategy.includes("overrepresented") ? 8 : 0);
    }
    health = clamp(health);

    const summaryParts: string[] = [];
    summaryParts.push(`${active.length} aktive / ${rows.length} totalt`);
    if (avgMargin != null) summaryParts.push(`snittmargin ~${Math.round(avgMargin)}%`);
    if (strategy.includes("too_small")) summaryParts.push("kategorien er for tynn");
    if (strategy.includes("overrepresented")) summaryParts.push("overrepresentert");
    if (strategy.includes("missing_premium")) summaryParts.push("mangler premium");
    if (seoScore < 50) summaryParts.push("svak SEO");

    results.push({
      category,
      productCount: rows.length,
      activeCount: active.length,
      publishedCount: active.length,
      inactiveCount: inactive.length,
      avgPrice: avgPrice != null ? Math.round(avgPrice) : null,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      avgMarginPct: avgMargin != null ? Math.round(avgMargin * 10) / 10 : null,
      variantTotal,
      avgVariants: Math.round(avgVariants * 10) / 10,
      imageScore,
      seoScore,
      aiScore,
      reviewBacklog,
      supplierMix,
      strategy,
      healthScore: health,
      summary: summaryParts.join(" · "),
    });
  }

  return results.sort((a, b) => b.healthScore - a.healthScore);
}
