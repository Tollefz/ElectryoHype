/**
 * Internal normalized product model — supplier-agnostic.
 * Everything downstream (AI, review, storefront) uses this, never raw CJ/Alibaba payloads.
 */

import type {
  SupplierProductDetail,
  SupplierProductVariant,
  SupplierVideo,
} from "@/lib/suppliers/provider";

export type InternalVariant = {
  supplierVariantId: string;
  sku: string | null;
  name: string;
  price: number;
  currency: string;
  stock: number | null;
  imageUrl: string | null;
  weightGrams: number | null;
  dimensionsMm: {
    length: number | null;
    width: number | null;
    height: number | null;
  } | null;
  volumeMm3: number | null;
  barcode: string | null;
  attributes: Record<string, string>;
};

export type InternalProduct = {
  supplierProductId: string;
  sku: string | null;
  title: string;
  description: string;
  images: string[];
  price: number;
  currency: string;
  category: string | null;
  categoryId: string | null;
  stock: number | null;
  deliveryTime: string | null;
  weightGrams: number | null;
  warehouse: string | null;
  variants: InternalVariant[];
  specifications: Record<string, string>;
  attributes: Record<string, string>;
  videos: SupplierVideo[];
  supplierUrl: string | null;
  shippingEstimate: number | null;
};

export function toInternalProduct(detail: SupplierProductDetail): InternalProduct {
  return {
    supplierProductId: detail.id,
    sku: detail.sku,
    title: detail.title,
    description: detail.description || "",
    images: detail.sourceImages?.length ? detail.sourceImages : detail.images,
    price: detail.price,
    currency: detail.currency || "USD",
    category: detail.category,
    categoryId: detail.categoryId,
    stock: detail.stock,
    deliveryTime: detail.deliveryTime,
    weightGrams: detail.weightGrams,
    warehouse: detail.warehouse,
    variants: (detail.variants || []).map(toInternalVariant),
    specifications: { ...(detail.specifications || {}) },
    attributes: { ...(detail.attributes || {}) },
    videos: Array.isArray(detail.videos) ? detail.videos : [],
    supplierUrl: detail.supplierUrl,
    shippingEstimate: detail.shippingEstimate,
  };
}

function toInternalVariant(v: SupplierProductVariant): InternalVariant {
  return {
    supplierVariantId: v.id,
    sku: v.sku,
    name: v.name,
    price: v.price,
    currency: v.currency || "USD",
    stock: v.stock,
    imageUrl: v.imageUrl,
    weightGrams: v.weightGrams ?? null,
    dimensionsMm: v.dimensionsMm ?? null,
    volumeMm3: v.volumeMm3 ?? null,
    barcode: v.barcode ?? null,
    attributes: { ...(v.attributes || {}) },
  };
}

/** Stable snapshot for change detection (no raw blobs). */
export function snapshotInternalProduct(p: InternalProduct): Record<string, unknown> {
  return {
    supplierProductId: p.supplierProductId,
    sku: p.sku,
    title: p.title,
    images: p.images,
    price: p.price,
    currency: p.currency,
    stock: p.stock,
    warehouse: p.warehouse,
    specifications: p.specifications,
    attributes: p.attributes,
    videos: p.videos.map((v) => ({ id: v.id, url: v.url })),
    variants: p.variants.map((v) => ({
      id: v.supplierVariantId,
      sku: v.sku,
      price: v.price,
      stock: v.stock,
      imageUrl: v.imageUrl,
      attributes: v.attributes,
      weightGrams: v.weightGrams,
    })),
  };
}
