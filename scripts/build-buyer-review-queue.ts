/**
 * ElectroHypeX Lead Product Buyer — review queue builder.
 *
 * Scrapes candidates, runs pricing + AI/fallback enrichment + score + buyer policy.
 * NEVER saves products to the database.
 *
 * Usage: npx tsx scripts/build-buyer-review-queue.ts
 * Optional: LIMIT=20 npx tsx scripts/build-buyer-review-queue.ts
 */
import "./stub-server-only";
import "dotenv/config";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { TemuScraper } from "../lib/scrapers/temu-scraper";
import {
  calculateCompareAtPrice,
  calculateSuggestedRetailPrice,
  convertPriceToNOK,
} from "../lib/import/pricing";
import { prepareImages, upgradeImageUrl } from "../lib/import/image-quality";
import { extractSpecs } from "../lib/import/spec-extractor";
import { detectSubcategory } from "../lib/import/subcategories";
import {
  enrichmentToDescription,
  enrichProductWithAI,
} from "../lib/import/ai-enrichment";
import { calculateProductScore } from "../lib/import/product-score";
import { detectProductWarnings } from "../lib/import/product-warnings";
import { evaluateBuyerFit, type BuyerDecision } from "../lib/import/buyer-policy";
import { IMPORT_DELIVERY_TIME } from "../lib/import/types";
import type { ProductVariant } from "../lib/scrapers/types";

interface Candidate {
  goodsId: string;
  url: string;
  whySelected: string;
  searchTheme: string;
  alreadyInStore?: boolean;
  storeProductName?: string;
}

export interface ReviewQueueItem {
  goodsId: string;
  url: string;
  supplier: string;
  name: string;
  originalTitle: string;
  category: string;
  subcategory: string | null;
  costNOK: number;
  sellingPrice: number;
  compareAtPrice: number;
  marginPct: number;
  markupPct: number;
  score: number;
  decision: BuyerDecision;
  whySelected: string;
  searchTheme: string;
  warnings: string[];
  slug: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
  imagesCount: number;
  variantsCount: number;
  aiGenerated: boolean;
  alreadyInStore?: boolean;
}

function mapVariants(variants: ProductVariant[] | undefined, baseCostNOK: number, images: string[]) {
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
        stock: null as number | null,
        sku: null as string | null,
      },
    ];
  }

  return variants.map((variant) => {
    const rawVariantPrice = variant.supplierPrice ?? variant.price;
    const variantCostNOK =
      rawVariantPrice < 100 && baseCostNOK > rawVariantPrice * 5
        ? convertPriceToNOK(rawVariantPrice, "USD")
        : rawVariantPrice;
    const retailPrice = calculateSuggestedRetailPrice(variantCostNOK);
    return {
      name: variant.name || "Standard",
      price: retailPrice,
      compareAtPrice: calculateCompareAtPrice(retailPrice),
      supplierPrice: Math.round(variantCostNOK),
      image: variant.image ? upgradeImageUrl(variant.image) : images[0] || null,
      attributes: variant.attributes || {},
      stock: typeof variant.stock === "number" ? variant.stock : null,
      sku: variant.sku || null,
    };
  });
}

