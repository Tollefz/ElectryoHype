/**
 * Google Merchant Center product feed builder (RSS 2.0 + g: namespace).
 * Spec: https://support.google.com/merchants/answer/160589
 */

import { SITE_CONFIG } from "@/lib/site";
import { SHIPPING_MESSAGES } from "@/lib/shippingCopy";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { cleanProductName } from "@/lib/utils/url-decode";
import { getAvailability } from "@/lib/products/availability";

export type MerchantFeedProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  metaDescription: string | null;
  price: number;
  compareAtPrice: number | null;
  images: string;
  category: string | null;
  sku: string | null;
  supplierSku: string | null;
  stock: number;
  isActive: boolean;
  variants: Array<{
    barcode: string | null;
    sku: string | null;
    stock: number;
    isActive: boolean;
  }>;
};

const EXCLUDED_CATEGORIES = ["Sport", "Klær", "Sport & Trening"];

export function merchantFeedStoreFilter() {
  return {
    isActive: true as const,
    storeId: DEFAULT_STORE_ID,
    category: { notIn: EXCLUDED_CATEGORIES },
  };
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseImages(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (u): u is string =>
        typeof u === "string" &&
        u.startsWith("http") &&
        !u.includes("placehold")
    );
  } catch {
    return [];
  }
}

function moneyNok(n: number): string {
  return `${n.toFixed(2)} NOK`;
}

/** GS1 check-digit validation for GTIN-8/12/13/14. */
export function isValidGtin(code: string): boolean {
  const c = code.trim();
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(c)) return false;
  const digits = c.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  const rev = [...digits].reverse();
  for (let i = 0; i < rev.length; i++) {
    sum += rev[i]! * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

function pickGtin(variants: MerchantFeedProduct["variants"]): string | undefined {
  for (const v of variants) {
    const code = v.barcode?.trim();
    if (!code) continue;
    if (isValidGtin(code)) return code;
  }
  return undefined;
}

function productDescription(p: MerchantFeedProduct): string {
  const raw =
    p.shortDescription ||
    p.metaDescription ||
    p.description ||
    p.name;
  const text = stripHtml(raw).slice(0, 5000);
  return text.length >= 25
    ? text
    : `${cleanProductName(p.name)}. Kjøp hos ElectroHypeX. Levering i Norge.`;
}

function feedAvailability(p: MerchantFeedProduct): "in_stock" | "out_of_stock" {
  // Align with storefront dropship policy: active ⇒ sellable (stock is informational).
  const avail = getAvailability({
    stock: p.stock,
    variants: p.variants.map((v) => ({ stock: v.stock })),
    isActive: p.isActive,
  });
  return avail.purchasable ? "in_stock" : "out_of_stock";
}

/**
 * Build one <item> for the Google product feed.
 */
export function buildMerchantItemXml(p: MerchantFeedProduct): string | null {
  const images = parseImages(p.images);
  if (images.length === 0) return null;

  const title = cleanProductName(p.name).slice(0, 150);
  if (!title || !Number.isFinite(p.price) || p.price <= 0) return null;

  const link = `${SITE_CONFIG.siteUrl}/products/${p.slug}`;
  const availability = feedAvailability(p);
  const gtin = pickGtin(p.variants);
  const mpn = (p.sku || p.supplierSku || p.id).slice(0, 70);
  const brand = SITE_CONFIG.siteName;

  const lines: string[] = [
    "<item>",
    `<g:id>${xmlEscape(p.id)}</g:id>`,
    `<title>${xmlEscape(title)}</title>`,
    `<description>${xmlEscape(productDescription(p))}</description>`,
    `<link>${xmlEscape(link)}</link>`,
    `<g:image_link>${xmlEscape(images[0]!)}</g:image_link>`,
  ];

  for (const extra of images.slice(1, 10)) {
    lines.push(`<g:additional_image_link>${xmlEscape(extra)}</g:additional_image_link>`);
  }

  lines.push(`<g:availability>${availability}</g:availability>`);
  lines.push(`<g:condition>new</g:condition>`);

  if (
    p.compareAtPrice != null &&
    p.compareAtPrice > p.price &&
    Number.isFinite(p.compareAtPrice)
  ) {
    const disc = 1 - p.price / p.compareAtPrice;
    // Only expose sale_price for plausible discounts (Merchant policy)
    if (disc >= 0.05 && disc <= 0.4) {
      lines.push(`<g:price>${moneyNok(p.compareAtPrice)}</g:price>`);
      lines.push(`<g:sale_price>${moneyNok(p.price)}</g:sale_price>`);
    } else {
      lines.push(`<g:price>${moneyNok(p.price)}</g:price>`);
    }
  } else {
    lines.push(`<g:price>${moneyNok(p.price)}</g:price>`);
  }

  lines.push(`<g:brand>${xmlEscape(brand)}</g:brand>`);

  if (gtin) {
    lines.push(`<g:gtin>${xmlEscape(gtin)}</g:gtin>`);
    if (p.sku) {
      lines.push(`<g:mpn>${xmlEscape(p.sku.slice(0, 70))}</g:mpn>`);
    } else {
      lines.push(`<g:mpn>${xmlEscape(mpn)}</g:mpn>`);
    }
  } else {
    lines.push(`<g:identifier_exists>false</g:identifier_exists>`);
    lines.push(`<g:mpn>${xmlEscape(mpn)}</g:mpn>`);
  }

  if (p.category) {
    lines.push(`<g:product_type>${xmlEscape(p.category)}</g:product_type>`);
  }

  lines.push("<g:shipping>");
  lines.push("<g:country>NO</g:country>");
  lines.push("<g:service>Standard</g:service>");
  lines.push(
    `<g:price>${moneyNok(SHIPPING_MESSAGES.STANDARD_SHIPPING_COST)}</g:price>`
  );
  lines.push("</g:shipping>");

  lines.push("<g:return_policy_label>30_days</g:return_policy_label>");

  lines.push("</item>");
  return lines.join("\n");
}

export function buildGoogleMerchantRss(itemsXml: string[]): string {
  const base = SITE_CONFIG.siteUrl;
  const now = new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(SITE_CONFIG.siteName)} Product Feed</title>
    <link>${xmlEscape(base)}</link>
    <description>Google Merchant Center product feed for ${xmlEscape(SITE_CONFIG.siteName)}</description>
    <lastBuildDate>${now}</lastBuildDate>
${itemsXml.map((item) => `    ${item.replace(/\n/g, "\n    ")}`).join("\n")}
  </channel>
</rss>
`;
}
