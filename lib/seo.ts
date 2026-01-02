import type { Metadata } from 'next';
import { SITE_CONFIG } from './site';

export interface SEOProps {
  title: string;
  description: string;
  url?: string;
  images?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  keywords?: string[];
  type?: 'website' | 'article' | 'product';
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
  type = 'website',
  noindex = false,
  canonical,
}: SEOProps): Metadata {
  const baseUrl = SITE_CONFIG.siteUrl;
  const fullUrl = url ? `${baseUrl}${url}` : baseUrl;
  const canonicalUrl = canonical ? `${baseUrl}${canonical}` : fullUrl;

  // Default OG image if none provided
  const ogImages = images.length > 0 
    ? images.map(img => ({
        url: img.url.startsWith('http') ? img.url : `${baseUrl}${img.url}`,
        width: img.width || 1200,
        height: img.height || 630,
        alt: img.alt || title,
      }))
    : [{
        url: `${baseUrl}/og-image.jpg`, // Fallback - should be created
        width: 1200,
        height: 630,
        alt: title,
      }];

  return {
    title,
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: fullUrl,
      siteName: SITE_CONFIG.siteName,
      images: ogImages,
      type: type === 'product' ? 'website' : type, // OpenGraph doesn't have 'product' type
      locale: 'nb_NO',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImages.length > 0 ? [ogImages[0].url] : undefined,
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

/**
 * Generate Product JSON-LD structured data
 */
export function generateProductJSONLD({
  name,
  description,
  image,
  price,
  currency = 'NOK',
  availability = 'InStock',
  sku,
  brand,
  category,
  url,
}: {
  name: string;
  description?: string;
  image: string | string[];
  price: number;
  currency?: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder';
  sku?: string;
  brand?: string;
  category?: string;
  url: string;
}) {
  const images = Array.isArray(image) ? image : [image];
  const baseUrl = SITE_CONFIG.siteUrl;
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description: description || name,
    image: images.map(img => img.startsWith('http') ? img : `${baseUrl}${img}`),
    sku: sku || undefined,
    brand: brand ? {
      '@type': 'Brand',
      name: brand,
    } : undefined,
    category: category || undefined,
    offers: {
      '@type': 'Offer',
      url: fullUrl,
      priceCurrency: currency,
      price: price.toFixed(2),
      availability: `https://schema.org/${availability}`,
      seller: {
        '@type': 'Organization',
        name: SITE_CONFIG.siteName,
      },
    },
  };
}

/**
 * Generate BreadcrumbList JSON-LD structured data
 */
export function generateBreadcrumbJSONLD(items: Array<{ name: string; url: string }>) {
  const baseUrl = SITE_CONFIG.siteUrl;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${baseUrl}${item.url}`,
    })),
  };
}

/**
 * Generate Organization JSON-LD (for homepage)
 */
export function generateOrganizationJSONLD() {
  const baseUrl = SITE_CONFIG.siteUrl;

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_CONFIG.siteName,
    url: baseUrl,
    logo: `${baseUrl}/logo.png`, // Should be updated with actual logo URL
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: SITE_CONFIG.supportPhoneTel,
      contactType: 'customer service',
      email: SITE_CONFIG.supportEmail,
      availableLanguage: ['Norwegian', 'English'],
    },
    sameAs: [
      // Add social media URLs if available
    ],
  };
}

