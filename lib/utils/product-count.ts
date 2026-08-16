/**
 * Utility functions for consistent product counting.
 * Homepage path is cacheable (used inside unstable_cache).
 * Live listing counts still opt out of Full Route Cache via noStore.
 */

import { unstable_noStore as noStore } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "../safeQuery";
import { shouldUseDevFallback } from "./database-check";
import { getAllDbValues, getCategoryByDbValue } from "@/lib/categories";
import { normalizeLegacyCategory } from "@/lib/categories/tree";

/**
 * Get count of active products matching filters
 * Uses the same filters as the product listing
 */
export async function getProductCount(
  filters?: {
    category?: string;
    query?: string;
    minPrice?: number;
    maxPrice?: number;
    isActive?: boolean;
    storeId?: string;
  }
): Promise<number> {
  noStore();
  if (shouldUseDevFallback()) {
    return 0;
  }

  const where: Prisma.ProductWhereInput = {
    isActive: filters?.isActive !== undefined ? filters.isActive : true,
    ...(filters?.storeId ? { storeId: filters.storeId } : {}),
    ...(filters?.category ? { category: filters.category } : {}),
    ...(filters?.query
      ? {
          name: {
            contains: filters.query,
          },
        }
      : {}),
  };

  if (filters?.minPrice || filters?.maxPrice) {
    where.price = {};
    if (filters.minPrice) {
      where.price.gte = filters.minPrice;
    }
    if (filters.maxPrice) {
      where.price.lte = filters.maxPrice;
    }
  }

  return await safeQuery(() => prisma.product.count({ where }), 0, "product-count");
}

/**
 * Counts per allowlist main category (cache-safe — no noStore).
 * Uses groupBy instead of loading every product row.
 * Legacy names fold into allowlist via normalizeLegacyCategory.
 */
export async function getCategoryCounts(storeId?: string): Promise<Record<string, number>> {
  if (shouldUseDevFallback()) {
    return {};
  }

  const allowlist = getAllDbValues();
  const counts: Record<string, number> = Object.fromEntries(
    allowlist.map((c) => [c, 0])
  );

  const rows = await safeQuery(
    () =>
      prisma.product.groupBy({
        by: ["category"],
        where: {
          isActive: true,
          ...(storeId ? { storeId } : {}),
        },
        _count: { _all: true },
      }),
    [],
    "product-category-counts"
  );

  for (const row of rows) {
    const raw = row.category?.trim() || null;
    if (!raw) continue;
    const main =
      (allowlist.includes(raw) ? raw : null) || normalizeLegacyCategory(raw);
    if (main && counts[main] !== undefined) {
      counts[main] += row._count._all;
    }
  }

  return counts;
}

/**
 * Allowlist categories with counts for frontpage / nav.
 * Hides zero-count categories. Uses slug for hrefs.
 */
export async function getCategoriesWithCounts(storeId?: string): Promise<
  Array<{
    name: string;
    slug: string;
    count: number;
  }>
> {
  const counts = await getCategoryCounts(storeId);

  return getAllDbValues()
    .map((name) => {
      const def = getCategoryByDbValue(name);
      return {
        name,
        slug: def?.slug || name.toLowerCase(),
        count: counts[name] || 0,
      };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Get total count of active products
 */
export async function getTotalProductCount(storeId?: string): Promise<number> {
  return getProductCount({ isActive: true, storeId });
}
