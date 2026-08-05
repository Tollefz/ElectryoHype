/**
 * Bulk import top-N ranked Digital Buyer candidates → Import Queue.
 * Never auto-publishes.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { queueRecommendationsToImport } from "@/lib/suppliers/merchandiser/actions";

export async function importTopBuyerCandidates(input: {
  limit: number;
  storeId?: string | null;
  actorEmail?: string | null;
  minShopMatchPct?: number;
  scanRunId?: string | null;
}) {
  const limit = Math.min(500, Math.max(1, input.limit));
  const { resolveBuyerRankingScanId } = await import("@/lib/buyer/scan");
  const scanRunId =
    input.scanRunId !== undefined
      ? input.scanRunId
      : await resolveBuyerRankingScanId(input.storeId);

  const candidates = await prisma.buyerCandidate.findMany({
    where: {
      ...(input.storeId ? { storeId: input.storeId } : {}),
      ...(scanRunId ? { scanRunId } : {}),
      status: "ranked",
      isBestInGroup: true,
      ...(input.minShopMatchPct != null
        ? { shopMatchPct: { gte: input.minShopMatchPct } }
        : {}),
      merchandiserRecId: { not: null },
    },
    orderBy: [{ rank: "asc" }, { shopMatchPct: "desc" }],
    take: limit,
  });

  const recIds = candidates
    .map((c) => c.merchandiserRecId)
    .filter((id): id is string => Boolean(id));

  if (recIds.length === 0) {
    return {
      ok: true as const,
      imported: 0,
      queueItemIds: [] as string[],
      results: [] as Array<{ id: string; ok: boolean }>,
    };
  }

  const results = await queueRecommendationsToImport({
    ids: recIds,
    actorEmail: input.actorEmail || "buyer@electrohypex",
    storeId: input.storeId,
  });

  for (const r of results) {
    if (!r.ok) continue;
    const cand = candidates.find((c) => c.merchandiserRecId === r.id);
    if (!cand) continue;
    await prisma.buyerCandidate.update({
      where: { id: cand.id },
      data: {
        status: "queued",
        importQueueItemId: r.queueItemId || null,
      },
    });
  }

  const queueItemIds = results
    .map((r) => r.queueItemId)
    .filter((id): id is string => Boolean(id));

  return {
    ok: true as const,
    imported: results.filter((r) => r.ok).length,
    queueItemIds,
    results,
  };
}

/** Import specific ranked candidates by id (Desk category «Importer alle»). */
export async function importBuyerCandidatesByIds(input: {
  ids: string[];
  storeId?: string | null;
  actorEmail?: string | null;
}) {
  const ids = Array.from(new Set((input.ids || []).filter(Boolean))).slice(0, 500);
  if (ids.length === 0) {
    return {
      ok: true as const,
      imported: 0,
      queueItemIds: [] as string[],
      results: [] as Array<{ id: string; ok: boolean }>,
    };
  }

  const candidates = await prisma.buyerCandidate.findMany({
    where: {
      id: { in: ids },
      status: "ranked",
      merchandiserRecId: { not: null },
    },
  });

  const recIds = candidates
    .map((c) => c.merchandiserRecId)
    .filter((id): id is string => Boolean(id));

  if (recIds.length === 0) {
    return {
      ok: true as const,
      imported: 0,
      queueItemIds: [] as string[],
      results: [] as Array<{ id: string; ok: boolean }>,
    };
  }

  const results = await queueRecommendationsToImport({
    ids: recIds,
    actorEmail: input.actorEmail || "buyer@electrohypex",
    storeId: input.storeId,
  });

  for (const r of results) {
    if (!r.ok) continue;
    const cand = candidates.find((c) => c.merchandiserRecId === r.id);
    if (!cand) continue;
    await prisma.buyerCandidate.update({
      where: { id: cand.id },
      data: {
        status: "queued",
        importQueueItemId: r.queueItemId || null,
      },
    });
  }

  const queueItemIds = results
    .map((r) => r.queueItemId)
    .filter((id): id is string => Boolean(id));

  return {
    ok: true as const,
    imported: results.filter((r) => r.ok).length,
    queueItemIds,
    results,
  };
}
