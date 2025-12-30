import "server-only";

import { SupplierName } from "@prisma/client";
import slugify from "slugify";
import { improveTitle } from "@/lib/utils/improve-product-title";
import { prisma } from "@/lib/prisma";
// Don't import from @/lib/scrapers directly - it can trigger Puppeteer loading
// Import only what we need directly
import { TemuScraper } from "@/lib/scrapers/temu-scraper";
import { identifySupplier } from "@/lib/scrapers/supplier-identifier";
import type { SupplierSource, Scraper, ScrapedProductData } from "@/lib/scrapers/types";
import { safeQuery } from "../safeQuery";

type ProfitMarginInput = number | string;

export interface ImportResult {
  success: boolean;
  productId?: string;
  error?: string;
  url: string;
}

// Lazy scraper factory to avoid loading Puppeteer for Temu URLs
type SupplierScraperFactory = () => Promise<Scraper<ScrapedProductData>>;

const scraperMap: Record<SupplierSource, SupplierScraperFactory> = {
  alibaba: async () => {
    const { AlibabaScraper } = await import("@/lib/scrapers/alibaba-scraper");
    return new AlibabaScraper({ currency: "USD" });
  },
  ebay: async () => {
    const { EbayScraper } = await import("@/lib/scrapers/ebay-scraper");
    return new EbayScraper();
  },
  temu: async () => new TemuScraper(), // TemuScraper doesn't use Puppeteer
};

export async function importProductFromUrl(url: string, profitMargin: ProfitMarginInput) {
  const supplier = identifySupplier(url);
  if (!supplier) {
    throw new Error("Unsupported supplier URL");
  }

  const scraper = await scraperMap[supplier]();
  const scrape = await scraper.scrapeProduct(url);
  if (!scrape.success || !scrape.data) {
    throw new Error(scrape.error ?? "Unknown scraping error");
  }

  const data = scrape.data;
  const supplierPrice = data.price.amount;
  const salePrice = calculateSalePrice(supplierPrice, profitMargin);

  const supplierProductId = extractSupplierProductId(url);

  // Check if product already exists by supplierUrl or supplierProductId
  const existing = await safeQuery(
    () =>
      prisma.product.findFirst({
        where: {
          OR: [
            { supplierUrl: url },
            ...(supplierProductId ? [{ supplierProductId }] : []),
          ],
        },
      }),
    null,
    "automation:existing-product"
  );

  // Forbedre produkt-tittel automatisk
  const improvedTitle = improveTitle(data.title);
  
  // Oppdater slug basert på forbedret tittel
  const improvedSlug = generateSlug(improvedTitle);

  const productData = {
    name: improvedTitle,
    slug: improvedSlug,
    description: data.description,
    price: salePrice,
    compareAtPrice: Math.max(salePrice * 1.15, salePrice + 5),
    images: typeof data.images === "string" ? data.images : JSON.stringify(data.images),
    supplierUrl: url,
    supplierName: supplier.toUpperCase() as SupplierName,
    supplierProductId,
    supplierPrice: supplierPrice,
    profitMargin: typeof profitMargin === "number" ? `${profitMargin}` : profitMargin,
    lastSynced: new Date(),
    autoImport: true,
    isActive: true,
    tags: data.specs ? JSON.stringify(Object.keys(data.specs)) : JSON.stringify([]),
  };

  const product = existing
    ? await prisma.product.update({
        where: { id: existing.id },
        data: productData,
      })
    : await prisma.product.create({
        data: {
          ...productData,
          sku: generateSku(data.title),
        },
      });

  // AutomationLog model ikke tilgjengelig i schema
  // await prisma.automationLog.create({
  //   data: {
  //     type: "sync",
  //     productId: product.id,
  //     action: "success",
  //     details: JSON.stringify({
  //       supplier,
  //       supplierPrice,
  //       salePrice,
  //     }),
  //   },
  // });

  return product;
}

