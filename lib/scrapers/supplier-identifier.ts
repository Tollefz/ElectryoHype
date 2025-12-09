import type { SupplierSource } from "./types";

/**
 * Identifiser leverandør basert på URL
 * This file has NO dependencies on Puppeteer or any scrapers
 */
export function identifySupplier(url: string): SupplierSource | null {
  const normalized = url.toLowerCase();
  if (normalized.includes("alibaba.com") || normalized.includes("1688.com")) {
    return "alibaba";
  }
  if (normalized.includes("ebay.com") || normalized.includes("ebay.no") || normalized.includes("ebay.co.uk")) {
    return "ebay";
  }
  if (normalized.includes("temu.com") || normalized.includes("temu.co.uk") || normalized.includes("temu-cdn")) {
    return "temu";
  }
  return null;
}

