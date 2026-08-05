/**
 * Rebuild Categories — re-analyze entire catalog via Category Engine.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { categorizeProductsBatch, AI_CATEGORY_BATCH_SIZE } from "@/lib/admin/ai-categorize";
import {
  assertMainCategory,
  normalizeLegacyCategory,
  normalizeSubcategory,
} from "@/lib/categories/tree";
import { logError } from "@/lib/utils/logger";

export type RebuildCategoriesReport = {
  processed: number;
  applied: number;
  needsReview: number;
  unchanged: number;
  orphansFixed: number;
  errors: number;
  batches: number;
};

/**
 * Rebuild all product categories for a store (or entire catalog).
 * @param force — also overwrite products marked corrected
 */
export async function rebuildCategories(opts?: {
  storeId?: string;
  force?: boolean;
  limit?: number;
}): Promise<RebuildCategoriesReport> {
  const report: RebuildCategoriesReport = {
    processed: 0,
    applied: 0,
    needsReview: 0,
    unchanged: 0,
    orphansFixed: 0,
    errors: 0,
    batches: 0,
  };

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(opts?.storeId ? { storeId: opts.storeId } : {}),
    },
    select: {
      id: true,
      category: true,
      subcategory: true,
      specs: true,
      aiCategoryStatus: true,
    },
    take: opts?.limit && opts.limit > 0 ? opts.limit : undefined,
    orderBy: { updatedAt: "asc" },
  });

  // First pass: normalize orphans without AI (cheap)
  for (const p of products) {
    const main =
      assertMainCategory(p.category) ||
      normalizeLegacyCategory(p.category);
    if (!main) continue;
    if (main === p.category && (!p.subcategory || normalizeSubcategory(main, p.subcategory))) {
      continue;
    }
    const sub =
      normalizeSubcategory(main, p.subcategory) ||
      (p.specs &&
      typeof p.specs === "object" &&
      !Array.isArray(p.specs) &&
      normalizeSubcategory(
        main,
        String((p.specs as Record<string, unknown>)["Underkategori"] || "")
      ));

    try {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          category: main,
          subcategory: sub || null,
          ...(sub
            ? {
                specs: {
                  ...((p.specs &&
                  typeof p.specs === "object" &&
                  !Array.isArray(p.specs)
                    ? p.specs
                    : {}) as Record<string, unknown>),
                  Underkategori: sub,
                } as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
      if (main !== p.category) report.orphansFixed += 1;
    } catch (error) {
      logError(error, "[rebuild-categories:orphan]");
      report.errors += 1;
    }
  }

  const ids = products
    .filter((p) => opts?.force || p.aiCategoryStatus !== "corrected")
    .map((p) => p.id);

  for (let i = 0; i < ids.length; i += AI_CATEGORY_BATCH_SIZE) {
    const batch = ids.slice(i, i + AI_CATEGORY_BATCH_SIZE);
    report.batches += 1;
    try {
      const { summary } = await categorizeProductsBatch(batch, {
        force: opts?.force,
      });
      report.processed += batch.length;
      report.applied += summary.auto_applied || 0;
      report.needsReview += summary.needs_review || 0;
      report.unchanged += summary.unchanged || 0;
      report.errors += summary.error || 0;
    } catch (error) {
      logError(error, "[rebuild-categories:batch]");
      report.errors += batch.length;
      report.processed += batch.length;
    }
  }

  return report;
}
