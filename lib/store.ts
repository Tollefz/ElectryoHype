/**
 * DEFAULT_STORE_ID determines which products are shown on /products
 * 
 * Priority order:
 * 1. Environment variable DEFAULT_STORE_ID
 * 2. "default-store" (Electro Hype electronics catalog - primary store)
 * 
 * NOTE: Demo products from seed.ts use "demo-store" and will NOT appear unless explicitly queried
 * NOTE: Sport/training products should be migrated to "demo-store" to keep them separate
 * NOTE: If you see wrong products, check /api/debug/store-ids to see available storeIds
 * 
 * CURRENT STATE: Based on /api/debug/store-ids, only "default-store" exists in production.
 * Sport/Klær products should be migrated to "demo-store" using scripts/migrate-sport-to-demo.ts
 */
const DEFAULT_STORE_ID = process.env.DEFAULT_STORE_ID || "default-store";

// Simple host -> storeId map. Extend with env or DB later.
const HOST_STORE_MAP: Record<string, string> = {
  "localhost:3000": DEFAULT_STORE_ID,
  "127.0.0.1:3000": DEFAULT_STORE_ID,
};

export function getStoreIdFromHost(host?: string | null): string {
  if (!host) return DEFAULT_STORE_ID;
  const lower = host.toLowerCase();
  return HOST_STORE_MAP[lower] || DEFAULT_STORE_ID;
}

type HeaderLike =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

/**
 * Get storeId from headers object (works in both server and client).
 * For server components, use getStoreIdFromHeadersServer() from './store-server' instead.
 */
export function getStoreIdFromHeaders(hdrs?: HeaderLike): string {
  // If headers are provided, use them (works in both server and client)
  const h = hdrs;
  
  let host: string | null = null;

  // Try Header-like first
  if (h && typeof (h as any).get === "function") {
    try {
      host = (h as Headers).get("host");
    } catch {
      host = null;
    }
  }

  // Fallback plain object lookup
  if (!host && h && typeof h === "object") {
    const raw = (h as Record<string, string | string[] | undefined>)["host"];
    if (Array.isArray(raw)) {
      host = raw[0] || null;
    } else if (typeof raw === "string") {
      host = raw;
    }
  }

  return getStoreIdFromHost(host);
}

export { DEFAULT_STORE_ID };

