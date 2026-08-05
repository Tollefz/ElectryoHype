/**
 * Suggest main category (+ subcategory) from product title text.
 * Pure helper – safe on server and client. Uses function-first V2 rules.
 */

import { getAllDbValues } from "@/lib/categories";
import { CATEGORY_TREE, inferMainAndSub } from "@/lib/categories/tree";

export interface CategorySuggestion {
  category: string;
  subcategory: string | null;
  label: string;
  confidence: "high" | "medium";
}

function formatLabel(category: string, subcategory: string | null): string {
  return subcategory ? `${category} → ${subcategory}` : category;
}

/**
 * Suggest category for a product title / description.
 * Returns null when confidence is too low.
 */
export function suggestCategoryFromText(text: string): CategorySuggestion | null {
  const haystack = (text || "").trim();
  if (!haystack) return null;

  const inferred = inferMainAndSub(haystack);
  if (inferred.confidence >= 90) {
    return {
      category: inferred.main,
      subcategory: inferred.subcategory,
      label: formatLabel(inferred.main, inferred.subcategory),
      confidence: "high",
    };
  }

  let best: { category: string; subcategory: string; hits: number } | null = null;
  const lower = haystack.toLowerCase();

  for (const [category, defs] of Object.entries(CATEGORY_TREE)) {
    for (const def of defs) {
      let hits = 0;
      for (const keyword of def.keywords) {
        if (lower.includes(keyword.toLowerCase())) {
          hits += keyword.includes(" ") ? 2 : 1;
        }
      }
      if (hits > 0 && (!best || hits > best.hits)) {
        best = { category, subcategory: def.name, hits };
      }
    }
  }

  if (!best || best.hits < 2) {
    if (inferred.confidence >= 70) {
      return {
        category: inferred.main,
        subcategory: inferred.subcategory,
        label: formatLabel(inferred.main, inferred.subcategory),
        confidence: "medium",
      };
    }
    return null;
  }

  return {
    category: best.category,
    subcategory: best.subcategory,
    label: formatLabel(best.category, best.subcategory),
    confidence: best.hits >= 3 ? "high" : "medium",
  };
}

export function isValidStoreCategory(category: string | null | undefined): boolean {
  if (!category || !category.trim()) return false;
  return getAllDbValues().includes(category);
}

/** Extract Temu goods id from URL or supplierProductId. */
export function extractTemuGoodsId(url: string | null | undefined): string | null {
  if (!url) return null;
  const fromPath = url.match(/-g-(\d{10,})\.html/i);
  if (fromPath?.[1]) return fromPath[1];
  const fromQuery = url.match(/[?&](?:goods_id|_x_ns_gid)=(\d{10,})/i);
  if (fromQuery?.[1]) return fromQuery[1];
  return null;
}

export function parseTags(tags: string | string[] | null | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function hasArchivedTag(tags: string | string[] | null | undefined): boolean {
  return parseTags(tags).some((t) => t.toLowerCase() === "archived");
}
