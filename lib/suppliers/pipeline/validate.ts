/**
 * Pipeline stage: Validate — reject incomplete supplier payloads early.
 */

import type { InternalProduct } from "@/lib/suppliers/internal-product";

export type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

export type ValidationReport = {
  ok: boolean;
  issues: ValidationIssue[];
};

export function validateInternalProduct(product: InternalProduct): ValidationReport {
  const issues: ValidationIssue[] = [];

  if (!product.supplierProductId) {
    issues.push({
      code: "missing_id",
      severity: "error",
      message: "Mangler leverandør-produkt-ID",
    });
  }
  if (!product.title?.trim()) {
    issues.push({
      code: "missing_title",
      severity: "error",
      message: "Mangler tittel",
    });
  }
  if (!(product.price > 0)) {
    issues.push({
      code: "missing_price",
      severity: "error",
      message: "Pris mangler eller er 0",
    });
  }
  if (!product.images.length) {
    issues.push({
      code: "missing_images",
      severity: "error",
      message: "Ingen bilder",
    });
  }
  if (!product.sku && !product.variants.some((v) => v.sku)) {
    issues.push({
      code: "missing_sku",
      severity: "warning",
      message: "Ingen SKU på produkt eller varianter",
    });
  }
  if (product.stock == null) {
    issues.push({
      code: "missing_stock",
      severity: "warning",
      message: "Lagerstatus ukjent",
    });
  }
  for (const v of product.variants) {
    if (!(v.price > 0)) {
      issues.push({
        code: "variant_price",
        severity: "warning",
        message: `Variant ${v.sku || v.supplierVariantId} mangler pris`,
      });
    }
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
  };
}
