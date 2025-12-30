import type { ImportProvider, RawProduct, MappedProduct } from "./types";
import type { ScrapedProductData } from "@/lib/scrapers/types";
import { TemuScraper } from "@/lib/scrapers/temu-scraper";
import { normalizeUrl as normalizeUrlUtil, isValidTemuUrl } from "@/lib/utils/url-validation";

/**
 * Temu import provider
 * Wraps the existing TemuScraper to implement the ImportProvider interface
 */
export class TemuProvider implements ImportProvider {
  private scraper: TemuScraper;

  constructor() {
    this.scraper = new TemuScraper();
  }

  getName(): string {
    return "temu";
  }

  canHandle(url: string): boolean {
    return isValidTemuUrl(url);
  }

  normalizeUrl(url: string): string {
    return normalizeUrlUtil(url);
  }

  async fetchProduct(url: string): Promise<RawProduct> {
    const normalizedUrl = this.normalizeUrl(url);
    const result = await this.scraper.scrapeProduct(normalizedUrl);

    if (!result.success || !result.data) {
      throw new Error(
        result.error || "Failed to fetch product data from Temu"
      );
    }

    // Return the scraped data as raw product
    // The scraper already returns data in a structured format
    return result.data as unknown as RawProduct;
  }

  mapToProduct(raw: RawProduct, originalUrl: string): MappedProduct {
    // The TemuScraper already returns data in ScrapedProductData format
    // We just need to ensure it matches our MappedProduct interface
    const data = raw as unknown as ScrapedProductData;

    // Ensure all required fields are present
    return {
      supplier: data.supplier || "temu",
      url: originalUrl,
      title: data.title || "Temu Produkt",
      description: data.description || "",
      price: data.price || { amount: 9.99, currency: "USD" },
      images: data.images || [],
      specs: data.specs || {},
      shippingEstimate: data.shippingEstimate,
      availability: data.availability !== false,
      variants: data.variants || [],
    };
  }
}

