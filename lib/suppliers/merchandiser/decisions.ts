/**
 * Persist admin decisions for future recommendation learning.
 */

import "server-only";

import { Prisma, type MerchandiserDecisionType, type SupplierName } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function recordMerchandiserDecision(input: {
  recommendationId?: string | null;
  supplier: SupplierName | string;
  supplierProductId: string;
  decision: MerchandiserDecisionType;
  reason?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.merchandiserDecision.create({
    data: {
      recommendationId: input.recommendationId || null,
      supplier: input.supplier as SupplierName,
      supplierProductId: input.supplierProductId,
      decision: input.decision,
      reason: input.reason || null,
      actorId: input.actorId || null,
      actorEmail: input.actorEmail || null,
      metadata: (input.metadata || undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Aggregated preference signal for later model tuning. */
export async function getDecisionStats(days = 90) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.merchandiserDecision.groupBy({
    by: ["decision"],
    where: { createdAt: { gte: since } },
    _count: true,
  });
  return Object.fromEntries(rows.map((r) => [r.decision, r._count]));
}
