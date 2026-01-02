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

  // For dropshipping products: if active, always purchasable with lead time
  // Stock count is informational only, doesn't affect purchasability
  const purchasable = isActive;
  const isInStock = totalStock > 0; // Informational only

  // Generate label
  let label: string;
  if (!purchasable) {
    label = "Ikke på lager";
  } else {
    // Purchasable products show "Tilgjengelig" (not stock count)
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
    return "rounded-md bg-red-100 px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-semibold text-red-700";
  }
  return "rounded-md bg-green-100 px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-semibold text-green-700";
}

