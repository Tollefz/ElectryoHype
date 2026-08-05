/**
 * AI product categorization — batch wrapper around Category Engine.
 *
 * Thresholds (production):
 *  - confidence >= 80 → auto-apply (always write category)
 *  - confidence < 80 → needs_review (still write provisional category)
 *
 * Never invents categories outside the store allowlist.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { isValidStoreCategory } from "@/lib/admin/suggest-category";
import {
  assignCategory,
  assignmentToProductFields,
  mergeSubcategoryIntoSpecs,
} from "@/lib/categories/engine";
import {
  assertMainCategory,
  listSubsFor,
  normalizeSubcategory,
} from "@/lib/categories/tree";
import { getCategoryLearning } from "@/lib/ops/category-learning";
import { logError } from "@/lib/utils/logger";

import {
  AI_CATEGORY_BATCH_SIZE,
  AI_CATEGORY_AUTO_MIN,
  AI_CATEGORY_APPROVAL_MIN,
} from "@/lib/admin/ai-categorize-constants";

export {
  AI_CATEGORY_BATCH_SIZE,
  AI_CATEGORY_AUTO_MIN,
  AI_CATEGORY_APPROVAL_MIN,
};

export type AiCategoryStatus =
  | "pending"
  | "needs_review"
  | "applied"
  | "corrected"
  | "dismissed";

export type AiCategoryDecision =
  | "auto_applied"
  | "pending_approval"
  | "needs_review"
  | "unchanged"
  | "error";

export type AiCategoryResult = {
  productId: string;
  name: string;
  previousCategory: string | null;
  suggestedCategory: string | null;
  subcategory: string | null;
  confidence: number;
  reason: string;
  decision: AiCategoryDecision;
  status: AiCategoryStatus | null;
  error?: string;
};

function parseImages(images: string): string[] {
  try {
    const parsed = JSON.parse(images);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function specsToRecord(specs: Prisma.JsonValue | null): Record<string, string> {
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) return {};
  return Object.fromEntries(
    Object.entries(specs as Record<string, unknown>).map(([k, v]) => [
      k,
      String(v ?? ""),
    ])
  );
}

function sanitizeCategory(raw: unknown): string | null {
  return assertMainCategory(String(raw ?? "").trim());
}

function sanitizeSubcategory(category: string | null, raw: unknown): string | null {
  if (!category) return null;
  return normalizeSubcategory(category, String(raw ?? "").trim());
}

/** Decode rough Temu original title from URL path when available. */
export function extractOriginalTitleFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").filter(Boolean).pop() || "";
    const cleaned = last
      .replace(/-g-\d+\.html?/i, "")
      .replace(/\.html?/i, "")
      .replace(/-/g, " ")
      .trim();
    return cleaned.length > 4 ? cleaned : null;
  } catch {
    return null;
  }
}

/**
 * Categorize a batch of products via Category Engine.
 */
