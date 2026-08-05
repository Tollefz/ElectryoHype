/**
 * Cached operational snapshot — one truth, cheap to re-read.
 */

import "server-only";

import { createTtlCache } from "@/lib/ops/ttl-cache";
import type { AdminTruth, PipelineCounts, CatalogTruth } from "@/lib/ops/admin-truth";

export type AdminSnapshot = {
  generatedAt: string;
  fromCache: boolean;
  pipeline: PipelineCounts;
  catalog: CatalogTruth;
  activity24h: AdminTruth["activity24h"];
  activity7d: AdminTruth["activity7d"];
};

const truthCache = createTtlCache<AdminTruth>({
  ttlOkMs: 30_000,
  ttlFailMs: 10_000,
});

const pipelineCache = createTtlCache<PipelineCounts>({
  ttlOkMs: 8_000,
  ttlFailMs: 5_000,
});

export function invalidateAdminSnapshot() {
  truthCache.invalidate();
  pipelineCache.invalidate();
}

export async function getCachedPipelineCounts(
  ids?: string[] | null
): Promise<PipelineCounts> {
  // Batches are id-specific — never share cache across different id sets
  if (ids && ids.length > 0) {
    const { getPipelineCounts } = await import("@/lib/ops/admin-truth");
    return getPipelineCounts(ids);
  }
  return pipelineCache.getOrSet("pipeline", async () => {
    const { getPipelineCounts } = await import("@/lib/ops/admin-truth");
    return getPipelineCounts();
  });
}

export async function getAdminSnapshot(opts?: {
  storeId?: string | null;
  force?: boolean;
}): Promise<AdminSnapshot> {
  const key = `truth:${opts?.storeId || "default"}`;
  if (opts?.force) truthCache.invalidate(key);

  const hit = truthCache.get(key);
  if (hit && !opts?.force) {
    return { ...hit, fromCache: true };
  }

  const truth = await truthCache.getOrSet(key, async () => {
    const { getAdminTruth } = await import("@/lib/ops/admin-truth");
    return getAdminTruth({ storeId: opts?.storeId });
  });

  // Keep pipeline cache warm from full truth
  pipelineCache.set("pipeline", truth.pipeline, true);

  return { ...truth, fromCache: Boolean(hit) };
}

/** Test/export hooks */
export function __adminSnapshotCaches() {
  return { truthCache, pipelineCache };
}
