/**
 * Subcategory helpers — re-exports the canonical category tree.
 * Kept for existing import paths; prefer `@/lib/categories/tree`.
 */

import {
  CATEGORY_TREE,
  detectSubcategory as detectSubFromTree,
  listSubsFor,
  type SubcategoryDefinition,
} from "@/lib/categories/tree";

export type { SubcategoryDefinition };

/** @deprecated Use CATEGORY_TREE from lib/categories/tree */
export const SUBCATEGORIES = CATEGORY_TREE;

export function getSubcategoriesFor(category: string): string[] {
  return listSubsFor(category);
}

export function detectSubcategory(category: string, text: string): string | null {
  return detectSubFromTree(category, text);
}
