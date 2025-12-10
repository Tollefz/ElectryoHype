export type SupplierSource = "alibaba" | "ebay" | "temu";

export interface ProductVariant {
  name: string; // E.g., "Rød - 2m" or "Large - Blå"
  price: number;
  compareAtPrice?: number;
  supplierPrice?: number;
  image?: string;
  attributes: Record<string, string>; // E.g., {"color": "Rød", "length": "2m"}
  sku?: string;
  stock?: number;
}

export interface ScrapedProductData {
  supplier: SupplierSource;
  url: string;
  title: string;
  description: string;
  price: {
    amount: number;
    currency: string;
  };
  images: string[];
  specs?: Record<string, string>;
  shippingEstimate?: string;
  availability?: boolean;
  variants?: ProductVariant[]; // Product variants (colors, sizes, lengths, etc.)
}

export interface ScraperResult<T = ScrapedProductData> {
  success: boolean;
  data?: T;
  error?: string;
  rawHtml?: string;
}

export interface ScraperOptions {
  locale?: string;
  currency?: string;
  minDelayMs?: number;
  maxDelayMs?: number;
  userAgentRotation?: boolean;
}

export interface Scraper<TData = ScrapedProductData> {
  scrapeProduct: (url: string) => Promise<ScraperResult<TData>>;
  scrapePrice?: (url: string) => Promise<number>;
  scrapeImages?: (url: string) => Promise<string[]>;
  scrapeDescription?: (url: string) => Promise<string>;
}

