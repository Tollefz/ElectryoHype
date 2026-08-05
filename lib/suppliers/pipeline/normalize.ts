/**
 * Pipeline stage: Normalize — images, currency, attributes cleanup.
 */

import {
  prepareImagesDetailed,
  type PrepareImagesResult,
} from "@/lib/import/image-quality";
import type { InternalProduct } from "@/lib/suppliers/internal-product";

export type NormalizeResult = {
  product: InternalProduct;
  imageReport: PrepareImagesResult;
};

export function normalizeInternalProduct(product: InternalProduct): NormalizeResult {
  const imageReport = prepareImagesDetailed(product.images);
  const specs: Record<string, string> = {};
  for (const [k, v] of Object.entries(product.specifications || {})) {
    const key = k.trim();
    const val = String(v ?? "").trim();
    if (key && val) specs[key] = val;
  }
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(product.attributes || {})) {
    const key = k.trim();
    const val = String(v ?? "").trim();
    if (key && val) attributes[key] = val;
  }

  const variants = product.variants.map((v) => ({
    ...v,
    name: (v.name || "Variant").trim(),
    sku: v.sku?.trim() || null,
    attributes: Object.fromEntries(
      Object.entries(v.attributes || {})
        .map(([ak, av]) => [ak.trim(), String(av).trim()] as const)
        .filter(([ak, av]) => ak && av)
    ),
  }));

  return {
    product: {
      ...product,
      title: product.title.trim(),
      description: product.description || "",
      images: imageReport.images,
      currency: (product.currency || "USD").toUpperCase(),
      specifications: specs,
      attributes,
      variants,
      videos: (product.videos || []).filter((vid) => Boolean(vid.id)),
    },
    imageReport,
  };
}
