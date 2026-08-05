/**
 * Global Product Presentation Layer.
 *
 * Import delivers raw data. This layer builds the ElectroHypeX storefront product.
 * All suppliers (CJ, Temu, CSV, Alibaba, …) render through the same template.
 */

export { buildProductPresentation } from "@/lib/products/presentation/build";
export type {
  ProductPresentation,
  ProductPresentationInput,
  PresentationVariant,
  PresentationMedia,
  PresentationTrustBadge,
  PresentationRelated,
} from "@/lib/products/presentation/types";
export {
  normalizeColorLabel,
  normalizeModelLabel,
  normalizeVariantValue,
  formatVariantLine,
} from "@/lib/products/presentation/normalize-locale";
