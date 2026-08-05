import "server-only";

import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/utils/logger";

const CJ_BASE_URL =
  process.env.CJ_API_BASE_URL?.replace(/\/$/, "") ||
  "https://developers.cjdropshipping.com/api2.0/v1";

const TOKEN_SETTING_KEY = "cj.api.tokens";

type CjTokenBundle = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiryDate: string | null;
  refreshTokenExpiryDate: string | null;
};

type CjApiEnvelope<T> = {
  code?: number;
  result?: boolean;
  success?: boolean;
  message?: string;
  data?: T;
  requestId?: string;
};

export class CjApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: number,
    public requestId?: string
  ) {
    super(message);
    this.name = "CjApiError";
  }
}

function getApiKey(): string | null {
  return process.env.CJ_API_KEY?.trim() || null;
}

export function isCjConfigured(): boolean {
  return Boolean(getApiKey());
}

/** Simple in-memory rate limiter: max N requests per window. */
class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private maxPerWindow: number,
    private windowMs: number
  ) {}

  async waitTurn(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxPerWindow) {
      const wait = this.windowMs - (now - this.timestamps[0]) + 25;
      await new Promise((r) => setTimeout(r, Math.max(wait, 50)));
      return this.waitTurn();
    }
    this.timestamps.push(Date.now());
  }
}

const rateLimiter = new RateLimiter(
  // CJ enforces ~1 QPS — bursting at 8 causes 429 and kills missions
  Number(process.env.CJ_API_RATE_LIMIT || 1),
  Number(process.env.CJ_API_RATE_WINDOW_MS || 1100)
);

const responseCache = new Map<string, { expires: number; value: unknown }>();

async function readStoredTokens(): Promise<CjTokenBundle | null> {
  const row = await prisma.setting.findUnique({ where: { key: TOKEN_SETTING_KEY } });
  if (!row?.value || typeof row.value !== "object") return null;
  const v = row.value as Record<string, unknown>;
  if (typeof v.accessToken !== "string" || typeof v.refreshToken !== "string") return null;
  return {
    accessToken: v.accessToken,
    refreshToken: v.refreshToken,
    accessTokenExpiryDate: typeof v.accessTokenExpiryDate === "string" ? v.accessTokenExpiryDate : null,
    refreshTokenExpiryDate:
      typeof v.refreshTokenExpiryDate === "string" ? v.refreshTokenExpiryDate : null,
  };
}

async function writeStoredTokens(bundle: CjTokenBundle): Promise<void> {
  await prisma.setting.upsert({
    where: { key: TOKEN_SETTING_KEY },
    create: { key: TOKEN_SETTING_KEY, value: bundle },
    update: { value: bundle },
  });
}

function tokenStillValid(expiry: string | null | undefined, skewMs = 60_000): boolean {
  if (!expiry) return false;
  const t = Date.parse(expiry);
  if (!Number.isFinite(t)) return false;
  return t - skewMs > Date.now();
}

