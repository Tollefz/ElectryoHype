/**
 * Extended Product JSON-LD + Organization / Website / SearchAction for Marketing Foundation.
 */
import type { Metadata } from "next";
import { SITE_CONFIG } from "./site";
import { SHIPPING_MESSAGES } from "./shippingCopy";

export interface SEOProps {
  title: string;
  description: string;
  url?: string;
  images?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  keywords?: string[];
  type?: "website" | "article" | "product";
  noindex?: boolean;
  canonical?: string;
}

/**
 * Generate comprehensive SEO metadata for pages
 */
export function generateSEOMetadata({
  title,
  description,
  url,
  images = [],
  keywords = [],
  type = "website",
  noindex = false,
  canonical,
}: SEOProps): Metadata {
  const baseUrl = SITE_CONFIG.siteUrl;
  const fullUrl = url ? `${baseUrl}${url}` : baseUrl;
  const canonicalUrl = canonical ? `${baseUrl}${canonical}` : fullUrl;

  const ogImages =
    images.length > 0
      ? images.map((img) => ({
          url: img.url.startsWith("http") ? img.url : `${baseUrl}${img.url}`,
          width: img.width || 1200,
          height: img.height || 630,
          alt: img.alt || title,
        }))
      : [
          {
            url: `${baseUrl}/og-image.jpg`,
            width: 1200,
            height: 630,
            alt: title,
          },
        ];

  const resolvedTitle = /ElectroHypeX/i.test(title)
    ? title
    : `${title} | ElectroHypeX`;

  return {
    title: { absolute: resolvedTitle },
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    robots: noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      title: resolvedTitle,
      description,
      url: fullUrl,
      siteName: SITE_CONFIG.siteName,
      images: ogImages,
      type: type === "product" ? "website" : type,
      locale: "nb_NO",
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
      images: ogImages.length > 0 ? [ogImages[0].url] : undefined,
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

/**
 * Generate Product JSON-LD structured data (Merchant Center–oriented).
 */
export function generateProductJSONLD({
  name,
  description,
  image,
  price,
  compareAtPrice,
  currency = "NOK",
  availability = "InStock",
  sku,
  gtin,
  mpn,
  brand,
  category,
  url,
  condition = "NewCondition",
}: {
  name: string;
  description?: string;
  image: string | string[];
  price: number;
  compareAtPrice?: number | null;
  currency?: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
  sku?: string;
  gtin?: string;
  mpn?: string;
  brand?: string;
  category?: string;
  url: string;
  condition?: "NewCondition" | "UsedCondition" | "RefurbishedCondition";
}) {
  const images = Array.isArray(image) ? image : [image];
  const baseUrl = SITE_CONFIG.siteUrl;
  const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;

  const hasSale =
    typeof compareAtPrice === "number" &&
    compareAtPrice > price &&
    Number.isFinite(compareAtPrice);

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url: fullUrl,
    priceCurrency: currency,
    price: price.toFixed(2),
    availability: `https://schema.org/${availability}`,
    itemCondition: `https://schema.org/${condition}`,
    seller: {
      "@type": "Organization",
      name: SITE_CONFIG.siteName,
    },
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: String(SHIPPING_MESSAGES.STANDARD_SHIPPING_COST),
        currency: "NOK",
      },
      shippingDestination: {
        "@type": "DefinedRegion",
        addressCountry: "NO",
      },
      deliveryTime: {
        "@type": "ShippingDeliveryTime",
        handlingTime: {
          "@type": "QuantitativeValue",
          minValue: 1,
          maxValue: 3,
          unitCode: "DAY",
        },
        transitTime: {
          "@type": "QuantitativeValue",
          minValue: 5,
          maxValue: 12,
          unitCode: "DAY",
        },
      },
    },
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "NO",
      returnPolicyCategory:
        "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 30,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/FreeReturn",
    },
  };

  if (hasSale) {
    offer.price = price.toFixed(2);
    // Google prefers price as the current selling price; list price via priceSpecification when on sale
    offer.priceSpecification = {
      "@type": "UnitPriceSpecification",
      priceType: "https://schema.org/SalePrice",
      price: price.toFixed(2),
      priceCurrency: currency,
      referenceQuantity: {
        "@type": "QuantitativeValue",
        value: 1,
      },
    };
  }

  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: description || name,
    image: images.map((img) =>
      img.startsWith("http") ? img : `${baseUrl}${img}`
    ),
    sku: sku || undefined,
    gtin: gtin || undefined,
    mpn: mpn || undefined,
    brand: brand
      ? {
          "@type": "Brand",
          name: brand,
        }
      : undefined,
    category: category || undefined,
    offers: offer,
  };

  return product;
}

/**
 * Generate BreadcrumbList JSON-LD structured data
 */
export function generateBreadcrumbJSONLD(
  items: Array<{ name: string; url: string }>
) {
  const baseUrl = SITE_CONFIG.siteUrl;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${baseUrl}${item.url}`,
    })),
  };
}

/**
 * Generate Organization JSON-LD (homepage / sitewide)
 */
export function generateOrganizationJSONLD() {
  const baseUrl = SITE_CONFIG.siteUrl;

  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_CONFIG.siteName,
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: SITE_CONFIG.supportPhoneTel,
      contactType: "customer service",
      email: SITE_CONFIG.supportEmail,
      availableLanguage: ["Norwegian", "English"],
      areaServed: "NO",
    },
  };

  if (SITE_CONFIG.orgNumber) {
    org.taxID = SITE_CONFIG.orgNumber;
    org.vatID = SITE_CONFIG.orgNumber;
  }
  if (SITE_CONFIG.companyAddress) {
    org.address = {
      "@type": "PostalAddress",
      streetAddress: SITE_CONFIG.companyAddress,
      addressCountry: "NO",
    };
  }

  return org;
}

/**
 * WebSite + SearchAction for sitelinks search box.
 */
export function generateWebsiteJSONLD() {
  const baseUrl = SITE_CONFIG.siteUrl;

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_CONFIG.siteName,
    url: baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/products?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}
