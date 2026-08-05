/**
 * Living product quality score 0–100.
 */

import type { QualityBreakdown } from "@/lib/improve/types";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseImages(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String).filter(Boolean);
    } catch {
      return raw ? [raw] : [];
    }
  }
  return [];
}

function specCount(specs: unknown): number {
  if (!specs) return 0;
  if (Array.isArray(specs)) return specs.length;
  if (typeof specs === "object") return Object.keys(specs as object).length;
  return 0;
}

export type QualityInput = {
  images: unknown;
  metaTitle?: string | null;
  metaDescription?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  specs?: unknown;
  supplierSpecs?: unknown;
  category?: string | null;
  price: number;
  supplierPrice?: number | null;
  supplierStatus?: string | null;
  stock?: number | null;
  supplierInventory?: number | null;
  aiCategoryConfidence?: number | null;
  isActive?: boolean;
};

export function computeProductQuality(p: QualityInput): QualityBreakdown {
  const imgs = parseImages(p.images);
  const images = clamp(
    imgs.length >= 5 ? 95 : imgs.length >= 3 ? 80 : imgs.length >= 1 ? 50 : 10
  );

  const hasTitle = Boolean(p.metaTitle && p.metaTitle.trim().length >= 20);
  const hasDesc = Boolean(
    p.metaDescription && p.metaDescription.trim().length >= 70
  );
  const seo = clamp((hasTitle ? 50 : 15) + (hasDesc ? 45 : 10));

  const bodyLen = `${p.description || ""}${p.shortDescription || ""}`.length;
  const description = clamp(
    bodyLen >= 400 ? 90 : bodyLen >= 150 ? 70 : bodyLen >= 40 ? 45 : 15
  );

  const specs = clamp(
    (() => {
      const n = Math.max(specCount(p.specs), specCount(p.supplierSpecs));
      return n >= 8 ? 95 : n >= 4 ? 75 : n >= 1 ? 45 : 10;
    })()
  );

  const category = clamp(
    p.category && p.category.trim() && p.category !== "Ukategorisert"
      ? p.aiCategoryConfidence != null
        ? 50 + (p.aiCategoryConfidence || 0) / 2
        : 75
      : 20
  );

  const price = clamp(p.price > 0 ? (p.price < 50 ? 55 : 85) : 5);

  const supplier = clamp(
    p.supplierStatus === "available"
      ? 90
      : p.supplierStatus === "out_of_stock"
        ? 35
        : p.supplierStatus === "unavailable"
          ? 10
          : 50
  );

  let margin = 40;
  if (p.supplierPrice && p.supplierPrice > 0 && p.price > 0) {
    const pct = ((p.price - p.supplierPrice) / p.price) * 100;
    margin = clamp(pct >= 40 ? 95 : pct >= 25 ? 75 : pct >= 15 ? 50 : 25);
  }

  const stockVal = p.stock ?? p.supplierInventory ?? null;
  const stock = clamp(
    stockVal == null ? 55 : stockVal >= 20 ? 90 : stockVal >= 5 ? 65 : stockVal > 0 ? 35 : 10
  );

  const confidence = clamp(p.aiCategoryConfidence ?? 55);

  const total = clamp(
    images * 0.15 +
      seo * 0.12 +
      description * 0.12 +
      specs * 0.12 +
      category * 0.1 +
      price * 0.08 +
      supplier * 0.08 +
      margin * 0.1 +
      stock * 0.08 +
      confidence * 0.05
  );

  return {
    images,
    seo,
    description,
    specs,
    category,
    price,
    supplier,
    margin,
    stock,
    confidence,
    total,
  };
}