async function fetchAccessTokenFromApiKey(): Promise<CjTokenBundle> {
  const apiKey = getApiKey();
  if (!apiKey) throw new CjApiError("CJ_API_KEY mangler i miljøvariabler");

  const res = await fetch(`${CJ_BASE_URL}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const json = (await res.json()) as CjApiEnvelope<{
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiryDate?: string;
    refreshTokenExpiryDate?: string;
  }>;

  if (!res.ok || !json.data?.accessToken || !json.data?.refreshToken) {
    throw new CjApiError(
      json.message || "Kunne ikke hente CJ access token",
      res.status,
      json.code,
      json.requestId
    );
  }

  const bundle: CjTokenBundle = {
    accessToken: json.data.accessToken,
    refreshToken: json.data.refreshToken,
    accessTokenExpiryDate: json.data.accessTokenExpiryDate ?? null,
    refreshTokenExpiryDate: json.data.refreshTokenExpiryDate ?? null,
  };
  await writeStoredTokens(bundle);
  return bundle;
}

async function refreshAccessToken(refreshToken: string): Promise<CjTokenBundle> {
  const res = await fetch(`${CJ_BASE_URL}/authentication/refreshAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const json = (await res.json()) as CjApiEnvelope<{
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiryDate?: string;
    refreshTokenExpiryDate?: string;
  }>;

  if (!res.ok || !json.data?.accessToken) {
    throw new CjApiError(
      json.message || "Kunne ikke refreshe CJ access token",
      res.status,
      json.code,
      json.requestId
    );
  }

  const bundle: CjTokenBundle = {
    accessToken: json.data.accessToken,
    refreshToken: json.data.refreshToken || refreshToken,
    accessTokenExpiryDate: json.data.accessTokenExpiryDate ?? null,
    refreshTokenExpiryDate: json.data.refreshTokenExpiryDate ?? null,
  };
  await writeStoredTokens(bundle);
  return bundle;
}

async function getValidAccessToken(): Promise<string> {
  const stored = await readStoredTokens();
  if (stored && tokenStillValid(stored.accessTokenExpiryDate)) {
    return stored.accessToken;
  }
  if (stored?.refreshToken && tokenStillValid(stored.refreshTokenExpiryDate)) {
    try {
      const refreshed = await refreshAccessToken(stored.refreshToken);
      return refreshed.accessToken;
    } catch (error) {
      logError(error, "[cj:api:refresh]");
    }
  }
  const fresh = await fetchAccessTokenFromApiKey();
  return fresh.accessToken;
}

async function writeApiLog(entry: {
  operation: string;
  method: string;
  path: string;
  statusCode?: number;
  ok: boolean;
  durationMs: number;
  error?: string;
  requestMeta?: unknown;
  responseMeta?: unknown;
}) {
  try {
    await prisma.supplierApiLog.create({
      data: {
        supplier: "cj",
        operation: entry.operation,
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode ?? null,
        ok: entry.ok,
        durationMs: entry.durationMs,
        error: entry.error ?? null,
        requestMeta: entry.requestMeta as object | undefined,
        responseMeta: entry.responseMeta as object | undefined,
      },
    });
  } catch (error) {
    logError(error, "[cj:api:log]");
  }
}

export type CjRequestOptions = {
  operation: string;
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  cacheTtlMs?: number;
  retries?: number;
};

function buildUrl(path: string, query?: CjRequestOptions["query"]): string {
  const url = new URL(`${CJ_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function cjRequest<T>(opts: CjRequestOptions): Promise<T> {
  if (!isCjConfigured()) {
    throw new CjApiError("CJ_API_KEY er ikke konfigurert");
  }

  const method = opts.method || "GET";
  const cacheKey =
    method === "GET" && opts.cacheTtlMs
      ? `${opts.path}?${JSON.stringify(opts.query || {})}`
      : null;

  if (cacheKey) {
    const hit = responseCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      return hit.value as T;
    }
  }

  const retries = opts.retries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    await rateLimiter.waitTurn();
    const started = Date.now();
    const url = buildUrl(opts.path, opts.query);

    try {
      const token = await getValidAccessToken();
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "CJ-Access-Token": token,
        },
        body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
      });

      const durationMs = Date.now() - started;
      const json = (await res.json().catch(() => null)) as CjApiEnvelope<T> | null;

      const ok =
        res.ok &&
        Boolean(json) &&
        (json?.success === true || json?.result === true || json?.code === 200);

      // Non-blocking — logging must not add to CJ search latency / QPS wait
      void writeApiLog({
        operation: opts.operation,
        method,
        path: opts.path,
        statusCode: res.status,
        ok,
        durationMs,
        error: ok ? undefined : json?.message || `HTTP ${res.status}`,
        requestMeta: { query: opts.query, attempt },
        responseMeta: {
          code: json?.code,
          message: json?.message,
          requestId: json?.requestId,
        },
      });

      // Token expired — refresh and retry
      if (res.status === 401 || json?.code === 1600001 || json?.code === 1600002) {
        await fetchAccessTokenFromApiKey();
        lastError = new CjApiError("CJ token utløpt", res.status, json?.code, json?.requestId);
        continue;
      }

      if (!ok) {
        const err = new CjApiError(
          json?.message || `CJ API-feil (${res.status})`,
          res.status,
          json?.code,
          json?.requestId
        );
        // Retry transient errors
        if (res.status >= 500 || res.status === 429) {
          lastError = err;
          const backoff =
            res.status === 429
              ? 1200 * (attempt + 1)
              : 300 * (attempt + 1);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw err;
      }

      const data = (json?.data ?? null) as T;
      if (cacheKey && opts.cacheTtlMs) {
        responseCache.set(cacheKey, { expires: Date.now() + opts.cacheTtlMs, value: data });
      }
      return data;
    } catch (error) {
      lastError = error;
      if (error instanceof CjApiError && error.statusCode && error.statusCode < 500 && error.statusCode !== 429) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new CjApiError("CJ API-forespørsel feilet etter retries");
}
