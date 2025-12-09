import { headers } from "next/headers";

const DEFAULT_STORE_ID = process.env.DEFAULT_STORE_ID || "electrohype";

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

export function getStoreIdFromHeaders(hdrs?: HeaderLike): string {
  const h = hdrs ?? headers();
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