export async function bulkImportProducts(urls: string[], profitMargin: ProfitMarginInput) {
  const results: ImportResult[] = [];
  for (const url of urls) {
    try {
      const product = await importProductFromUrl(url.trim(), profitMargin);
      results.push({ success: true, url, productId: product.id });
    } catch (error) {
      results.push({
        success: false,
        url,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
  }
  return results;
}

export async function syncProductPrices() {
  const products = await safeQuery(
    () =>
      prisma.product.findMany({
        where: { autoImport: true, supplierUrl: { not: null } },
      }),
    [],
    "automation:sync-prices"
  );

  for (const product of products) {
    if (!product.supplierUrl || !product.supplierName) continue;
    const supplier = product.supplierName.toLowerCase() as SupplierSource;
    const scraperFactory = scraperMap[supplier];
    if (!scraperFactory) continue;

    try {
      const scraper = await scraperFactory();
      // scrapePrice may not exist on all scrapers, use scrapeProduct instead
      const result = await scraper.scrapeProduct(product.supplierUrl);
      const price = result.success && result.data ? result.data.price.amount : null;
      if (!price || price === product.supplierPrice) {
        continue;
      }
      const salePrice = calculateSalePrice(price, product.profitMargin ?? "50%");

      await prisma.product.update({
        where: { id: product.id },
        data: {
          supplierPrice: price,
          price: salePrice,
          lastSynced: new Date(),
        },
      });

      // AutomationLog model ikke tilgjengelig i schema
      // await prisma.automationLog.create({
      //   data: {
      //     type: "sync",
      //     productId: product.id,
      //     action: "success",
      //     details: JSON.stringify({
      //       before: product.supplierPrice,
      //       after: price,
      //     }),
      //   },
      // });
    } catch (error) {
      // AutomationLog model ikke tilgjengelig i schema
      // await prisma.automationLog.create({
      //   data: {
      //     type: "sync",
      //     productId: product.id,
      //     action: "failed",
      //     error: error instanceof Error ? error.message : "Unknown error",
      //   },
      // });
      console.error(`Failed to sync product ${product.id}:`, error);
    }
  }
}

export async function syncProductAvailability() {
  const products = await safeQuery(
    () =>
      prisma.product.findMany({
        where: { autoImport: true, supplierUrl: { not: null } },
      }),
    [],
    "automation:sync-availability"
  );

  for (const product of products) {
    if (!product.supplierUrl || !product.supplierName) continue;
    const scraperFactory = scraperMap[product.supplierName.toLowerCase() as SupplierSource];
    if (!scraperFactory) continue;

    try {
      const scraper = await scraperFactory();
      const result = await scraper.scrapeProduct(product.supplierUrl);
      if (!result.success || !result.data) continue;

      await prisma.product.update({
        where: { id: product.id },
        data: {
          isActive: result.data.availability ?? true,
          lastSynced: new Date(),
        },
      });
    } catch (error) {
      // AutomationLog model ikke tilgjengelig i schema
      // await prisma.automationLog.create({
      //   data: {
      //     type: "sync",
      //     productId: product.id,
      //     action: "failed",
      //     error: error instanceof Error ? error.message : "Availability sync failed",
      //   },
      // });
      console.error(`Failed to sync availability for product ${product.id}:`, error);
    }
  }
}

// identifySupplier is now imported from @/lib/scrapers, removed duplicate

function extractSupplierProductId(url: string) {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  return segments.pop() ?? url;
}

function generateSku(title: string) {
  return slugify(title, { lower: true, strict: true }).slice(0, 40);
}

function generateSlug(title: string) {
  const base = slugify(title, { lower: true, strict: true });
  return base || `product-${Date.now()}`;
}

function calculateSalePrice(cost: number, margin: ProfitMarginInput) {
  if (typeof margin === "number") {
    return Math.max(cost * (1 + margin / 100), cost + 5);
  }

  const value = margin.trim();
  if (value.endsWith("%")) {
    const percent = Number.parseFloat(value.replace("%", ""));
    return Math.max(cost * (1 + percent / 100), cost + 1);
  }

  if (value.startsWith("+")) {
    const add = Number.parseFloat(value.replace("+", ""));
    return cost + (Number.isFinite(add) ? add : 0);
  }

  const numeric = Number.parseFloat(value);
  if (Number.isFinite(numeric)) {
    return cost + numeric;
  }

  return cost * 1.5;
}