export async function categorizeProductsBatch(
  productIds: string[],
  opts?: { force?: boolean }
): Promise<{ results: AiCategoryResult[]; summary: Record<string, number> }> {
  const ids = [...new Set(productIds)].slice(0, AI_CATEGORY_BATCH_SIZE);
  const emptySummary = {
    auto_applied: 0,
    pending_approval: 0,
    needs_review: 0,
    unchanged: 0,
    error: 0,
  };

  if (ids.length === 0) {
    return { results: [], summary: emptySummary };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      description: true,
      shortDescription: true,
      category: true,
      subcategory: true,
      tags: true,
      specs: true,
      images: true,
      supplierUrl: true,
      supplierName: true,
      aiCategoryStatus: true,
      variants: { select: { name: true }, take: 20 },
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const learning = await getCategoryLearning();
  const results: AiCategoryResult[] = [];
  const summary = { ...emptySummary };

  for (const id of ids) {
    const product = byId.get(id);
    if (!product) {
      results.push({
        productId: id,
        name: id,
        previousCategory: null,
        suggestedCategory: null,
        subcategory: null,
        confidence: 0,
        reason: "Produkt ikke funnet",
        decision: "error",
        status: null,
        error: "not_found",
      });
      summary.error += 1;
      continue;
    }

    if (!opts?.force && product.aiCategoryStatus === "corrected") {
      results.push({
        productId: id,
        name: product.name,
        previousCategory: product.category,
        suggestedCategory: product.category,
        subcategory: product.subcategory,
        confidence: 100,
        reason: "Beholder manuell korreksjon",
        decision: "unchanged",
        status: "corrected",
      });
      summary.unchanged += 1;
      continue;
    }

    try {
      const specs = specsToRecord(product.specs);
      const supplierCategory =
        specs["Kategori"] ||
        specs["category"] ||
        specs["Temu kategori"] ||
        product.category ||
        null;

      const assignment = await assignCategory({
        title: product.name,
        description: product.description,
        shortDescription: product.shortDescription,
        specs,
        images: parseImages(product.images),
        variants: product.variants.map((v) => v.name),
        tags: parseTags(product.tags),
        supplierCategory,
        learning,
      });

      const fields = assignmentToProductFields(assignment);
      const specsPatch = mergeSubcategoryIntoSpecs(
        product.specs,
        assignment.subcategory
      );

      const sameAsCurrent =
        isValidStoreCategory(product.category) &&
        product.category === assignment.main &&
        (product.subcategory || null) === (assignment.subcategory || null);

      let decision: AiCategoryDecision;
      if (assignment.status === "needs_review") {
        decision = "needs_review";
      } else if (sameAsCurrent) {
        decision = "unchanged";
      } else {
        decision = "auto_applied";
      }

      await prisma.product.update({
        where: { id },
        data: {
          category: fields.category,
          subcategory: fields.subcategory,
          tags: fields.tags,
          specs: specsPatch as Prisma.InputJsonValue,
          aiCategorySuggested: fields.aiCategorySuggested,
          aiCategoryConfidence: fields.aiCategoryConfidence,
          aiCategoryReason: fields.aiCategoryReason,
          aiCategoryStatus: fields.aiCategoryStatus,
          aiCategoryAt: fields.aiCategoryAt,
        },
      });

      results.push({
        productId: id,
        name: product.name,
        previousCategory: product.category,
        suggestedCategory: assignment.main,
        subcategory: assignment.subcategory,
        confidence: assignment.confidence,
        reason: assignment.reason,
        decision,
        status: assignment.status,
      });
      summary[decision] += 1;
    } catch (error) {
      logError(error, "[ai-categorize]");
      const message = error instanceof Error ? error.message : "AI feilet";
      results.push({
        productId: id,
        name: product.name,
        previousCategory: product.category,
        suggestedCategory: null,
        subcategory: null,
        confidence: 0,
        reason: message,
        decision: "error",
        status: null,
        error: message,
      });
      summary.error += 1;
    }
  }

  return { results, summary };
}

/**
 * Approve pending AI category suggestions.
 */
export async function approveAiCategories(opts: {
  items: Array<{
    productId: string;
    category?: string;
    subcategory?: string | null;
  }>;
}): Promise<{ applied: number }> {
  let applied = 0;
  for (const item of opts.items) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: {
        id: true,
        name: true,
        category: true,
        subcategory: true,
        specs: true,
        aiCategorySuggested: true,
        aiCategoryStatus: true,
      },
    });
    if (!product) continue;

    const category =
      sanitizeCategory(item.category) ||
      sanitizeCategory(product.aiCategorySuggested);
    if (!category) continue;

    const subcategory =
      sanitizeSubcategory(category, item.subcategory) ||
      (listSubsFor(category).includes(String(item.subcategory || ""))
        ? String(item.subcategory)
        : null);

    const wasOverride =
      (product.aiCategorySuggested && product.aiCategorySuggested !== category) ||
      (product.category && product.category !== category);

    const specsPatch = mergeSubcategoryIntoSpecs(product.specs, subcategory);

    await prisma.product.update({
      where: { id: product.id },
      data: {
        category,
        subcategory,
        specs: specsPatch as Prisma.InputJsonValue,
        aiCategorySuggested: category,
        aiCategoryStatus: wasOverride ? "corrected" : "applied",
        aiCategoryAt: new Date(),
      },
    });

    if (wasOverride) {
      const { recordCategoryCorrection } = await import(
        "@/lib/ops/category-learning"
      );
      await recordCategoryCorrection({
        productId: product.id,
        productName: product.name,
        fromCategory: product.category || product.aiCategorySuggested,
        toCategory: category,
        fromSubcategory: product.subcategory,
        toSubcategory: subcategory,
        reason: "Godkjent med manuelt kategori-valg",
      });
    }

    applied += 1;
  }
  return { applied };
}

export async function dismissAiCategories(productIds: string[]): Promise<number> {
  const result = await prisma.product.updateMany({
    where: { id: { in: productIds } },
    data: {
      aiCategoryStatus: "dismissed",
      aiCategoryAt: new Date(),
    },
  });
  return result.count;
}
