/**
 * Shared availability logic for products
 * Ensures consistent availability display across listing and detail pages
 */

export interface AvailabilityInfo {
  label: string;
  inStock: boolean;
  purchasable: boolean;
  leadTimeDays?: { min: number; max: number };
  stockCount?: number;
}

interface ProductData {
  stock: number;
  variants?: Array<{ stock: number }>;
  isActive?: boolean;
}

/**
 * Calculate product availability from product and variant stock
 * 
 * Rules:
 * - If product is active: purchasable with lead time (5-12 days), show "Tilgjengelig"
 * - If product is not active: not purchasable, show "Ikke på lager"
 * - For dropshipping products, stock count doesn't determine purchasability
 * - Always show lead time (5-12 business days) for purchasable items
 */
export function getAvailability(product: ProductData): AvailabilityInfo {
  // Calculate total stock from product + variants (for display purposes)
  const variantStock = product.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) || 0;
  const totalStock = variantStock || product.stock || 0;
  const isActive = product.isActive !== false; // Default to true if not specified

  // Dropshipping: active ⇒ purchasable with lead time. Stock is informational only.
  const purchasable = isActive;
  const isInStock = totalStock > 0;

  let label: string;
  if (!purchasable) {
    label = "Ikke på lager";
  } else {
    label = "Tilgjengelig";
  }

  return {
    label,
    inStock: isInStock,
    purchasable,
    leadTimeDays: purchasable ? { min: 5, max: 12 } : undefined,
    stockCount: totalStock,
  };
}

/**
 * Get availability badge styling classes
 */
export function getAvailabilityBadgeClasses(availability: AvailabilityInfo): string {
  if (!availability.purchasable) {
    return "rounded-[var(--ehx-radius-sm)] bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 sm:px-3 sm:text-sm";
  }
  return "rounded-[var(--ehx-radius-sm)] bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-dark)] sm:px-3 sm:text-sm";
}

