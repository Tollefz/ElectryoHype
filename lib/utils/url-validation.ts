/**
 * URL validation and normalization utilities for Temu and Alibaba
 */

/**
 * Tracking parameters to remove from URLs
 */
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "referrer",
  "affiliate_id",
  "aff_id",
  "click_id",
  "gclid",
  "fbclid",
  "twclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gid",
  "spm", // Alibaba-specific
  "scm", // Alibaba-specific
  "trace", // Alibaba-specific
  "tracelog", // Alibaba-specific
] as const;

/**
 * Essential parameters to keep for Temu (product identification)
 */
const TEMU_ESSENTIAL_PARAMS = [
  "goods_id",
  "top_gallery_url",
  "spec_gallery_id",
] as const;

/**
 * Normalize URL by:
 * - Trimming whitespace
 * - Removing tracking query parameters
 * - Preserving essential parameters (for Temu)
 * - Normalizing protocol to https
 * - Normalizing domain (if applicable)
 */
export function normalizeUrl(url: string): string {
  if (!url || typeof url !== "string") {
    return url;
  }

  // Trim whitespace
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    // If URL doesn't start with http:// or https://, try to add https://
    let urlToParse = trimmed;
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      urlToParse = `https://${trimmed}`;
    }

    const urlObj = new URL(urlToParse);

    // Remove tracking parameters
    TRACKING_PARAMS.forEach((param) => {
      urlObj.searchParams.delete(param);
    });

    // Normalize protocol to https
    urlObj.protocol = "https:";

    // Normalize domain for Temu
    if (urlObj.hostname.includes("temu")) {
      urlObj.hostname = "www.temu.com";
    }

    // Normalize domain for Alibaba
    if (urlObj.hostname.includes("alibaba.com")) {
      urlObj.hostname = "www.alibaba.com";
    } else if (urlObj.hostname.includes("1688.com")) {
      urlObj.hostname = "www.1688.com";
    }

    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, return trimmed original
    console.warn(`[URL Validation] Failed to normalize URL: ${trimmed}`, error);
    return trimmed;
  }
}

/**
 * Check if URL is a valid Temu URL
 * @param url - URL to validate
 * @returns true if hostname includes temu.com
 */
export function isValidTemuUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    // Handle URLs without protocol
    let urlToParse = url.trim();
    if (!urlToParse.startsWith("http://") && !urlToParse.startsWith("https://")) {
      urlToParse = `https://${urlToParse}`;
    }

    const urlObj = new URL(urlToParse);
    const hostname = urlObj.hostname.toLowerCase();
    
    return hostname.includes("temu.com") || hostname.includes("temu.");
  } catch {
    // If URL parsing fails, do simple string check
    const normalized = url.toLowerCase();
    return normalized.includes("temu.com") || normalized.includes("temu.");
  }
}

/**
 * Check if URL is a valid Alibaba URL
 * @param url - URL to validate
 * @returns true if hostname includes alibaba.com (best effort: prefers /product-detail/ in path)
 */
export function isValidAlibabaUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    // Handle URLs without protocol
    let urlToParse = url.trim();
    if (!urlToParse.startsWith("http://") && !urlToParse.startsWith("https://")) {
      urlToParse = `https://${urlToParse}`;
    }

    const urlObj = new URL(urlToParse);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check hostname (required)
    return hostname.includes("alibaba.com") || hostname.includes("1688.com");
  } catch {
    // If URL parsing fails, do simple string check
    const normalized = url.toLowerCase();
    return normalized.includes("alibaba.com") || normalized.includes("1688.com");
  }
}

/**
 * Check if Alibaba URL looks like a product detail page
 * @param url - URL to check
 * @returns true if path contains /product-detail/
 */
export function isAlibabaProductUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    let urlToParse = url.trim();
    if (!urlToParse.startsWith("http://") && !urlToParse.startsWith("https://")) {
      urlToParse = `https://${urlToParse}`;
    }

    const urlObj = new URL(urlToParse);
    const pathname = urlObj.pathname.toLowerCase();
    
    return pathname.includes("/product-detail/");
  } catch {
    const normalized = url.toLowerCase();
    return normalized.includes("/product-detail/");
  }
}

/**
 * Validate and normalize a URL for a specific provider
 * @param url - URL to validate and normalize
 * @param provider - Provider type ("temu" | "alibaba")
 * @returns Normalized URL if valid, null otherwise
 */
export function validateAndNormalizeUrl(
  url: string,
  provider: "temu" | "alibaba"
): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  // Validate based on provider
  if (provider === "temu" && !isValidTemuUrl(trimmed)) {
    return null;
  }

  if (provider === "alibaba" && !isValidAlibabaUrl(trimmed)) {
    return null;
  }

  // Normalize
  return normalizeUrl(trimmed);
}

/**
 * Extract essential parameters from Temu URL
 * @param url - Temu URL
 * @returns Object with essential parameters
 */
export function extractTemuParams(url: string): {
  goodsId?: string;
  topGalleryUrl?: string;
  specGalleryId?: string;
} {
  try {
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);
    
    return {
      goodsId: urlObj.searchParams.get("goods_id") || undefined,
      topGalleryUrl: urlObj.searchParams.get("top_gallery_url") || undefined,
      specGalleryId: urlObj.searchParams.get("spec_gallery_id") || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Extract product ID from Alibaba URL
 * @param url - Alibaba URL
 * @returns Product ID if found, null otherwise
 */
export function extractAlibabaProductId(url: string): string | null {
  try {
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);
    const pathname = urlObj.pathname;
    
    // Extract from /product-detail/123456789.html pattern
    const match = pathname.match(/\/product-detail\/(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
    
    return null;
  } catch {
    return null;
  }
}

