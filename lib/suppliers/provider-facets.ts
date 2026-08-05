/**
 * Expand SupplierProvider with facet contract + normalize.
 * New providers implement this; rest of platform stays unchanged.
 */

import type {
  SupplierInventorySnapshot,
  SupplierProductDetail,
  SupplierVideo,
} from "@/lib/suppliers/provider";

export type SupplierPricingFacet = {
  price: number;
  currency: string;
  shippingEstimate: number | null;
  suggestSellPriceRaw: string | null;
};

export type SupplierMediaFacet = {
  images: string[];
  sourceImages: string[];
  videos: SupplierVideo[];
};

/**
 * Optional facet methods — every provider should implement these.
 * Helpers below derive facets from getProduct for thin adapters.
 */
export type SupplierProviderFacets = {
  normalizeProduct(raw: unknown): SupplierProductDetail;
  getInventory(supplierProductId: string): Promise<SupplierInventorySnapshot | null>;
  getPricing(supplierProductId: string): Promise<SupplierPricingFacet | null>;
  getMedia(supplierProductId: string): Promise<SupplierMediaFacet | null>;
  getSpecifications(supplierProductId: string): Promise<Record<string, string> | null>;
  getVideos(supplierProductId: string): Promise<SupplierVideo[] | null>;
};

export function facetsFromGetProduct(
  getProduct: (id: string) => Promise<SupplierProductDetail | null>,
  normalizeProduct: (raw: unknown) => SupplierProductDetail
): SupplierProviderFacets {
  return {
    normalizeProduct,
    async getInventory(id) {
      const p = await getProduct(id);
      if (!p) return null;
      return {
        supplierProductId: p.id,
        sku: p.sku,
        price: p.price,
        currency: p.currency,
        stock: p.stock,
        available: (p.stock ?? 0) > 0 && p.status !== "unavailable",
        warehouse: p.warehouse,
        checkedAt: new Date(),
      };
    },
    async getPricing(id) {
      const p = await getProduct(id);
      if (!p) return null;
      return {
        price: p.price,
        currency: p.currency,
        shippingEstimate: p.shippingEstimate,
        suggestSellPriceRaw: p.suggestSellPriceRaw,
      };
    },
    async getMedia(id) {
      const p = await getProduct(id);
      if (!p) return null;
      return {
        images: p.images,
        sourceImages: p.sourceImages,
        videos: p.videos,
      };
    },
    async getSpecifications(id) {
      const p = await getProduct(id);
      if (!p) return null;
      return p.specifications;
    },
    async getVideos(id) {
      const p = await getProduct(id);
      if (!p) return null;
      return p.videos;
    },
  };
}
