/**
 * Merchandiser actions — queue to Import Queue, accept/reject, list, summary.
 */

import "server-only";

import type { MerchandiserRecStatus, SupplierName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCatalogProvider } from "@/lib/suppliers/registry";
import type { CatalogSupplierId } from "@/lib/suppliers/provider";
import { recordMerchandiserDecision } from "@/lib/suppliers/merchandiser/decisions";
import type { MerchandiserShelf } from "@/lib/suppliers/merchandiser/types";

export async function listMerchandiserRecommendations(input: {
  shelf?: MerchandiserShelf | "all";
  status?: MerchandiserRecStatus | "all";
  minScore?: number;
  limit?: number;
  storeId?: string | null;
}) {
  const where: Record<string, unknown> = {};
  if (input.storeId) where.storeId = input.storeId;
  if (input.shelf && input.shelf !== "all") where.shelf = input.shelf;
  if (input.status && input.status !== "all") where.status = input.status;
  else if (!input.status || input.status === "all") {
    where.status = { in: ["suggested", "accepted", "queued"] };
  }
  if (input.minScore != null) where.overallScore = { gte: input.minScore };

  return prisma.merchandiserRecommendation.findMany({
    where,
    orderBy: [{ overallScore: "desc" }, { updatedAt: "desc" }],
    take: Math.min(200, input.limit || 50),
  });
}

export async function getMerchandiserSummary(storeId?: string | null) {
  const where = storeId ? { storeId } : {};
  const [suggested, premium, highMargin, trending, lastScan] = await Promise.all([
    prisma.merchandiserRecommendation.count({
      where: { ...where, status: { in: ["suggested", "accepted"] } },
    }),
    prisma.merchandiserRecommendation.count({
      where: {
        ...where,
        status: { in: ["suggested", "accepted"] },
        overallScore: { gte: 85 },
      },
    }),
    prisma.merchandiserRecommendation.count({
      where: {
        ...where,
        status: { in: ["suggested", "accepted"] },
        // JSON path not portable — approximate via overall + later filter in UI
        overallScore: { gte: 75 },
      },
    }),
    prisma.merchandiserRecommendation.count({
      where: {
        ...where,
        shelf: "trending",
        status: { in: ["suggested", "accepted"] },
      },
    }),
    prisma.merchandiserScanRun.findFirst({
      where: storeId ? { storeId } : undefined,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Refine high-margin count in memory for accuracy
  const candidates = await prisma.merchandiserRecommendation.findMany({
    where: {
      ...where,
      status: { in: ["suggested", "accepted"] },
      overallScore: { gte: 70 },
    },
    select: { pricing: true },
    take: 200,
  });
  const highMarginReal = candidates.filter((c) => {
    const p = c.pricing as { estimatedMarginPct?: number } | null;
    return (p?.estimatedMarginPct || 0) >= 40;
  }).length;

  return {
    suggested,
    premium,
    highMargin: highMarginReal || highMargin,
    trending,
    lastScan: lastScan
      ? {
          id: lastScan.id,
          status: lastScan.status,
          recommended: lastScan.recommended,
          scanned: lastScan.scanned,
          autoQueued: lastScan.autoQueued,
          finishedAt: lastScan.finishedAt,
          createdAt: lastScan.createdAt,
        }
      : null,
  };
}

export async function queueRecommendationsToImport(input: {
  ids: string[];
  actorId?: string | null;
  actorEmail?: string | null;
  storeId?: string | null;
}) {
  const rows = await prisma.merchandiserRecommendation.findMany({
    where: { id: { in: input.ids } },
  });

  const results: Array<{
    id: string;
    ok: boolean;
    queueItemId?: string;
    error?: string;
  }> = [];

  for (const row of rows) {
    try {
      const provider = getCatalogProvider(row.supplier as CatalogSupplierId);
      const imported = await provider.importProducts([row.supplierProductId], {
        createdById: input.actorId,
        createdByEmail: input.actorEmail,
        storeId: input.storeId || row.storeId,
      });
      const queueItemId = imported.queueItemIds[0];
      await prisma.merchandiserRecommendation.update({
        where: { id: row.id },
        data: {
          status: "queued",
          importQueueItemId: queueItemId || null,
        },
      });
      await recordMerchandiserDecision({
        recommendationId: row.id,
        supplier: row.supplier,
        supplierProductId: row.supplierProductId,
        decision: "queue",
        actorId: input.actorId,
        actorEmail: input.actorEmail,
      });
      results.push({ id: row.id, ok: true, queueItemId });
    } catch (error) {
      results.push({
        id: row.id,
        ok: false,
        error: error instanceof Error ? error.message : "Import feilet",
      });
    }
  }

  return results;
}

export async function decideOnRecommendation(input: {
  id: string;
  decision: "accept" | "reject" | "dismiss";
  reason?: string;
  actorId?: string | null;
  actorEmail?: string | null;
}) {
  const statusMap = {
    accept: "accepted",
    reject: "rejected",
    dismiss: "dismissed",
  } as const;

  const row = await prisma.merchandiserRecommendation.update({
    where: { id: input.id },
    data: { status: statusMap[input.decision] },
  });

  await recordMerchandiserDecision({
    recommendationId: row.id,
    supplier: row.supplier as SupplierName,
    supplierProductId: row.supplierProductId,
    decision: input.decision === "accept" ? "accept" : input.decision === "reject" ? "reject" : "dismiss",
    reason: input.reason,
    actorId: input.actorId,
    actorEmail: input.actorEmail,
  });

  try {
    const { recordAiFeedback } = await import("@/lib/trust/feedback");
    await recordAiFeedback({
      storeId: row.storeId,
      engine: "merchandiser",
      kind:
        input.decision === "accept"
          ? "approve"
          : input.decision === "reject"
            ? "reject"
            : "dismiss",
      subjectType: "merchandiser_recommendation",
      subjectKey: row.id,
      aiProposal: {
        title: row.title,
        overallScore: row.overallScore,
        categoryHint: row.categoryHint,
      },
      confidence: row.overallScore,
      why: Array.isArray(row.reasons) ? (row.reasons as string[]) : undefined,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
    });
  } catch {
    /* trust layer optional */
  }

  return row;
}
