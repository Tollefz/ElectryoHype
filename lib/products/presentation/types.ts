/**
 * Global Product Presentation Layer — types.
 *
 * Importers deliver raw supplier data.
 * Frontend always renders from ProductPresentation — never from supplier shape.
 */

import type { CustomerSpec } from "@/lib/products/customer-specs";
import type { AvailabilityInfo } from "@/lib/products/availability";

export type PresentationTrustBadge = {
  id:
    | "free_shipping"
    | "open_purchase"
    | "delivery"
    | "warranty"
    | "secure_payment"
    | "support";
  title: string;
  subtitle: string;
};

export type PresentationVariant = {
  id: string;
  /** Internal / raw name (cart, admin) */
  name: string;
  price: number;
  compareAtPrice: number | null;
  image: string | null;
  attributes: Record<string, string>;
  stock: number;
  colorCode: string;
  slug: string;
  /** Normalized Norwegian primary label */
  labelPrimary: string;
  /** Normalized Norwegian secondary label */
  labelSecondary?: string;
};

export type PresentationMedia = {
  images: string[];
  videos: Array<{ url: string; name?: string; type?: string }>;
  /** Reserved for future 360 spin sets */
  spinFrames: string[];
};

export type PresentationRelated = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  images: string[];
  category: string | null;
};

/**
 * Fully normalized storefront product — supplier-agnostic.
 */
export type ProductPresentation = {
  id: string;
  slug: string;
  sku: string | null;
  /** Display title (cleaned, store style) */
  title: string;
  category: string;
  categoryHref: string | null;

  price: number;
  compareAtPrice: number | null;
  hasDiscount: boolean;
  discountPercent: number;

  /** Short ingress under price */
  shortIntro: string;
  /** Full HTML description (fixed ElectroHypeX sections) */
  descriptionHtml: string;

  media: PresentationMedia;
  defaultImage: string;

  variants: PresentationVariant[];
  variantTypeLabel: string;
  activeVariantSlug: string | undefined;

  specs: CustomerSpec[];

  availability: AvailabilityInfo;
  trustBadges: PresentationTrustBadge[];

  breadcrumbs: Array<{ name: string; href: string }>;

  related: PresentationRelated[];

  seo: {
    title: string;
    description: string;
  };

  jsonLd: {
    description: string;
  };

  /** Cart / CTA payload */
  cartProduct: {
    id: string;
    name: string;
    slug: string;
    price: number;
    compareAtPrice: number | null;
    image: string;
  };
};

/** Raw DB / import shape accepted by the presentation builder */
export type ProductPresentationInput = {
  id: string;
  slug: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  price: number;
  compareAtPrice?: number | null;
  stock?: number | null;
  isActive?: boolean | null;
  shortDescription?: string | null;
  description?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  images?: unknown;
  videos?: unknown;
  specs?: unknown;
  tags?: unknown;
  variants: Array<{
    id: string;
    name: string;
    price: number | string;
    compareAtPrice?: number | string | null;
    image?: string | null;
    attributes?: unknown;
    stock?: number | null;
    isActive?: boolean | null;
  }>;
  related?: Array<{
    id: string;
    name: string;
    slug: string;
    price: number | string;
    compareAtPrice?: number | string | null;
    images?: unknown;
    category?: string | null;
  }>;
  activeVariantParam?: string | null;
};
