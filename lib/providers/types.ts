import type { ScrapedProductData } from "@/lib/scrapers/types";

/**
 * JSON-shaped metadata attached by import providers (Alibaba, Temu, …).
 * Comes from scraped/embedded JSON — keep fields used by mapToProduct / bulk-import.
 */
export interface RawProductMetadata {
  warnings?: string[];
  source?: string;
  url?: string;
  priceRange?: {
    amount?: number;
    currency?: string;
    fromPrice?: number;
    toPrice?: number;
    minPrice?: number;
    from?: number;
    to?: number;
    min?: number;
    max?: number;
  };
  moq?: number;
  shipping?: string;
}

/**
 * Raw product data as fetched from the source.
 * Index signature keeps provider-specific JSON keys; `metadata` is typed explicitly
 * so `rawProduct.metadata?.warnings` typechecks (index-only access is `unknown` → `{}`).
 */
export interface RawProduct {
  metadata?: RawProductMetadata;
  warnings?: string[];
  [key: string]: unknown;
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
