import { getAllDbValues } from "@/lib/categories";
import { SHIPPING_MESSAGES } from "@/lib/shippingCopy";

export const IMPORT_CATEGORIES = getAllDbValues();

export const IMPORT_DELIVERY_TIME = "5–12 virkedager";

export const DELIVERY_DISPLAY = SHIPPING_MESSAGES.ESTIMATED_DELIVERY.replace(
  " (varierer)",
  ""
);

export type ImportEditableField =
  | "name"
  | "description"
  | "shortDescription"
  | "suggestedPrice"
  | "compareAtPrice"
  | "category"
  | "tags"
  | "slug"
  | "metaTitle"
  | "metaDescription";

export interface ImportVariantPreview {
  name: string;
  price: number;
  compareAtPrice?: number | null;
  supplierPrice: number;
  image?: string | null;
  attributes: Record<string, string>;
  /** Supplier stock. Null when the supplier does not provide stock. */
  stock: number | null;
  /** Supplier SKU when available. */
  sku?: string | null;
}

export interface AIEnrichmentResult {
  title: string;
  shortIntroduction: string;
  benefits: string[];
  specifications: Record<string, string>;
  packageContents: string;
  category: string;
  /** Optional subcategory within the main category. */
  subcategory?: string | null;
  tags: string[];
  slug: string;
  metaTitle: string;
  metaDescription: string;
  highlightedFeatures?: string[];
}

export interface AIImproveResult {
  name: string;
  description: string;
  shortDescription: string;
  category: string;
  tags: string[];
  slug: string;
  metaTitle: string;
  metaDescription: string;
  suggestedPrice: number;
  compareAtPrice: number;
  highlightedFeatures: string[];
}

export interface ImportPipelineResult {
  url: string;
  supplier: string;
  originalTitle: string;
  originalDescription: string;
  originalPrice: number;
  suggestedPrice: number;
  compareAtPrice: number;
  name: string;
  description: string;
  shortDescription: string;
  category: string;
  /** Detected subcategory within the main category (import-level refinement). */
  subcategory: string | null;
  tags: string[];
  slug: string;
  metaTitle: string;
  metaDescription: string;
  deliveryTime: string;
  images: string[];
  specs: Record<string, string>;
  variants: ImportVariantPreview[];
  aiGenerated: boolean;
  aiWarning?: string;
}

export interface EnrichmentContext {
  /** Optional source URL or synthetic supplier reference for logging. */
  url?: string | null;
  supplier: string;
  originalTitle: string;
  originalDescription: string;
  costNOK: number;
  images: string[];
  /** Structured supplier specs — source of truth for AI. */
  specs: Record<string, string>;
  variants: ImportVariantPreview[];
}

/** @deprecated Use EnrichmentContext — scrape/URL is not required for catalog imports. */
export type ScrapeContext = EnrichmentContext;
