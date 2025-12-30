/**
 * Server-only product scraping functionality
 * 
 * This file contains server-only code that uses Puppeteer.
 * DO NOT import from this file in client components.
 */

import "server-only";

import type { ScraperResult } from "@/lib/scrapers/types";

/**
 * Scrape product from URL
 * This function handles all scraping logic server-side
 */
export async function scrapeProduct(url: string, provider?: string): Promise<ScraperResult> {
  // Identifiser leverandør FØRST (uten å laste scrapers)
  // Import ONLY from supplier-identifier which has NO Puppeteer dependencies
  const { identifySupplier } = await import("@/lib/scrapers/supplier-identifier");
  let supplier = identifySupplier(url);
  
  // Hvis provider er spesifisert, valider at den matcher URL
  if (provider && typeof provider === "string") {
    const normalizedProvider = provider.toLowerCase();
    if (normalizedProvider === "temu" || normalizedProvider === "alibaba" || normalizedProvider === "ebay") {
      // Hvis provider er spesifisert, bruk den (men valider at URL matcher)
      if (!supplier) {
        // Hvis auto-deteksjon feiler, bruk spesifisert provider
        supplier = normalizedProvider as "temu" | "alibaba" | "ebay";
      } else if (supplier !== normalizedProvider) {
        // Hvis spesifisert provider ikke matcher URL, kast feil
        throw new Error(
          `URL matcher ikke spesifisert provider. URL peker til ${supplier}, men ${normalizedProvider} ble spesifisert.`
        );
      }
    }
  }
  
  if (!supplier) {
    throw new Error("Ustøttet leverandør. Støttede leverandører: Alibaba, Temu, eBay");
  }

  console.log(`[Scrape Product] Scraping ${supplier} produkt fra: ${url}`);

  // For Temu and Alibaba, use providers (no Puppeteer)
  // CRITICAL: Use dynamic import with explicit file path to avoid bundling Puppeteer
  let result: ScraperResult;
  try {
    if (supplier === "temu") {
      // Direct import of TemuScraper only - no Puppeteer loaded
      // Use explicit relative path to ensure no bundling of other scrapers
      console.log(`[Scrape Product] Loading TemuScraper directly (no Puppeteer)...`);
      const temuScraperModule = await import("@/lib/scrapers/temu-scraper");
      const TemuScraper = temuScraperModule.TemuScraper;
      const scraper = new TemuScraper();
      console.log(`[Scrape Product] TemuScraper loaded, starting scrape...`);
      result = await scraper.scrapeProduct(url);
      console.log(`[Scrape Product] Temu scrape completed`);
      console.log(`[Scrape Product] Variants count: ${result.data?.variants?.length || 0}`);
      if (result.data?.variants && result.data.variants.length > 0) {
        console.log(`[Scrape Product] Variants found:`, JSON.stringify(result.data.variants.slice(0, 2), null, 2));
      }
    } else if (supplier === "alibaba") {
      // Use AlibabaProvider (no Puppeteer, uses fetch + cheerio)
      console.log(`[Scrape Product] Loading AlibabaProvider (no Puppeteer)...`);
      const { AlibabaProvider } = await import("@/lib/providers/alibaba-provider");
      const provider = new AlibabaProvider();
      
      // Fetch raw product data
      const rawProduct = await provider.fetchProduct(url);
      
      // Map to ScraperResult format
      const mappedProduct = provider.mapToProduct(rawProduct, url);
      
      result = {
        success: true,
        data: {
          supplier: "alibaba",
          url,
          title: mappedProduct.title,
          description: mappedProduct.description || "",
          price: mappedProduct.price,
          images: mappedProduct.images || [],
          specs: mappedProduct.specs || {},
          shippingEstimate: mappedProduct.shippingEstimate,
          availability: mappedProduct.availability,
          variants: mappedProduct.variants || [],
        },
      };
      console.log(`[Scrape Product] Alibaba scrape completed`);
    } else {
      // Use general scrapeProduct for eBay (loads Puppeteer only when needed)
      // Import from server-only entry point
      console.log(`[Scrape Product] Loading scraper for ${supplier}...`);
      const { scrapeProduct: scrapeProductFromLib } = await import("@/lib/scrapers/server");
      result = await scrapeProductFromLib(url);
    }
  } catch (error) {
    console.error(`[Scrape Product] Exception during scraping:`, error);
    const errorMessage = error instanceof Error ? error.message : "Ukjent feil ved scraping";
    throw new Error(errorMessage);
  }

  if (!result.success || !result.data) {
    const errorMessage = result.error || "Kunne ikke hente produktdata";
    console.error(`[Scrape Product] Feil: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  return result;
}

