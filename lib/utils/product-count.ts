/**
 * Utility functions for consistent product counting
 * 
 * Ensures product counts always match what users can actually see
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

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

  return prisma.product.count({ where });
}

/**
 * Get count of products per category
 * Returns a map of category name to product count
 */
export async function getCategoryCounts(storeId?: string): Promise<Record<string, number>> {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      category: { not: null },
      ...(storeId ? { storeId } : {}),
    },
    select: {
      category: true,
    },
  });

  const counts: Record<string, number> = {};
  
  products.forEach((product) => {
    if (product.category) {
      counts[product.category] = (counts[product.category] || 0) + 1;
    }
  });

  return counts;
}

/**
 * Get all unique categories with their product counts
 */
export async function getCategoriesWithCounts(storeId?: string): Promise<Array<{
  name: string;
  count: number;
}>> {
  const counts = await getCategoryCounts(storeId);
  
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count); // Sort by count descending
}

/**
 * Get total count of active products
 */
export async function getTotalProductCount(storeId?: string): Promise<number> {
  return getProductCount({ isActive: true, storeId });
}

