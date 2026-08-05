/**
 * Catalog supplier engine — provider-agnostic types.
 * Fulfillment adapters live in sibling files (cjSupplier.ts etc.) and stay separate.
 */

export type CatalogSupplierId =
  | "cj"
  | "temu"
  | "alibaba"
  | "aliexpress"
  | "banggood"
  | "onesixeight"
  | "csv";

export type SupplierSortBy =
  | "relevance"
  | "bestsellers"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "rating"
  | "stock";

export interface SupplierSearchFilters {
  query?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  /** ISO country / warehouse code, e.g. CN, US, DE */
  warehouse?: string;
  minRating?: number;
  minStock?: number;
  maxStock?: number;
  /** Max delivery days (when supplier exposes cycle) */
  maxDeliveryDays?: number;
  sortBy?: SupplierSortBy;
  page?: number;
  pageSize?: number;
}

export interface SupplierSearchProduct {
  id: string;
  sku: string | null;
  title: string;
  imageUrl: string | null;
  price: number;
  currency: string;
  category: string | null;
  categoryId: string | null;
  rating: number | null;
  stock: number | null;
  deliveryTime: string | null;
  weightGrams: number | null;
  variantCount: number;
  warehouse: string | null;
  listedCount: number | null;
  supplierUrl: string | null;
  raw?: unknown;
}

export interface SupplierSearchResult {
  products: SupplierSearchProduct[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SupplierProductVariant {
  id: string;
  sku: string | null;
  name: string;
  price: number;
  currency: string;
  stock: number | null;
  imageUrl: string | null;
  weightGrams: number | null;
  /** Length/width/height in mm when provided by supplier */
  dimensionsMm?: {
    length: number | null;
    width: number | null;
    height: number | null;
  } | null;
  volumeMm3?: number | null;
  barcode?: string | null;
  barcode2?: string | null;
  suggestedRetailPrice?: number | null;
  attributes: Record<string, string>;
}

export interface SupplierVideo {
  id: string;
  url: string | null;
  name: string | null;
  coverUrl: string | null;
  type: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

export interface SupplierProductDetail {
  id: string;
  sku: string | null;
  title: string;
  description: string;
  images: string[];
  /** Exact image list from supplier before local prepare/filter */
  sourceImages: string[];
  price: number;
  currency: string;
  category: string | null;
  categoryId: string | null;
  stock: number | null;
  deliveryTime: string | null;
  weightGrams: number | null;
  /** Raw weight string from supplier when range/text (e.g. "150.00-156.00") */
  weightRaw: string | null;
  packingWeightRaw: string | null;
  warehouse: string | null;
  variants: SupplierProductVariant[];
  /** Structured supplier specifications — source of truth */
  specifications: Record<string, string>;
  /** Product-level attributes / options (Color, Size, …) */
  attributes: Record<string, string>;
  videos: SupplierVideo[];
  supplierUrl: string | null;
  shippingEstimate: number | null;
  listedCount: number | null;
  suggestSellPriceRaw: string | null;
  status: string | null;
  raw?: unknown;
}

export interface SupplierInventorySnapshot {
  supplierProductId: string;
  sku: string | null;
  price: number | null;
  currency: string;
  stock: number | null;
  available: boolean;
  warehouse: string | null;
  checkedAt: Date;
}

export interface SupplierImportResult {
  queueItemIds: string[];
  imported: number;
  skipped: number;
  failed: Array<{ supplierProductId: string; error: string }>;
}

export interface SupplierProviderMeta {
  id: CatalogSupplierId;
  displayName: string;
  configured: boolean;
}

/**
 * Catalog SupplierProvider — search / import / normalize / sync / facets.
 * App code outside lib/suppliers/{provider} must not know CJ vs Temu internals.
 *
 * New providers only implement this contract — no other system changes required.
 */
export interface SupplierProvider {
  readonly id: CatalogSupplierId;
  readonly displayName: string;

  isConfigured(): Promise<boolean>;

  /** Search catalog */
  searchProducts(filters: SupplierSearchFilters): Promise<SupplierSearchResult>;

  /** Full product fetch */
  getProduct(supplierProductId: string): Promise<SupplierProductDetail | null>;

  /** Normalize supplier-native payload → internal detail */
  normalizeProduct(raw: unknown): SupplierProductDetail;

  /** Enqueue import(s) into platform queue */
  importProducts(supplierProductIds: string[], opts?: {
    createdById?: string | null;
    createdByEmail?: string | null;
    storeId?: string | null;
    supplierAccountId?: string | null;
  }): Promise<SupplierImportResult>;

  /** Inventory sync facet */
  syncInventory(supplierProductIds?: string[]): Promise<{
    checked: number;
    updated: number;
    unavailable: number;
    snapshots: SupplierInventorySnapshot[];
  }>;

  /** Pricing sync facet */
  syncPrice(supplierProductIds?: string[]): Promise<{
    checked: number;
    updated: number;
  }>;

  /** Inventory snapshot for one product */
  getInventory(supplierProductId: string): Promise<SupplierInventorySnapshot | null>;

  /** Pricing facet */
  getPricing(supplierProductId: string): Promise<{
    price: number;
    currency: string;
    shippingEstimate: number | null;
    suggestSellPriceRaw: string | null;
  } | null>;

  /** Media (images + videos) */
  getMedia(supplierProductId: string): Promise<{
    images: string[];
    sourceImages: string[];
    videos: SupplierVideo[];
  } | null>;

  /** Specifications */
  getSpecifications(supplierProductId: string): Promise<Record<string, string> | null>;

  /** Videos only */
  getVideos(supplierProductId: string): Promise<SupplierVideo[] | null>;
}
