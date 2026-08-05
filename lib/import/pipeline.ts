import "server-only";

import {
  enrichmentToDescription,
  enrichmentToShortDescription,
  enrichProductWithAI,
} from "@/lib/import/ai-enrichment";
import { prepareImages, upgradeImageUrl } from "@/lib/import/image-quality";
import {
  calculateCompareAtPrice,
  calculateSuggestedRetailPrice,
  convertPriceToNOK,
} from "@/lib/import/pricing";
import { extractSpecs } from "@/lib/import/spec-extractor";
import { detectSubcategory } from "@/lib/import/subcategories";
import type { ImportPipelineResult, ImportVariantPreview, EnrichmentContext } from "@/lib/import/types";
import { IMPORT_DELIVERY_TIME } from "@/lib/import/types";
import { scrapeProduct } from "@/lib/server/scrape-product";
import type { ProductVariant } from "@/lib/scrapers/types";

function mapVariants(
  variants: ProductVariant[] | undefined,
  baseCostNOK: number,
  images: string[]
): ImportVariantPreview[] {
  if (!variants || variants.length === 0) {
    const retailPrice = calculateSuggestedRetailPrice(baseCostNOK);
    return [
      {
        name: "Standard",
        price: retailPrice,
        compareAtPrice: calculateCompareAtPrice(retailPrice),
        supplierPrice: Math.round(baseCostNOK),
        image: images[0] || null,
        attributes: {},
        stock: null,
        sku: null,
      },
    ];
  }

  return variants.map((variant) => {
    // Variant prices from Temu /no are NOK. Do not re-interpret small numbers as USD —
    // that historically inflated costs (9.99 → 105) and broke real cheap products.
    const variantCostNOK = Number(variant.supplierPrice ?? variant.price) || baseCostNOK;
    const retailPrice = calculateSuggestedRetailPrice(variantCostNOK);
    const variantImage = variant.image ? upgradeImageUrl(variant.image) : images[0] || null;

    return {
      name: variant.name || "Standard",
      price: retailPrice,
      compareAtPrice: calculateCompareAtPrice(retailPrice),
      supplierPrice: Math.round(variantCostNOK * 100) / 100,
      image: variantImage,
      attributes: variant.attributes || {},
      stock: typeof variant.stock === "number" ? variant.stock : null,
      sku: variant.sku || null,
    };
  });
}

export async function runImportPipeline(
  url: string,
  provider?: string
): Promise<ImportPipelineResult> {
  const scrapeResult = await scrapeProduct(url, provider);
  const data = scrapeResult.data!;

  const costNOK = convertPriceToNOK(data.price.amount, data.price.currency);
  if (!Number.isFinite(costNOK) || costNOK <= 0) {
    throw new Error(
      "Kunne ikke hente pålitelig leverandørpris fra Temu. Import stoppet — ingen 9.99 USD / ~105 NOK-plassholder brukes."
    );
  }
  const suggestedPrice = calculateSuggestedRetailPrice(costNOK);
  const compareAtPrice = calculateCompareAtPrice(suggestedPrice);
  // Import ALL images: upgrade to best resolution, drop thumbnails, dedupe
  const images = prepareImages(Array.isArray(data.images) ? data.images : []);
  // Extract every specification we can find from title/description text;
  // scraper-provided specs take priority
  const specs = extractSpecs(data.title, data.description || "", data.specs || {});
  const variants = mapVariants(data.variants, costNOK, images);
  // Use the supplier's shipping estimate when provided, otherwise default
  const deliveryTime = data.shippingEstimate?.trim() || IMPORT_DELIVERY_TIME;

  const context: EnrichmentContext = {
    url,
    supplier: data.supplier,
    originalTitle: data.title,
    originalDescription: data.description || "",
    costNOK,
    images,
    specs,
    variants,
  };

  const { enrichment, aiGenerated, warning } = await enrichProductWithAI({
    context,
    suggestedRetailPrice: suggestedPrice,
  });

  // Merge enrichment specifications with extracted specs so nothing is lost
  const mergedSpecs = { ...specs, ...enrichment.specifications };

  const subcategory =
    enrichment.subcategory ??
    detectSubcategory(enrichment.category, `${data.title} ${data.description || ""}`);

  return {
    url,
    supplier: data.supplier,
    originalTitle: data.title,
    originalDescription: data.description || "",
    originalPrice: Math.round(costNOK),
    suggestedPrice,
    compareAtPrice,
    name: enrichment.title,
    description: enrichmentToDescription(enrichment, deliveryTime),
    shortDescription: enrichmentToShortDescription(enrichment),
    category: enrichment.category,
    subcategory,
    tags: enrichment.tags,
    slug: enrichment.slug,
    metaTitle: enrichment.metaTitle,
    metaDescription: enrichment.metaDescription,
    deliveryTime,
    images,
    specs: mergedSpecs,
    variants,
    aiGenerated,
    aiWarning: warning,
  };
}
