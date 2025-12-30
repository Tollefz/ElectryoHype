/**
 * Server-only scraper exports
 * 
 * This file contains server-only code that uses Puppeteer.
 * DO NOT import from this file in client components.
 * Use API routes or server actions instead.
 */

import "server-only";

import { TemuScraper } from "./temu-scraper";
import type { SupplierSource } from "./types";
import { identifySupplier } from "./supplier-identifier";

/**
 * Hent riktig scraper basert på URL
 * Uses lazy imports to avoid loading Puppeteer for Temu URLs
 * 
 * SERVER-ONLY: This function can load Puppeteer-based scrapers
 * Use dynamic import in server-only contexts only
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
 * 
 * SERVER-ONLY: This function can load Puppeteer-based scrapers
 * Use dynamic import in server-only contexts only
 */
export async function scrapeProduct(url: string) {
  const scraper = await getScraperForUrl(url);
  if (!scraper) {
    throw new Error(`Unsupported supplier URL: ${url}`);
  }

  return scraper.scrapeProduct(url);
}

