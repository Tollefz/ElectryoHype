/**
 * Rank related products by category, complements, tags, price band, quality.
 * Never random — deterministic relevance. Excludes frontpage-junk families.
 */

import {
  diversifyProducts,
  isFrontpageExcluded,
  relatedComplementBoost,
  withCuratedPrimaryImage,
} from "@/lib/storefront/curation";
import { matchFamily } from "@/lib/intelligence/families";

export type RelatedCandidate = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  images: string;
  category: string | null;
  subcategory?: string | null;
  brand?: string | null;
  tags?: string | null;
  qualityScore?: number | null;
  description?: string | null;
  shortDescription?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  aiCategorySuggested?: string | null;
  aiCategoryReason?: string | null;
};

export type RelatedSource = {
  id: string;
  name?: string | null;
  category: string | null;
  price: number;
  brand?: string | null;
  tags?: string | null;
};

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter(Boolean);
    }
  } catch {
    /* ignore */
  }
  return String(raw)
    .split(/[,;|]/)
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean);
}

function brandFromName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0];
  if (!first || first.length < 2) return null;
  return first.toLowerCase();
}

function resolveBrand(p: { brand?: string | null; name?: string }): string | null {
  if (p.brand && p.brand.trim()) return p.brand.trim().toLowerCase();
  if (p.name) return brandFromName(p.name);
  return null;
}

/**
 * Score a candidate against the source product. Higher = more relevant.
 */
export function scoreRelatedProduct(
  source: RelatedSource,
  candidate: RelatedCandidate
): number {
  if (isFrontpageExcluded(candidate)) return -1000;

  let score = 0;

  const srcCat = (source.category || "").toLowerCase();
  const candCat = (candidate.category || "").toLowerCase();
  if (srcCat && candCat && srcCat === candCat) score += 40;
  else if (
    srcCat &&
    candCat &&
    (candCat.includes(srcCat) || srcCat.includes(candCat))
  )
    score += 20;
  else score -= 8; // cross-category needs strong complement signal

  const srcName = source.name || "";
  score += relatedComplementBoost(
    srcName,
    source.category,
    candidate.name,
    candidate.category
  );

  const srcFam = matchFamily(srcName, source.category);
  const candFam = matchFamily(candidate.name, candidate.category);
  if (srcFam && candFam && srcFam === candFam) {
    // Same family ≈ color/variant of same thing — deprioritize
    score -= 25;
  }

  const srcBrand = resolveBrand({ brand: source.brand, name: source.name || undefined });
  const candBrand = resolveBrand({
    brand: candidate.brand,
    name: candidate.name,
  });
  if (srcBrand && candBrand && srcBrand === candBrand) score += 12;

  const srcPrice = source.price;
  if (srcPrice > 0) {
    const ratio = candidate.price / srcPrice;
    if (ratio >= 0.7 && ratio <= 1.3) score += 20;
    else if (ratio >= 0.5 && ratio <= 1.6) score += 10;
    else if (ratio >= 0.35 && ratio <= 2.2) score += 4;
  }

  const srcTags = new Set(parseTags(source.tags));
  const candTags = parseTags(candidate.tags);
  let tagHits = 0;
  for (const t of candTags) {
    if (srcTags.has(t)) tagHits += 1;
  }
  score += Math.min(tagHits * 6, 18);

  const q = candidate.qualityScore ?? 0;
  score += Math.min(q, 10);

  const hasDiscount =
    candidate.compareAtPrice != null &&
    candidate.compareAtPrice > candidate.price;
  if (hasDiscount) score += 2;

  return score;
}

export function pickRelatedProducts<T extends RelatedCandidate>(
  source: RelatedSource,
  candidates: T[],
  limit = 4
): T[] {
  const srcCat = (source.category || "").toLowerCase();

  const ranked = candidates
    .filter((c) => c.id !== source.id)
    .filter((c) => !isFrontpageExcluded(c))
    .map((c) => {
      const score = scoreRelatedProduct(source, c);
      const sameCat =
        !!srcCat && (c.category || "").toLowerCase() === srcCat;
      const complement = relatedComplementBoost(
        source.name || "",
        source.category,
        c.name,
        c.category
      );
      return { c, score, sameCat, complement };
    })
    .filter((r) => {
      if (r.score < 18) return false;
      return r.sameCat || r.complement >= 28;
    })
    .sort((a, b) => b.score - a.score || a.c.price - b.c.price)
    .map((r) => r.c);

  const diversified = diversifyProducts(ranked, {
    limit,
    minPremiumScore: 5,
    allowFewer: true,
  });

  return diversified.map((p) => {
    const curated = withCuratedPrimaryImage(p);
    return { ...p, images: curated.images } as T;
  });
}

