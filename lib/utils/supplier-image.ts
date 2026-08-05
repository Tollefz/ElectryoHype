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

/** Use unoptimized for supplier CDNs that often block / break Next image optimizer. */
export function shouldUnoptimizeRemoteImage(
  url: string | null | undefined
): boolean {
  return isSupplierCdnUrl(url);
}
