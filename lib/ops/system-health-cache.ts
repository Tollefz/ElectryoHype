import { createTtlCache } from "@/lib/ops/ttl-cache";

export type CachedHealthPayload = {
  ok: boolean;
  status: "ok" | "degraded" | "down";
  database: string;
  latencyMs: number;
  checkedAt: string;
  reason: string;
  kind: string | null;
  services: unknown[];
  errorsLastHour: number;
  recentErrors: unknown[];
  cached?: boolean;
};

/** Share health probes — healthy 45s, failure 15s */
export const systemHealthCache = createTtlCache<CachedHealthPayload>({
  ttlOkMs: 45_000,
  ttlFailMs: 15_000,
});

export function resetSystemHealthCache() {
  systemHealthCache.invalidate();
}