async function processCandidate(
  candidate: Candidate,
  scraper: TemuScraper
): Promise<ReviewQueueItem | { rejected: true; reason: string; goodsId: string; url: string }> {
  const scrape = await scraper.scrapeProduct(candidate.url);
  if (!scrape.success || !scrape.data) {
    return {
      rejected: true,
      reason: scrape.error || "Scrape failed",
      goodsId: candidate.goodsId,
      url: candidate.url,
    };
  }

  const data = scrape.data;
  const costNOK = convertPriceToNOK(data.price.amount, data.price.currency);
  const suggestedPrice = calculateSuggestedRetailPrice(costNOK);
  const compareAtPrice = calculateCompareAtPrice(suggestedPrice);
  const images = prepareImages(Array.isArray(data.images) ? data.images : []);
  const specs = extractSpecs(data.title, data.description || "", data.specs || {});
  const variants = mapVariants(data.variants, costNOK, images);
  const deliveryTime = data.shippingEstimate?.trim() || IMPORT_DELIVERY_TIME;

  const { enrichment, aiGenerated } = await enrichProductWithAI({
    context: {
      url: candidate.url,
      supplier: data.supplier,
      originalTitle: data.title,
      originalDescription: data.description || "",
      costNOK,
      images,
      specs,
      variants,
    },
    suggestedRetailPrice: suggestedPrice,
  });

  const mergedSpecs = { ...specs, ...enrichment.specifications };
  const subcategory =
    enrichment.subcategory ??
    detectSubcategory(enrichment.category, `${data.title} ${data.description || ""}`);
  const description = enrichmentToDescription(enrichment, deliveryTime);

  const score = calculateProductScore({
    costNOK,
    suggestedPrice,
    category: enrichment.category,
    subcategory,
    name: enrichment.title,
    originalTitle: data.title,
    description,
    imagesCount: images.length,
    variantsCount: variants.length,
    specsCount: Object.keys(mergedSpecs).length,
    descriptionLength: description.replace(/<[^>]+>/g, "").length,
  });

  const buyer = evaluateBuyerFit({
    name: enrichment.title,
    originalTitle: data.title,
    description,
    category: enrichment.category,
    subcategory,
    costNOK,
    suggestedPrice,
    overallScore: score.overall,
    imagesCount: images.length,
    variantsCount: variants.length,
    specsCount: Object.keys(mergedSpecs).length,
  });

  const warnings = detectProductWarnings({
    name: enrichment.title,
    description,
    originalTitle: data.title,
    costNOK,
    suggestedPrice,
    category: enrichment.category,
    subcategory,
    images,
    variants,
    specs: mergedSpecs,
  });

  if (buyer.rejected) {
    return {
      rejected: true,
      reason: buyer.issues
        .filter((i) => i.severity === "reject")
        .map((i) => i.message)
        .join(" · ") || `REJECTED score ${score.overall}`,
      goodsId: candidate.goodsId,
      url: candidate.url,
    };
  }

  const profit = suggestedPrice - costNOK;
  const marginPct = suggestedPrice > 0 ? (profit / suggestedPrice) * 100 : 0;
  const markupPct = costNOK > 0 ? (profit / costNOK) * 100 : 0;

  return {
    goodsId: candidate.goodsId,
    url: candidate.url,
    supplier: "temu",
    name: enrichment.title,
    originalTitle: data.title,
    category: enrichment.category,
    subcategory,
    costNOK: Math.round(costNOK),
    sellingPrice: suggestedPrice,
    compareAtPrice,
    marginPct: Math.round(marginPct * 10) / 10,
    markupPct: Math.round(markupPct * 10) / 10,
    score: score.overall,
    decision: buyer.decision,
    whySelected: candidate.whySelected,
    searchTheme: candidate.searchTheme,
    warnings: warnings.map((w) => w.message),
    slug: enrichment.slug,
    metaTitle: enrichment.metaTitle,
    metaDescription: enrichment.metaDescription,
    tags: enrichment.tags,
    imagesCount: images.length,
    variantsCount: variants.length,
    aiGenerated,
    alreadyInStore: candidate.alreadyInStore,
  };
}

async function main() {
  if (!existsSync("data")) mkdirSync("data");

  const candidatesPath = join(process.cwd(), "data", "buyer-candidates.json");
  if (!existsSync(candidatesPath)) {
    console.error("Missing data/buyer-candidates.json — run build-buyer-candidates.ts first");
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(candidatesPath, "utf8")) as {
    candidates: Candidate[];
  };

  const limit = Number(process.env.LIMIT || payload.candidates.length);
  const candidates = payload.candidates.slice(0, limit);
  const scraper = new TemuScraper();

  const queue: ReviewQueueItem[] = [];
  const rejected: Array<{ goodsId: string; url: string; reason: string }> = [];
  const errors: Array<{ goodsId: string; url: string; error: string }> = [];

  console.log(`Processing ${candidates.length} candidates (no DB writes)...\n`);

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    process.stdout.write(`[${i + 1}/${candidates.length}] ${candidate.goodsId} … `);
    try {
      const result = await processCandidate(candidate, scraper);
      if ("rejected" in result && result.rejected) {
        rejected.push({ goodsId: result.goodsId, url: result.url, reason: result.reason });
        console.log(`REJECTED — ${result.reason.slice(0, 80)}`);
      } else {
        queue.push(result as ReviewQueueItem);
        const item = result as ReviewQueueItem;
        console.log(`${item.decision.toUpperCase()} score=${item.score} «${item.name}»`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ goodsId: candidate.goodsId, url: candidate.url, error: message });
      console.log(`ERROR — ${message.slice(0, 80)}`);
    }

    // polite delay to reduce Temu rate-limiting
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Group by category
  const byCategory: Record<string, ReviewQueueItem[]> = {};
  for (const item of queue) {
    const key = item.category || "Ukategorisert";
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(item);
  }
  for (const key of Object.keys(byCategory)) {
    byCategory[key].sort((a, b) => b.score - a.score);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    savedToDatabase: false,
    summary: {
      processed: candidates.length,
      queued: queue.length,
      approved: queue.filter((q) => q.decision === "approved").length,
      review: queue.filter((q) => q.decision === "review").length,
      rejected: rejected.length,
      errors: errors.length,
    },
    byCategory,
    queue,
    rejected,
    errors,
  };

  const outPath = join(process.cwd(), "data", "buyer-review-queue.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nReview queue written → ${outPath}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
