export * from "./types";
// DON'T export base-scraper, alibaba-scraper, or ebay-scraper directly - they import Puppeteer
// Only export TemuScraper which doesn't use Puppeteer
export * from "./temu-scraper";
// Export supplier identifier (no Puppeteer dependencies)
export * from "./supplier-identifier";

import { TemuScraper } from "./temu-scraper";
import type { SupplierSource } from "./types";
import { identifySupplier } from "./supplier-identifier";

// Re-export identifySupplier for backward compatibility
export { identifySupplier };

/**
 * Hent riktig scraper basert på URL
 * Uses lazy imports to avoid loading Puppeteer for Temu URLs
 */
export async function getScraperForUrl(url: string) {
  const supplier = identifySupplier(url);
  if (!supplier) return null;

  switch (supplier) {
    case "alibaba": {
      // Lazy import to avoid loading Puppeteer unless needed
      const { AlibabaScraper } = await import("./alibaba-scraper");
      return new AlibabaScraper({ currency: "USD" });
    }
    case "ebay": {
      // Lazy import to avoid loading Puppeteer unless needed
      const { EbayScraper } = await import("./ebay-scraper");
      return new EbayScraper();
    }
    case "temu":
      // TemuScraper doesn't use Puppeteer, so safe to import directly
      return new TemuScraper();
    default:
      return null;
  }
}

/**
 * Scrape produkt fra URL
 */
export async function scrapeProduct(url: string) {
  const scraper = await getScraperForUrl(url);
  if (!scraper) {
    throw new Error(`Unsupported supplier URL: ${url}`);
  }

  return scraper.scrapeProduct(url);
}

