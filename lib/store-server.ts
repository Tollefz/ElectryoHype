import { headers } from "next/headers";
import { getStoreIdFromHost, DEFAULT_STORE_ID } from "./store";

type HeaderLike =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

/**
 * Server-side only function to get storeId from headers.
 * Use this in Server Components and API routes.
 * For client components, use DEFAULT_STORE_ID directly or pass headers from server.
 */
export async function getStoreIdFromHeadersServer(): Promise<string> {
  try {
    const h = await headers();
    let host: string | null = null;

    // Try Header-like first
    if (h && typeof (h as any).get === "function") {
      try {
        host = h.get("host");
      } catch {
        host = null;
      }
    }

    // Fallback: try to get host from headers if get() didn't work
    if (!host) {
      try {
        // Try as ReadonlyHeaders (Next.js 16)
        if (h && typeof (h as any).get === "function") {
          host = (h as any).get("host") || null;
        }
      } catch {
        // Ignore
      }
    }

    return getStoreIdFromHost(host);
  } catch {
    // If headers() fails (e.g., in client context), return default
    return DEFAULT_STORE_ID;
  }
}

