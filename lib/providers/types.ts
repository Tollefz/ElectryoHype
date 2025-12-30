import type { ScrapedProductData } from "@/lib/scrapers/types";

/**
 * Raw product data as fetched from the source
 */
export interface RawProduct {
  [key: string]: any;
}

/**
 * Mapped product data in our standard format
 */
export interface MappedProduct extends ScrapedProductData {
  // Extends ScrapedProductData which already has all needed fields
}

/**
 * Import provider interface
 * Each provider handles a specific import source (Temu, Alibaba, etc.)
 */
export interface ImportProvider {
  /**
   * Check if this provider can handle the given URL
   */
  canHandle(url: string): boolean;

  /**
   * Normalize URL by stripping tracking parameters and canonicalizing
   */
  normalizeUrl(url: string): string;

  /**
   * Fetch raw product data from the source
   */
  fetchProduct(url: string): Promise<RawProduct>;

  /**
   * Map raw product data to our standard product format
   */
  mapToProduct(raw: RawProduct, originalUrl: string): MappedProduct;

  /**
   * Get provider name/identifier
   */
  getName(): string;
}

/**
 * Bulk import result per URL
 */
export interface BulkImportResult {
  inputUrl: string;
  normalizedUrl: string;
  providerUsed: string;
  status: "success" | "error" | "warning";
  message: string;
  createdProductId?: string;
  warnings?: string[];
}
