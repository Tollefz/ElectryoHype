/**
 * USD→NOK rate with freshness — Economic Validation never prices on a stale FX.
 * Falls back to env / catalog constant when live fetch fails.
 */

import { USD_TO_NOK_RATE } from "@/lib/import/pricing";

export const FX_MAX_AGE_HOURS = 24;

type FxCache = {
  rate: number;
  fetchedAt: string;
  source: "live" | "env" | "fallback";
};

let cache: FxCache | null = null;

function envRate(): number | null {
  const raw = process.env.USD_TO_NOK_RATE || process.env.FX_USD_NOK;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ageHours(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60);
}

function isFresh(c: FxCache | null): boolean {
  if (!c) return false;
  return ageHours(c.fetchedAt) < FX_MAX_AGE_HOURS;
}

/** Sync read — never blocks. Uses cache or env/fallback. */
export function getUsdToNokRateSync(): {
  rate: number;
  fetchedAt: string;
  source: FxCache["source"];
  ageHours: number;
  stale: boolean;
} {
  if (isFresh(cache)) {
    return {
      rate: cache!.rate,
      fetchedAt: cache!.fetchedAt,
      source: cache!.source,
      ageHours: ageHours(cache!.fetchedAt),
      stale: false,
    };
  }
  const fromEnv = envRate();
  const rate = fromEnv ?? USD_TO_NOK_RATE;
  const fetchedAt = new Date().toISOString();
  cache = {
    rate,
    fetchedAt,
    source: fromEnv != null ? "env" : "fallback",
  };
  return {
    rate,
    fetchedAt,
    source: cache.source,
    ageHours: 0,
    stale: false,
  };
}

/**
 * Ensure a fresh rate (≤24h). Tries live Frankfurter; falls back silently.
 */
export async function ensureFreshUsdToNokRate(): Promise<{
  rate: number;
  fetchedAt: string;
  source: FxCache["source"];
  ageHours: number;
  stale: boolean;
}> {
  if (isFresh(cache)) {
    return {
      rate: cache!.rate,
      fetchedAt: cache!.fetchedAt,
      source: cache!.source,
      ageHours: ageHours(cache!.fetchedAt),
      stale: false,
    };
  }

  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=NOK",
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const data = (await res.json()) as { rates?: { NOK?: number } };
      const live = data?.rates?.NOK;
      if (typeof live === "number" && live > 5 && live < 30) {
        cache = {
          rate: Math.round(live * 10000) / 10000,
          fetchedAt: new Date().toISOString(),
          source: "live",
        };
        return {
          rate: cache.rate,
          fetchedAt: cache.fetchedAt,
          source: "live",
          ageHours: 0,
          stale: false,
        };
      }
    }
  } catch {
    /* fall through */
  }

  return getUsdToNokRateSync();
}

export function convertUsdToNok(amount: number, rate?: number): number {
  const r = rate ?? getUsdToNokRateSync().rate;
  return amount * r;
}
