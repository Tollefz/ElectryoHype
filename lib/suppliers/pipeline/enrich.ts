/**
 * Pipeline stage: Enrich — AI improves copy; never replaces supplier facts.
 */

import {
  enrichmentToDescription,
  enrichmentToShortDescription,
  enrichProductWithAI,
} from "@/lib/import/ai-enrichment";
import { calculateSupplierPricing } from "@/lib/suppliers/pricing";
import type { InternalProduct } from "@/lib/suppliers/internal-product";
import type { EnrichmentContext } from "@/lib/import/types";
import type { AIEnrichmentResult } from "@/lib/import/types";

export type EnrichResult = {
  enrichment: AIEnrichmentResult;
  aiGenerated: boolean;
  warning?: string;
  pricing: ReturnType<typeof calculateSupplierPricing>;
  description: string;
  shortDescription: string;
  mergedSpecs: Record<string, string>;
};

export async function enrichInternalProduct(
  product: InternalProduct,
  opts?: { categoryHint?: string | null }
): Promise<EnrichResult> {
  const pricing = calculateSupplierPricing({
    supplierPrice: product.price,
    currency: product.currency,
    shipping: product.shippingEstimate,
    weightGrams: product.weightGrams,
    category: opts?.categoryHint || product.category,
  });

  const context: EnrichmentContext = {
    url: product.supplierUrl,
    supplier: "catalog",
    originalTitle: product.title,
    originalDescription: product.description,
    costNOK: pricing.costNOK,
    images: product.images,
    specs: product.specifications,
    variants: product.variants.map((v) => ({
      name: v.name,
      price: v.price,
      supplierPrice: v.price,
      image: v.imageUrl,
      attributes: v.attributes,
      stock: v.stock,
      sku: v.sku,
    })),
  };

  const { enrichment, aiGenerated, warning } = await enrichProductWithAI({
    context,
    suggestedRetailPrice: pricing.recommendedSalePrice,
    supplierSpecs: product.specifications,
  });

  const mergedSpecs = {
    ...(enrichment.specifications || {}),
    ...product.specifications,
  };

  return {
    enrichment,
    aiGenerated,
    warning,
    pricing,
    description: enrichmentToDescription(enrichment),
    shortDescription: enrichmentToShortDescription(enrichment),
    mergedSpecs,
  };
}
