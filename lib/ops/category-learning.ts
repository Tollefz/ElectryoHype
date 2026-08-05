/**
 * Category learning store — corrections Rob makes become future AI context.
 * Persisted in Setting JSON (no schema churn for every correction).
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const CATEGORY_LEARNING_KEY = "category_learning_corrections";

export type CategoryCorrection = {
  id: string;
  productId?: string;
  productName: string;
  fromCategory: string | null;
  toCategory: string;
  fromSubcategory?: string | null;
  toSubcategory?: string | null;
  keywords: string[];
  reason?: string | null;
  createdAt: string;
};

export type CategoryLearningStore = {
  updatedAt: string;
  corrections: CategoryCorrection[];
};

const MAX_CORRECTIONS = 400;

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-zæøå0-9\s\-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 8);
}

export async function getCategoryLearning(): Promise<CategoryLearningStore> {
  const row = await prisma.setting.findUnique({
    where: { key: CATEGORY_LEARNING_KEY },
  });
  if (!row?.value || typeof row.value !== "object" || Array.isArray(row.value)) {
    return { updatedAt: new Date().toISOString(), corrections: [] };
  }
  const value = row.value as unknown as CategoryLearningStore;
  return {
    updatedAt: value.updatedAt || new Date().toISOString(),
    corrections: Array.isArray(value.corrections) ? value.corrections : [],
  };
}

async function saveLearning(store: CategoryLearningStore) {
  await prisma.setting.upsert({
    where: { key: CATEGORY_LEARNING_KEY },
    create: {
      key: CATEGORY_LEARNING_KEY,
      value: store as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: store as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Record that Rob overrode an AI (or previous) category.
 */
export async function recordCategoryCorrection(input: {
  productId?: string;
  productName: string;
  fromCategory: string | null;
  toCategory: string;
  fromSubcategory?: string | null;
  toSubcategory?: string | null;
  reason?: string | null;
}): Promise<void> {
  if (!input.toCategory?.trim()) return;
  if (
    input.fromCategory === input.toCategory &&
    (input.fromSubcategory || null) === (input.toSubcategory || null)
  ) {
    return;
  }

  const store = await getCategoryLearning();
  const correction: CategoryCorrection = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: input.productId,
    productName: input.productName.slice(0, 120),
    fromCategory: input.fromCategory,
    toCategory: input.toCategory,
    fromSubcategory: input.fromSubcategory ?? null,
    toSubcategory: input.toSubcategory ?? null,
    keywords: tokenize(input.productName),
    reason: input.reason || null,
    createdAt: new Date().toISOString(),
  };

  store.corrections = [correction, ...store.corrections].slice(0, MAX_CORRECTIONS);
  store.updatedAt = correction.createdAt;
  await saveLearning(store);
}

/** Compact examples for the AI prompt (most recent first). */
export function formatLearningForPrompt(
  store: CategoryLearningStore,
  limit = 25
): string {
  if (!store.corrections.length) return "Ingen tidligere korreksjoner.";
  return store.corrections
    .slice(0, limit)
    .map((c, i) => {
      const from = c.fromSubcategory
        ? `${c.fromCategory || "mangler"} → ${c.fromSubcategory}`
        : c.fromCategory || "mangler";
      const to = c.toSubcategory
        ? `${c.toCategory} → ${c.toSubcategory}`
        : c.toCategory;
      return `${i + 1}. "${c.productName}" — ${from} → Rob: ${to}`;
    })
    .join("\n");
}
