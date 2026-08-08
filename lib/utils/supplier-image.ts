/**
 * Helpers for Next/Image + external supplier CDNs.
 */

const SUPPLIER_CDN_HINTS = [
  "cjdropshipping.com",
  "alicdn.com",
  "kwcdn.com",
  "temu.com",
  "ebayimg.com",
  "shopifycdn.com",
  "cdn.shopify.com",
] as const;

/** True when URL is on a known supplier CDN (CJ, Temu, Alibaba, …). */
export function isSupplierCdnUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SUPPLIER_CDN_HINTS.some(
      (hint) => host === hint || host.endsWith(`.${hint}`)
    );
  } catch {
    return /cjdropshipping\.com|alicdn\.com|kwcdn\.com|temu\.com|ebayimg\.com/i.test(
      url
    );
  }
}

/** Prefer Next Image optimizer; CJ/Temu CDNs work via remotePatterns in next.config. */
export function shouldUnoptimizeRemoteImage(
  _url: string | null | undefined
): boolean {
  return false;
}
