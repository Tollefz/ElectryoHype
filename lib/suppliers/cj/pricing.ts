import { calculateSupplierPricing } from "@/lib/suppliers/pricing";
import type { SupplierProductDetail } from "@/lib/suppliers/provider";

/** CJ-specific thin wrapper — still goes through SupplierPricing. */
export function priceCjProduct(detail: SupplierProductDetail, category?: string | null) {
  return calculateSupplierPricing({
    supplierPrice: detail.price,
    currency: detail.currency || "USD",
    shipping: detail.shippingEstimate,
    weightGrams: detail.weightGrams,
    category: category ?? detail.category,
  });
}
