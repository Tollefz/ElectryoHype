/**
 * Pipeline stage: Quality Check — completeness score gate.
 */

import { calculateImportCompleteness, type ImportCompleteness } from "@/lib/suppliers/completeness";
import type { InternalProduct } from "@/lib/suppliers/internal-product";
import type { EnrichResult } from "@/lib/suppliers/pipeline/enrich";

export type QualityResult = {
  completeness: ImportCompleteness;
  requiresReview: boolean;
};

export function qualityCheckInternalProduct(input: {
  source: InternalProduct;
  normalized: InternalProduct;
  enrich: EnrichResult;
  savedVariantCount: number;
}): QualityResult {
  const { source, normalized, enrich, savedVariantCount } = input;
  const completeness = calculateImportCompleteness({
    sourceImages: source.images.length,
    savedImages: normalized.images.length,
    sourceVariants: source.variants.length,
    savedVariants: savedVariantCount,
    sourceSpecs: Object.keys(source.specifications).length,
    savedSpecs: Object.keys(source.specifications).filter((k) => k in enrich.mergedSpecs)
      .length,
    sourceAttributes: Object.keys(source.attributes).length,
    savedAttributes: Object.keys(normalized.attributes).length,
    sourceVideos: source.videos.length,
    savedVideos: normalized.videos.length,
    inventoryOk: typeof normalized.stock === "number",
    inventoryDetail: `stock=${normalized.stock}`,
    pricingOk: enrich.pricing.recommendedSalePrice > 0 && normalized.price > 0,
    skuOk: Boolean(normalized.sku || normalized.variants.some((v) => v.sku)),
    aiOk: Boolean(enrich.enrichment.title && enrich.enrichment.metaTitle),
    seoOk: Boolean(
      enrich.enrichment.metaTitle &&
        enrich.enrichment.metaDescription &&
        enrich.enrichment.slug
    ),
  });

  return {
    completeness,
    requiresReview: completeness.requiresReview,
  };
}
