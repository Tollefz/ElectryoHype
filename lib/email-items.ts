/**
 * Normalize order line items for emails and admin UI.
 * Handles inconsistent checkout snapshots (name vs productName, missing images).
 */

import { SITE_CONFIG } from "@/lib/site";
import {
  humanizeProductTitle,
  isPlaceholderProductName,
} from "@/lib/email-branding";

export type EmailOrderItem = {
  name: string;
  quantity: number;
  price: number;
  image?: string | null;
  productUrl?: string | null;
  variantName?: string | null;
};

type RawItem = Record<string, unknown> & {
  name?: unknown;
  productName?: unknown;
  product?: ProductLike | null;
  variantName?: string | null;
  variant?: { name?: unknown } | null;
  image?: string | null;
  imageUrl?: string | null;
  thumbnail?: string | null;
  quantity?: unknown;
  price?: unknown;
  variantId?: string | null;
  productId?: string | null;
  slug?: string | null;
};

type ProductLike = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  images?: string | null;
};

function siteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    SITE_CONFIG.siteUrl ||
    process.env.NEXTAUTH_URL ||
    "https://www.electrohypex.com"
  ).replace(/\/$/, "");
}

export function emailLogoUrl(): string {
  return `${siteBaseUrl()}/email-logo.png`;
}

export function productPageUrl(slug?: string | null): string | null {
  if (!slug) return null;
  return `${siteBaseUrl()}/products/${slug}`;
}

function firstImageFromProduct(product?: ProductLike | null): string | null {
  if (!product?.images) return null;
  try {
    const parsed = typeof product.images === "string" ? JSON.parse(product.images) : product.images;
    if (Array.isArray(parsed) && parsed[0]) return String(parsed[0]);
  } catch {
    /* ignore */
  }
  return null;
}

function resolveName(raw: RawItem, product?: ProductLike | null): string {
  const candidates = [
    raw.name,
    raw.productName,
    product?.name,
    raw.product?.name,
  ]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean);

  const title =
    candidates.find((c) => !isPlaceholderProductName(c)) ||
    candidates[0] ||
    "";

  const variant = raw.variantName || raw.variant?.name || null;
  const human = humanizeProductTitle(title);
  if (variant && human !== "Produkt" && !human.includes(String(variant))) {
    return `${human} – ${String(variant)}`;
  }
  return human;
}

function resolveImage(raw: RawItem, product?: ProductLike | null): string | null {
  return (
    raw.image ||
    raw.imageUrl ||
    raw.thumbnail ||
    firstImageFromProduct(product) ||
    firstImageFromProduct(raw.product) ||
    null
  );
}

function indexOrderItems(
  orderItems: Array<{
    productId?: string;
    variantId?: string | null;
    variantName?: string | null;
    quantity?: number;
    price?: number;
    product?: ProductLike | null;
  }> = []
) {
  const byProduct = new Map<string, (typeof orderItems)[number]>();
  const byVariant = new Map<string, (typeof orderItems)[number]>();
  for (const oi of orderItems) {
    if (oi.productId) byProduct.set(oi.productId, oi);
    if (oi.variantId) byVariant.set(oi.variantId, oi);
  }
  return { byProduct, byVariant, list: orderItems };
}

/**
 * Build display-ready line items from order.items JSON + orderItems relation.
 * @param options.forCustomerEmail - hide obvious test/placeholder SKUs from customer mail
 */
export function normalizeOrderLineItems(input: {
  itemsJson?: unknown;
  orderItems?: Array<{
    productId?: string;
    variantId?: string | null;
    variantName?: string | null;
    quantity?: number;
    price?: number;
    product?: ProductLike | null;
  }>;
  forCustomerEmail?: boolean;
}): EmailOrderItem[] {
  const indexed = indexOrderItems(input.orderItems || []);

  let rawList: RawItem[] = [];
  try {
    if (typeof input.itemsJson === "string") {
      const parsed = JSON.parse(input.itemsJson);
      rawList = Array.isArray(parsed) ? parsed : [];
    } else if (Array.isArray(input.itemsJson)) {
      rawList = input.itemsJson as RawItem[];
    }
  } catch {
    rawList = [];
  }

  let items: EmailOrderItem[] = [];

  if (rawList.length === 0 && indexed.list.length > 0) {
    items = indexed.list.map((oi) => ({
      name: resolveName({ variantName: oi.variantName }, oi.product),
      quantity: Number(oi.quantity) || 1,
      price: Number(oi.price) || 0,
      image: firstImageFromProduct(oi.product),
      productUrl: productPageUrl(oi.product?.slug),
      variantName: oi.variantName || null,
    }));
  } else {
    items = rawList.map((raw) => {
      const match =
        (raw.variantId && indexed.byVariant.get(String(raw.variantId))) ||
        (raw.productId && indexed.byProduct.get(String(raw.productId))) ||
        null;

      const product = match?.product || raw.product || null;
      const name = resolveName(raw, product);
      const quantity = Number(raw.quantity ?? match?.quantity) || 1;
      const price = Number(raw.price ?? match?.price) || 0;
      const image = resolveImage(raw, product);
      const slug = product?.slug || raw.slug || null;

      return {
        name,
        quantity,
        price,
        image,
        productUrl: productPageUrl(slug),
        variantName: raw.variantName || match?.variantName || null,
      };
    });
  }

  if (input.forCustomerEmail) {
    items = items.filter((item) => !isPlaceholderProductName(item.name));
  }

  return items;
}

// Re-export labels for older server imports (prefer @/lib/order-labels in new code)
export {
  SUPPLIER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  humanPaymentMethod,
} from "@/lib/order-labels";
