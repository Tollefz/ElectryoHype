/**
 * Apply approved improvements — never without admin approval.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeProductQuality } from "@/lib/improve/quality";
import { recordAiFeedback } from "@/lib/trust/feedback";

export async function decideImprovement(input: {
  id: string;
  decision: "approved" | "rejected";
  actorEmail?: string | null;
}) {
  const row = await prisma.storeImprovement.findUnique({ where: { id: input.id } });
  if (!row) throw new Error("Forbedring ikke funnet");
  if (row.status !== "pending") throw new Error("Allerede behandlet");

  if (input.decision === "rejected") {
    await prisma.storeImprovement.update({
      where: { id: input.id },
      data: { status: "rejected", decidedAt: new Date() },
    });
    await recordAiFeedback({
      engine: "autonomy",
      kind: "reject",
      subjectType: "store_improvement",
      subjectKey: input.id,
      actorEmail: input.actorEmail,
      aiProposal: (row.proposed as Record<string, unknown>) || undefined,
    }).catch(() => undefined);
    return { id: input.id, status: "rejected" as const };
  }

  await prisma.storeImprovement.update({
    where: { id: input.id },
    data: { status: "approved", decidedAt: new Date() },
  });

  const applied = await applyImprovement(input.id, input.actorEmail);
  return applied;
}

export async function applyImprovement(
  id: string,
  actorEmail?: string | null
) {
  const row = await prisma.storeImprovement.findUnique({ where: { id } });
  if (!row) throw new Error("Forbedring ikke funnet");
  if (!row.productId) throw new Error("Mangler productId");

  const product = await prisma.product.findUnique({ where: { id: row.productId } });
  if (!product) throw new Error("Produkt mangler");

  const proposed = (row.proposed || {}) as Record<string, unknown>;
  const beforeSnap: Record<string, unknown> = {};
  const afterSnap: Record<string, unknown> = {};
  const data: Prisma.ProductUpdateInput = {};

  if (row.kind === "seo") {
    beforeSnap.metaTitle = product.metaTitle;
    beforeSnap.metaDescription = product.metaDescription;
    if (typeof proposed.metaTitle === "string") {
      data.metaTitle = proposed.metaTitle;
      afterSnap.metaTitle = proposed.metaTitle;
    }
    if (typeof proposed.metaDescription === "string") {
      data.metaDescription = proposed.metaDescription;
      afterSnap.metaDescription = proposed.metaDescription;
    }
  }

  if (row.kind === "description" && typeof proposed.shortDescription === "string") {
    beforeSnap.shortDescription = product.shortDescription;
    data.shortDescription = proposed.shortDescription;
    afterSnap.shortDescription = proposed.shortDescription;
  }

  if (row.kind === "price" && typeof proposed.price === "number") {
    beforeSnap.price = product.price;
    data.price = proposed.price;
    afterSnap.price = proposed.price;
  }

  if (row.kind === "category" && typeof proposed.category === "string") {
    beforeSnap.category = product.category;
    data.category = proposed.category;
    afterSnap.category = proposed.category;
  }

  if (row.kind === "retire_unpublish" || row.kind === "retire_archive") {
    beforeSnap.isActive = product.isActive;
    data.isActive = false;
    afterSnap.isActive = false;
    if (typeof proposed.buyerLifecycle === "string") {
      data.buyerLifecycle = proposed.buyerLifecycle;
      afterSnap.buyerLifecycle = proposed.buyerLifecycle;
    }
  }

  if (row.kind === "retire_replace") {
    beforeSnap.buyerLifecycle = product.buyerLifecycle;
    data.buyerLifecycle = "replace_candidate";
    afterSnap.buyerLifecycle = "replace_candidate";
  }

  if (Object.keys(data).length) {
    await prisma.product.update({ where: { id: product.id }, data });
  }

  const refreshed = await prisma.product.findUnique({ where: { id: product.id } });
  let qualityAfter: number | null = null;
  if (refreshed) {
    const q = computeProductQuality(refreshed);
    qualityAfter = q.total;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        qualityScore: q.total,
        qualityBreakdown: q as unknown as Prisma.InputJsonValue,
        qualityScoredAt: new Date(),
      },
    });
    beforeSnap.qualityScore = product.qualityScore;
    afterSnap.qualityScore = q.total;
  }

  const impact = { before: beforeSnap, after: afterSnap, qualityAfter };

  await prisma.storeImprovement.update({
    where: { id },
    data: {
      status: "applied",
      appliedAt: new Date(),
      impact: impact as Prisma.InputJsonValue,
    },
  });

  if (row.missionId) {
    await prisma.storeMission.update({
      where: { id: row.missionId },
      data: { progressDone: { increment: 1 } },
    });
  }

  await recordAiFeedback({
    engine: "autonomy",
    kind: "approve",
    subjectType: "store_improvement",
    subjectKey: id,
    actorEmail,
    aiProposal: proposed,
    humanResult: afterSnap,
    confidence: row.confidence,
  }).catch(() => undefined);

  return { id, status: "applied" as const, impact };
}
